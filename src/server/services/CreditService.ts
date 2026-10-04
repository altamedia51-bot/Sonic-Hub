import { dbStore, UserDoc, CreditTransactionDoc } from '../db';

export class CreditService {
  /**
   * Reserves credits for a job. Fails if user has insufficient credits.
   */
  async reserveCredits(userId: string, jobId: string, amount: number): Promise<{ success: boolean; error?: string }> {
    const user = await dbStore.getUser(userId);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    if (user.status !== 'active') {
      return { success: false, error: 'User account is suspended' };
    }

    if (user.credits < amount) {
      return { 
        success: false, 
        error: `Insufficient credits. Required: ${amount}, Available: ${user.credits}` 
      };
    }

    const balanceBefore = user.credits;
    const balanceAfter = balanceBefore - amount;

    // Deduct reserved amount from available balance
    await dbStore.upsertUser({
      ...user,
      credits: balanceAfter
    });

    // Record transaction
    const tx: CreditTransactionDoc = {
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId,
      jobId,
      type: 'RESERVATION',
      amount,
      balanceBefore,
      balanceAfter,
      reason: `Credit reserved for job ${jobId}`,
      createdAt: new Date().toISOString()
    };
    await dbStore.addTransaction(tx);

    return { success: true };
  }

  /**
   * Finalizes the reserved credits once job completes
   */
  async finalizeCredits(userId: string, jobId: string, amount: number): Promise<void> {
    const user = await dbStore.getUser(userId);
    if (!user) return;

    // Record finalization ledger entry
    const tx: CreditTransactionDoc = {
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId,
      jobId,
      type: 'GENERATION',
      amount,
      balanceBefore: user.credits,
      balanceAfter: user.credits,
      reason: `Generation finalized for job ${jobId}`,
      createdAt: new Date().toISOString()
    };
    await dbStore.addTransaction(tx);
  }

  /**
   * Refunds reserved credits if provider generation failed.
   * Guaranteed idempotent: checks if already refunded.
   */
  async refundCredits(userId: string, jobId: string, amount: number, reason: string): Promise<boolean> {
    const existingTxs = await dbStore.getUserTransactions(userId);
    const alreadyRefunded = existingTxs.some(t => t.jobId === jobId && t.type === 'REFUND');
    if (alreadyRefunded) {
      console.log(`[CreditService] Job ${jobId} already refunded, skipping duplicate refund.`);
      return false;
    }

    const user = await dbStore.getUser(userId);
    if (!user) return false;

    const balanceBefore = user.credits;
    const balanceAfter = balanceBefore + amount;

    await dbStore.upsertUser({
      ...user,
      credits: balanceAfter
    });

    const tx: CreditTransactionDoc = {
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId,
      jobId,
      type: 'REFUND',
      amount,
      balanceBefore,
      balanceAfter,
      reason: `Refund: ${reason}`,
      createdAt: new Date().toISOString()
    };
    await dbStore.addTransaction(tx);

    return true;
  }

  /**
   * Admin credit adjustment / grant
   */
  async grantCredits(userId: string, amount: number, reason: string): Promise<UserDoc | null> {
    const user = await dbStore.getUser(userId);
    if (!user) return null;

    const balanceBefore = user.credits;
    const balanceAfter = balanceBefore + amount;

    const updated = await dbStore.upsertUser({
      ...user,
      credits: balanceAfter
    });

    const tx: CreditTransactionDoc = {
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId,
      type: amount >= 0 ? 'ADMIN_GRANT' : 'ADJUSTMENT',
      amount,
      balanceBefore,
      balanceAfter,
      reason,
      createdAt: new Date().toISOString()
    };
    await dbStore.addTransaction(tx);

    return updated;
  }
}

export const creditService = new CreditService();
