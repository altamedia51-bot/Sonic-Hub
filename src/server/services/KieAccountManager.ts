import { dbStore, KieAccountDoc } from '../db';
import { decryptApiKey } from '../encryption';
import { kieSunoProvider } from '../providers/KieSunoProvider';
import { CreateMusicInput, CreateMusicResult } from '../providers/MusicProvider';

export class KieAccountManager {
  /**
   * Retrieves an eligible KIE account based on:
   * 1. ACTIVE status
   * 2. Cooldown expired
   * 3. Within daily limit
   * 4. Within max concurrent jobs
   * 5. Priority sorted
   */
  async getAvailableAccount(excludedAccountIds: string[] = []): Promise<{ account: KieAccountDoc; decryptedKey: string } | null> {
    const allAccounts = await dbStore.getKieAccounts();
    const now = new Date();

    const eligible = allAccounts.filter(acc => {
      if (excludedAccountIds.includes(acc.id)) return false;
      if (acc.status !== 'ACTIVE' && acc.status !== 'RATE_LIMITED') return false;

      // Check cooldown
      if (acc.cooldownUntil) {
        const cooldownDate = new Date(acc.cooldownUntil);
        if (cooldownDate > now) {
          return false; // Still in cooldown
        }
      }

      // Check daily limit
      if (acc.dailyLimit > 0 && acc.usageToday >= acc.dailyLimit) {
        return false;
      }

      // Check concurrency
      if (acc.maxConcurrentJobs > 0 && acc.activeJobs >= acc.maxConcurrentJobs) {
        return false;
      }

      // If account live credits are known and less than 10 (Suno generation minimum is 10-12 credits), skip
      if (typeof acc.credits === 'number' && acc.credits < 10) {
        return false;
      }

      return true;
    });

    if (eligible.length === 0) {
      return null;
    }

    // Sort by priority (descending), then active jobs (ascending), then least recently used
    eligible.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      if (a.activeJobs !== b.activeJobs) {
        return a.activeJobs - b.activeJobs;
      }
      const aTime = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
      const bTime = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
      return aTime - bTime;
    });

    const chosen = eligible[0];

    // Priority: use direct plain apiKey if present, or decrypt encryptedApiKey
    let keyToUse = chosen.apiKey || chosen.encryptedApiKey || '';
    let decryptedKey = '';
    try {
      decryptedKey = decryptApiKey(keyToUse);
    } catch {
      decryptedKey = keyToUse;
    }

    // Sanitize any Bearer prefixes, quotes, extra whitespace
    const cleanKey = decryptedKey
      .replace(/^Bearer\s+/i, '')
      .replace(/^["']|["']$/g, '')
      .trim();

    if (!cleanKey) {
      console.warn(`[KieAccountManager] No valid API key found for account ${chosen.id}`);
      return this.getAvailableAccount([...excludedAccountIds, chosen.id]);
    }

    return { account: chosen, decryptedKey: cleanKey };
  }

  /**
   * Dispatches music creation with automatic multi-account failover
   */
  async submitWithFailover(
    input: CreateMusicInput, 
    maxRetries = 2
  ): Promise<{ result: CreateMusicResult; accountUsed?: KieAccountDoc }> {
    const triedAccounts: string[] = [];
    let attempts = 0;
    let lastResult: CreateMusicResult = {
      success: false,
      error: {
        code: 'NO_ACTIVE_ACCOUNTS',
        message: 'No active KIE.ai provider accounts configured or available.',
        retryable: false
      }
    };

    while (attempts <= maxRetries) {
      attempts++;
      const available = await this.getAvailableAccount(triedAccounts);

      if (!available) {
        if (triedAccounts.length === 0) {
          return {
            result: {
              success: false,
              error: {
                code: 'PROVIDER_NOT_CONFIGURED',
                message: 'No KIE.ai music provider accounts configured. Please add one in Admin settings.',
                retryable: false
              }
            }
          };
        }
        break; // Exhausted accounts
      }

      const { account, decryptedKey } = available;
      triedAccounts.push(account.id);

      // Increment active jobs count
      await dbStore.upsertKieAccount({
        ...account,
        activeJobs: account.activeJobs + 1,
        usageToday: account.usageToday + 1,
        lastUsedAt: new Date().toISOString()
      });

      console.log(`[KieAccountManager] Submitting to KIE using account: ${account.name} (Attempt ${attempts})`);

      const res = await kieSunoProvider.createMusic(input, decryptedKey);

      // Decrement active jobs count
      const updatedAccount = await dbStore.getKieAccount(account.id);
      const currentActive = Math.max(0, (updatedAccount?.activeJobs || 1) - 1);

      if (res.success && res.taskId) {
        // Successful submission!
        await dbStore.upsertKieAccount({
          ...(updatedAccount || account),
          activeJobs: currentActive,
          status: 'ACTIVE',
          failureCount: 0,
          lastError: null
        });

        await dbStore.addLog({
          id: `log_${Date.now()}`,
          level: 'info',
          category: 'GENERATION',
          message: `Job task ${res.taskId} accepted by KIE provider via ${account.name}`,
          provider: 'KIE_SUNO',
          providerAccountId: account.id,
          createdAt: new Date().toISOString()
        });

        return { result: res, accountUsed: account };
      }

      // Failure handling
      lastResult = res;
      const err = res.error;
      const isRateLimit = err?.code === 'RATE_LIMITED' || err?.statusCode === 429;
      const isAuthError = err?.code === 'AUTH_FAILED' || err?.statusCode === 401 || err?.statusCode === 403;
      const isInsufficientCredits = err?.code === 'INSUFFICIENT_PROVIDER_CREDITS' || 
        (err?.message && (
          err.message.toLowerCase().includes('credits insufficient') || 
          err.message.toLowerCase().includes("balance isn't enough") || 
          err.message.toLowerCase().includes('insufficient')
        ));

      console.warn(`[KieAccountManager] Account ${account.name} error:`, err?.code, err?.message);

      if (isInsufficientCredits) {
        console.warn(`[KieAccountManager] Account ${account.name} has depleted credits. Marking EXHAUSTED and rotating to next account.`);
        await dbStore.upsertKieAccount({
          ...(updatedAccount || account),
          activeJobs: currentActive,
          status: 'EXHAUSTED',
          credits: 0,
          lastError: `Credits exhausted: ${err?.message}`,
          failureCount: account.failureCount + 1
        });
        // Continue failover loop to try next account!
        continue;
      } else if (isRateLimit) {
        // Cooldown for 60 seconds
        const cooldownUntil = new Date(Date.now() + 60 * 1000).toISOString();
        await dbStore.upsertKieAccount({
          ...(updatedAccount || account),
          activeJobs: currentActive,
          status: 'RATE_LIMITED',
          cooldownUntil,
          lastError: `Rate limit hit: ${err?.message}`,
          failureCount: account.failureCount + 1
        });
      } else if (isAuthError) {
        // Disable account due to invalid credentials
        await dbStore.upsertKieAccount({
          ...(updatedAccount || account),
          activeJobs: currentActive,
          status: 'ERROR',
          lastError: `Auth failure: ${err?.message}`,
          failureCount: account.failureCount + 1
        });
      } else {
        await dbStore.upsertKieAccount({
          ...(updatedAccount || account),
          activeJobs: currentActive,
          lastError: err?.message,
          failureCount: account.failureCount + 1
        });
      }

      await dbStore.addLog({
        id: `log_${Date.now()}`,
        level: 'warn',
        category: 'PROVIDER_ERROR',
        message: `KIE account ${account.name} failed: [${err?.code}] ${err?.message}`,
        provider: 'KIE_SUNO',
        providerAccountId: account.id,
        createdAt: new Date().toISOString()
      });

      // If error is not retryable (e.g. malformed user lyrics or bad model), don't failover
      if (err && !err.retryable) {
        break;
      }
    }

    return { result: lastResult };
  }
}

export const kieAccountManager = new KieAccountManager();
