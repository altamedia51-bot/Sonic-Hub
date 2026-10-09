import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { dbStore } from '../db';
import { MODEL_REGISTRY } from '../config';
import { jobQueueService } from '../services/JobQueueService';

export const musicRouter = Router();

// Validation schema for music generation request
const createMusicSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title cannot exceed 100 characters'),
  lyrics: z.string().max(4500, 'Lyrics cannot exceed 4500 characters').optional().default(''),
  style: z.string().min(1, 'Style prompt is required').max(600, 'Style cannot exceed 600 characters'),
  model: z.string().min(1, 'Model is required'),
  customMode: z.boolean().default(true),
  instrumental: z.boolean().default(false),
  negativeTags: z.string().max(300).optional(),
  vocalGender: z.enum(['m', 'f']).optional(),
  duration: z.number().min(10).max(360).optional()
});

/**
 * Helper to extract user identity from headers / token
 */
async function authenticateUser(req: Request) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const userIdHeader = (req.headers['x-user-id'] as string) || '';
  const userEmailHeader = (req.headers['x-user-email'] as string) || '';

  // In local/production, verify user against DB / Firestore
  let user = null;
  if (userIdHeader) {
    user = await dbStore.getUser(userIdHeader);
  }
  if (!user && userEmailHeader) {
    user = await dbStore.getUser(userEmailHeader);
  }
  if (!user && token && token.length > 5) {
    user = await dbStore.getUser(token);
  }

  // Fallback: If anonymous or first turn, check if altamedia admin exists
  if (!user && (userEmailHeader.toLowerCase() === 'altamedia51@gmail.com' || !userIdHeader)) {
    user = await dbStore.getUser('altamedia51@gmail.com');
  }

  // Auto-sync user if headers provided but document was missing
  if (!user && (userEmailHeader || userIdHeader)) {
    const email = (userEmailHeader || 'user@sonichub.ai').toLowerCase();
    const uid = userIdHeader || `usr_${email.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const isSystemAdmin = email === 'altamedia51@gmail.com';
    const settings = await dbStore.getSettings();
    user = await dbStore.upsertUser({
      id: uid,
      email,
      name: email.split('@')[0],
      role: isSystemAdmin ? 'admin' : 'user',
      status: 'active',
      credits: isSystemAdmin ? 1000 : settings.defaultUserCredit,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  // If user is system admin, ensure their credits reflect active KIE accounts if available
  if (user && user.email.toLowerCase() === 'altamedia51@gmail.com') {
    const accounts = await dbStore.getKieAccounts();
    const active = accounts.filter(a => a.status === 'ACTIVE');
    const totalKie = active.reduce((sum, a) => sum + (a.credits || 0), 0);
    if (totalKie > 0 && user.credits < 10) {
      user.credits = totalKie;
      await dbStore.upsertUser(user);
    }
  }

  return user;
}

// POST /api/music/create
musicRouter.post('/create', async (req: Request, res: Response) => {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHENTICATED',
        message: 'Authentication required to generate music.'
      });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        code: 'USER_SUSPENDED',
        message: 'Your account is suspended. Contact support.'
      });
    }

    const parseResult = createMusicSchema.safeParse(req.body);
    if (!parseResult.success) {
      const issues = (parseResult.error as any).issues || (parseResult.error as any).errors || [];
      const errorMsg = issues.length > 0 
        ? issues.map((e: any) => e.message).join(', ') 
        : parseResult.error.message;
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        message: errorMsg
      });
    }

    const { title, lyrics, style, model, customMode, instrumental, negativeTags, vocalGender, duration } = parseResult.data;

    // Additional conditional validation
    if (!instrumental && customMode && (!lyrics || lyrics.trim().length === 0)) {
      return res.status(400).json({
        success: false,
        code: 'LYRICS_REQUIRED',
        message: 'Lyrics are required in Custom Mode when instrumental is off.'
      });
    }

    const KIE_DURATION_SUPPORTED_MODELS = new Set(['V5_5', 'V6', 'V6_WILD', 'V6_MINI']);
    const sanitizedDuration = (KIE_DURATION_SUPPORTED_MODELS.has(model) && customMode && typeof duration === 'number' && duration > 0) ? duration : undefined;
    const personalApiKeyHeader = (req.headers['x-personal-kie-key'] as string) || '';
    const resolvedPersonalApiKey = personalApiKeyHeader || (user.usePersonalKey ? user.personalKieApiKey : undefined);

    // Submit job via JobQueueService
    const result = await jobQueueService.submitJob({
      userId: user.id,
      title,
      lyrics,
      style,
      model,
      customMode,
      instrumental,
      negativeTags,
      vocalGender,
      duration: sanitizedDuration,
      personalApiKey: resolvedPersonalApiKey
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        code: result.error?.code || 'SUBMISSION_FAILED',
        message: result.error?.message || 'Failed to submit generation job'
      });
    }

    return res.status(200).json({
      success: true,
      jobId: result.job?.id,
      job: result.job
    });

  } catch (err: any) {
    console.error('[API /api/music/create] Error:', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: err.message || 'Internal server error'
    });
  }
});

// GET /api/music/jobs/:id
musicRouter.get('/jobs/:id', async (req: Request, res: Response) => {
  try {
    const user = await authenticateUser(req);
    const { id } = req.params;
    const job = await dbStore.getJob(id);

    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    // Authorization check
    if (user && user.role !== 'admin' && job.userId !== user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const tracks = await dbStore.getTracksForJob(id);

    return res.status(200).json({
      success: true,
      job,
      tracks
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/music/jobs/:id/status
musicRouter.get('/jobs/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const job = await jobQueueService.checkJobStatus(id);

    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const tracks = await dbStore.getTracksForJob(id);

    return res.status(200).json({
      success: true,
      status: job.status,
      callbackStage: job.callbackStage,
      error: job.errorMessage,
      tracks,
      job
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/music/active
musicRouter.get('/active', async (req: Request, res: Response) => {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const userJobs = await dbStore.getUserJobs(user.id);
    const now = Date.now();

    // Look for genuine running active job
    let activeJob = userJobs.find(j => {
      const ageMs = now - new Date(j.createdAt || 0).getTime();
      return (j.status === 'PROCESSING' || j.status === 'SUBMITTING' || j.status === 'QUEUED') && ageMs < 20 * 60 * 1000;
    });

    if (!activeJob) {
      // If no actively running job, check if the latest job completed in the last 2 minutes
      // (so user sees their fresh tracks right after finishing, but not old jobs forever)
      const latestJob = userJobs[0];
      if (latestJob && (latestJob.status === 'COMPLETED' || latestJob.status === 'PARTIAL')) {
        const completedAgeMs = now - new Date(latestJob.completedAt || latestJob.createdAt || 0).getTime();
        if (completedAgeMs < 2 * 60 * 1000) {
          const tracks = await dbStore.getTracksForJob(latestJob.id);
          return res.status(200).json({
            success: true,
            activeJob: latestJob,
            tracks
          });
        }
      }
      return res.status(200).json({ success: true, activeJob: null, tracks: [] });
    }

    // Check status if processing
    const checked = await jobQueueService.checkJobStatus(activeJob.id);
    const resolvedJob = checked || activeJob;
    const tracks = await dbStore.getTracksForJob(resolvedJob.id);

    return res.status(200).json({
      success: true,
      activeJob: resolvedJob,
      tracks
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/music/library
musicRouter.get('/library', async (req: Request, res: Response) => {
  try {
    const user = await authenticateUser(req);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    // Actively check any pending jobs first
    const userJobs = await dbStore.getUserJobs(user.id);
    const pending = userJobs.filter(j => j.status === 'PROCESSING' || j.status === 'SUBMITTING' || j.status === 'PARTIAL');
    for (const pj of pending) {
      await jobQueueService.checkJobStatus(pj.id);
    }

    const items = await dbStore.getUserLibrary(user.id);
    const currentJobs = await dbStore.getUserJobs(user.id);
    const activeJobs = currentJobs.filter(j => j.status === 'PROCESSING' || j.status === 'SUBMITTING' || j.status === 'QUEUED');

    return res.status(200).json({
      success: true,
      items,
      activeJobs
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/music/models
musicRouter.get('/models', async (_req: Request, res: Response) => {
  const settings = await dbStore.getSettings();
  const models = Object.values(MODEL_REGISTRY).map(m => ({
    ...m,
    enabled: settings.enabledModels.includes(m.id)
  }));
  return res.status(200).json({ success: true, models });
});

// GET /api/music/download?url=...
musicRouter.get('/download', async (req: Request, res: Response) => {
  const fileUrl = req.query.url as string;

  if (!fileUrl) {
    return res.status(400).send('Missing audio URL parameter');
  }

  try {
    // Perform instant 302 redirect to avoid buffer limits on Vercel serverless functions
    return res.redirect(302, fileUrl);
  } catch (err: any) {
    return res.redirect(fileUrl);
  }
});
