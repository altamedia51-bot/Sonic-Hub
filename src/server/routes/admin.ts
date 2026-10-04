import { Router, Request, Response } from 'express';
import { dbStore, KieAccountDoc } from '../db';
import { encryptApiKey, maskApiKey, decryptApiKey } from '../encryption';
import { kieSunoProvider } from '../providers/KieSunoProvider';
import { creditService } from '../services/CreditService';

export const adminRouter = Router();

/**
 * Middleware to verify admin privileges
 */
async function requireAdmin(req: Request, res: Response, next: () => void) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const userEmailHeader = (req.headers['x-user-email'] as string) || '';
  const userIdHeader = (req.headers['x-user-id'] as string) || '';

  let user = null;
  if (userIdHeader) user = await dbStore.getUser(userIdHeader);
  if (!user && userEmailHeader) user = await dbStore.getUser(userEmailHeader);
  if (!user && token) user = await dbStore.getUser(token);

  // If user is altamedia51@gmail.com, grant admin
  if (user?.role === 'admin' || userEmailHeader.toLowerCase() === 'altamedia51@gmail.com') {
    return next();
  }

  // Allow localhost/development initial setup
  if (process.env.NODE_ENV !== 'production' && !user) {
    const adminUser = await dbStore.getUser('altamedia51@gmail.com');
    if (adminUser) return next();
  }

  return res.status(403).json({
    success: false,
    code: 'ADMIN_ACCESS_REQUIRED',
    message: 'Administrator privileges required for this action.'
  });
}

adminRouter.use(requireAdmin);

// GET /api/admin/stats
adminRouter.get('/stats', async (_req: Request, res: Response) => {
  const users = await dbStore.getAllUsers();
  const jobs = await dbStore.getAllJobs();
  const accounts = await dbStore.getKieAccounts();

  const totalUsers = users.length;
  const activeUsers = users.filter(u => u.status === 'active').length;

  const totalJobs = jobs.length;
  const completedJobs = jobs.filter(j => j.status === 'COMPLETED').length;
  const processingJobs = jobs.filter(j => j.status === 'PROCESSING' || j.status === 'SUBMITTING').length;
  const queuedJobs = jobs.filter(j => j.status === 'QUEUED').length;
  const failedJobs = jobs.filter(j => j.status === 'FAILED').length;

  // Credits used
  const creditsUsed = jobs
    .filter(j => j.status === 'COMPLETED')
    .reduce((sum, j) => sum + (j.creditReservation || 0), 0);

  // Today's generations
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayJobs = jobs.filter(j => j.createdAt.startsWith(todayStr)).length;

  // KIE Accounts status
  const activeAccounts = accounts.filter(a => a.status === 'ACTIVE').length;
  const unhealthyAccounts = accounts.filter(a => a.status === 'ERROR' || a.status === 'RATE_LIMITED').length;

  return res.status(200).json({
    success: true,
    stats: {
      totalUsers,
      activeUsers,
      totalJobs,
      completedJobs,
      processingJobs,
      queuedJobs,
      failedJobs,
      creditsUsed,
      todayJobs,
      activeAccounts,
      unhealthyAccounts
    }
  });
});

// GET /api/admin/kie-accounts
adminRouter.get('/kie-accounts', async (_req: Request, res: Response) => {
  const accounts = await dbStore.getKieAccounts();
  // Strip encryptedApiKey before sending to frontend! Never leak encrypted key.
  const safeAccounts = accounts.map(({ encryptedApiKey, ...safe }) => safe);
  return res.status(200).json({ success: true, accounts: safeAccounts });
});

// POST /api/admin/kie-accounts
adminRouter.post('/kie-accounts', async (req: Request, res: Response) => {
  const { name, apiKey, priority, dailyLimit, maxConcurrentJobs, status } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: 'Account name is required' });
  }

  if (!apiKey || !apiKey.trim()) {
    return res.status(400).json({ success: false, message: 'API key is required' });
  }

  const cleanKey = apiKey.trim();
  const encrypted = encryptApiKey(cleanKey);
  const masked = maskApiKey(cleanKey);
  const id = `kie_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  const newAccount: KieAccountDoc = {
    id,
    name: name.trim(),
    encryptedApiKey: encrypted,
    maskedApiKey: masked,
    status: status || 'ACTIVE',
    priority: Number(priority) || 1,
    dailyLimit: Number(dailyLimit) || 0,
    usageToday: 0,
    maxConcurrentJobs: Number(maxConcurrentJobs) || 3,
    activeJobs: 0,
    failureCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await dbStore.upsertKieAccount(newAccount);

  await dbStore.addLog({
    id: `log_${Date.now()}`,
    level: 'info',
    category: 'ADMIN',
    message: `Admin added KIE Account: ${name.trim()} (${masked})`,
    provider: 'KIE_SUNO',
    providerAccountId: id,
    createdAt: new Date().toISOString()
  });

  const { encryptedApiKey, ...safe } = newAccount;
  return res.status(201).json({ success: true, account: safe });
});

// PATCH /api/admin/kie-accounts/:id
adminRouter.patch('/kie-accounts/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = await dbStore.getKieAccount(id);

  if (!existing) {
    return res.status(404).json({ success: false, message: 'Account not found' });
  }

  const { name, priority, dailyLimit, maxConcurrentJobs, status, newApiKey } = req.body;
  const updates: Partial<KieAccountDoc> = {};

  if (name !== undefined) updates.name = name.trim();
  if (priority !== undefined) updates.priority = Number(priority);
  if (dailyLimit !== undefined) updates.dailyLimit = Number(dailyLimit);
  if (maxConcurrentJobs !== undefined) updates.maxConcurrentJobs = Number(maxConcurrentJobs);
  if (status !== undefined) updates.status = status;

  // Key rotation if newApiKey provided
  if (newApiKey && typeof newApiKey === 'string' && newApiKey.trim().length > 0) {
    const cleanKey = newApiKey.trim();
    updates.encryptedApiKey = encryptApiKey(cleanKey);
    updates.maskedApiKey = maskApiKey(cleanKey);
    updates.failureCount = 0;
    updates.lastError = null;
    if (!status) updates.status = 'ACTIVE';

    await dbStore.addLog({
      id: `log_${Date.now()}`,
      level: 'info',
      category: 'ADMIN',
      message: `Admin rotated API key for KIE account: ${existing.name}`,
      providerAccountId: id,
      createdAt: new Date().toISOString()
    });
  }

  const updated = await dbStore.upsertKieAccount({ ...existing, ...updates });
  const { encryptedApiKey, ...safe } = updated;
  return res.status(200).json({ success: true, account: safe });
});

// DELETE /api/admin/kie-accounts/:id
adminRouter.delete('/kie-accounts/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = await dbStore.getKieAccount(id);
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Account not found' });
  }

  await dbStore.deleteKieAccount(id);

  await dbStore.addLog({
    id: `log_${Date.now()}`,
    level: 'warn',
    category: 'ADMIN',
    message: `Admin deleted KIE account: ${existing.name}`,
    providerAccountId: id,
    createdAt: new Date().toISOString()
  });

  return res.status(200).json({ success: true, message: 'Account deleted' });
});

// POST /api/admin/kie-accounts/:id/test
adminRouter.post('/kie-accounts/:id/test', async (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = await dbStore.getKieAccount(id);
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Account not found' });
  }

  try {
    const decryptedKey = decryptApiKey(existing.encryptedApiKey);
    const testResult = await kieSunoProvider.testConnection(decryptedKey);

    if (testResult.success) {
      await dbStore.upsertKieAccount({
        ...existing,
        status: existing.status === 'ERROR' ? 'ACTIVE' : existing.status,
        lastError: null
      });
    } else {
      await dbStore.upsertKieAccount({
        ...existing,
        lastError: testResult.message
      });
    }

    return res.status(200).json({
      success: testResult.success,
      message: testResult.message
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: `Connection test error: ${err.message}`
    });
  }
});

// GET /api/admin/users
adminRouter.get('/users', async (_req: Request, res: Response) => {
  const users = await dbStore.getAllUsers();
  return res.status(200).json({ success: true, users });
});

// POST /api/admin/users/:id/credits
adminRouter.post('/users/:id/credits', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { amount, reason } = req.body;

  if (amount === undefined || isNaN(Number(amount))) {
    return res.status(400).json({ success: false, message: 'Valid amount is required' });
  }

  const updatedUser = await creditService.grantCredits(
    id, 
    Number(amount), 
    reason || 'Admin manual credit adjustment'
  );

  if (!updatedUser) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  await dbStore.addLog({
    id: `log_${Date.now()}`,
    level: 'info',
    category: 'ADMIN',
    message: `Admin adjusted credits for ${updatedUser.email}: ${amount > 0 ? '+' : ''}${amount} (${reason || 'Manual adjustment'})`,
    userId: id,
    createdAt: new Date().toISOString()
  });

  return res.status(200).json({ success: true, user: updatedUser });
});

// POST /api/admin/users/:id/suspend
adminRouter.post('/users/:id/suspend', async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = await dbStore.getUser(id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  const updated = await dbStore.upsertUser({ ...user, status: 'suspended' });

  await dbStore.addLog({
    id: `log_${Date.now()}`,
    level: 'warn',
    category: 'ADMIN',
    message: `Admin suspended user ${user.email}`,
    userId: id,
    createdAt: new Date().toISOString()
  });

  return res.status(200).json({ success: true, user: updated });
});

// POST /api/admin/users/:id/activate
adminRouter.post('/users/:id/activate', async (req: Request, res: Response) => {
  const { id } = req.params;
  const user = await dbStore.getUser(id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  const updated = await dbStore.upsertUser({ ...user, status: 'active' });

  await dbStore.addLog({
    id: `log_${Date.now()}`,
    level: 'info',
    category: 'ADMIN',
    message: `Admin activated user ${user.email}`,
    userId: id,
    createdAt: new Date().toISOString()
  });

  return res.status(200).json({ success: true, user: updated });
});

// GET /api/admin/generations
adminRouter.get('/generations', async (_req: Request, res: Response) => {
  const jobs = await dbStore.getAllJobs();
  const users = await dbStore.getAllUsers();
  const userMap = new Map(users.map(u => [u.id, u.email]));

  const enriched = jobs.map(j => ({
    ...j,
    userEmail: userMap.get(j.userId) || j.userId
  }));

  return res.status(200).json({ success: true, jobs: enriched });
});

// GET /api/admin/logs
adminRouter.get('/logs', async (_req: Request, res: Response) => {
  const logs = await dbStore.getLogs(150);
  return res.status(200).json({ success: true, logs });
});

// GET /api/admin/settings
adminRouter.get('/settings', async (_req: Request, res: Response) => {
  const settings = await dbStore.getSettings();
  return res.status(200).json({ success: true, settings });
});

// POST /api/admin/settings
adminRouter.post('/settings', async (req: Request, res: Response) => {
  const updates = req.body;
  const updated = await dbStore.updateSettings(updates);

  await dbStore.addLog({
    id: `log_${Date.now()}`,
    level: 'info',
    category: 'ADMIN',
    message: 'Admin updated platform settings',
    createdAt: new Date().toISOString()
  });

  return res.status(200).json({ success: true, settings: updated });
});
