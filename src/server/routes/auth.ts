import { Router, Request, Response } from 'express';
import { dbStore, UserDoc } from '../db';

export const authRouter = Router();

async function getRealAdminKieCredits(): Promise<number> {
  const accounts = await dbStore.getKieAccounts();
  const active = accounts.filter(a => a.status === 'ACTIVE');
  return active.reduce((sum, a) => sum + (a.credits || 0), 0);
}

// POST /api/auth/sync
authRouter.post('/sync', async (req: Request, res: Response) => {
  try {
    const { uid, email, name } = req.body;

    if (!uid || !email) {
      return res.status(400).json({ success: false, message: 'uid and email required' });
    }

    const settings = await dbStore.getSettings();
    let existing = await dbStore.getUser(uid);

    if (!existing) {
      existing = await dbStore.getUser(email);
    }

    const isSystemAdmin = email.toLowerCase() === 'altamedia51@gmail.com';
    const adminCredits = isSystemAdmin ? await getRealAdminKieCredits() : settings.defaultUserCredit;

    if (!existing) {
      const newUser: UserDoc = {
        id: uid,
        email: email.toLowerCase(),
        name: name || email.split('@')[0],
        role: isSystemAdmin ? 'admin' : 'user',
        status: 'active',
        credits: adminCredits,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      const created = await dbStore.upsertUser(newUser);
      return res.status(200).json({ success: true, user: created });
    }

    // If existing admin, update role and synchronize with real KIE credits
    if (isSystemAdmin) {
      existing.role = 'admin';
      existing.credits = await getRealAdminKieCredits();
      existing = await dbStore.upsertUser(existing);
    }

    return res.status(200).json({ success: true, user: existing });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/auth/me
authRouter.get('/me', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const userIdHeader = (req.headers['x-user-id'] as string) || '';
  const userEmailHeader = (req.headers['x-user-email'] as string) || '';

  let user = null;
  if (userIdHeader) user = await dbStore.getUser(userIdHeader);
  if (!user && userEmailHeader) user = await dbStore.getUser(userEmailHeader);
  if (!user && token) user = await dbStore.getUser(token);

  if (!user) {
    // Default fallback to altamedia admin for ease of use in demo/dev
    user = await dbStore.getUser('altamedia51@gmail.com');
  }

  if (!user) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }

  // If user is admin, refresh credits from real KIE account total
  if (user.role === 'admin' || user.email.toLowerCase() === 'altamedia51@gmail.com') {
    const realCredits = await getRealAdminKieCredits();
    if (user.credits !== realCredits) {
      user.credits = realCredits;
      await dbStore.upsertUser(user);
    }
  }

  const jobs = await dbStore.getUserJobs(user.id);
  const activeJobs = jobs.filter(j => j.status === 'PROCESSING' || j.status === 'SUBMITTING' || j.status === 'QUEUED');

  return res.status(200).json({
    success: true,
    user,
    activeJobsCount: activeJobs.length
  });
});
