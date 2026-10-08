import { dbStore, GenerationJobDoc, GenerationTrackDoc } from '../db';
import { MODEL_REGISTRY, getPublicAppUrl } from '../config';
import { creditService } from './CreditService';
import { kieAccountManager } from './KieAccountManager';
import { kieSunoProvider } from '../providers/KieSunoProvider';

export class JobQueueService {
  /**
   * Processes a new user music generation request
   */
  async submitJob(params: {
    userId: string;
    title: string;
    lyrics?: string;
    style: string;
    model: string;
    customMode: boolean;
    instrumental: boolean;
    negativeTags?: string;
    vocalGender?: 'm' | 'f';
    duration?: number;
    personalApiKey?: string;
  }): Promise<{ success: boolean; job?: GenerationJobDoc; error?: { code: string; message: string } }> {
    const settings = await dbStore.getSettings();

    // Check maintenance mode
    if (settings.maintenanceMode) {
      return {
        success: false,
        error: {
          code: 'MAINTENANCE_MODE',
          message: 'Music generation is temporarily unavailable due to scheduled maintenance.'
        }
      };
    }

    if (!settings.generationEnabled) {
      return {
        success: false,
        error: {
          code: 'GENERATION_DISABLED',
          message: 'Music generation is currently disabled by system administrator.'
        }
      };
    }

    // Verify model availability
    const modelCap = MODEL_REGISTRY[params.model];
    if (!modelCap || !modelCap.enabled) {
      return {
        success: false,
        error: {
          code: 'MODEL_UNAVAILABLE',
          message: `The selected model (${params.model}) is currently unavailable.`
        }
      };
    }

    // Check user active concurrent jobs
    const userJobs = await dbStore.getUserJobs(params.userId);
    const activeUserJobs = userJobs.filter(j => j.status === 'PROCESSING' || j.status === 'SUBMITTING' || j.status === 'QUEUED');
    if (settings.maxConcurrentJobsPerUser > 0 && activeUserJobs.length >= settings.maxConcurrentJobsPerUser) {
      return {
        success: false,
        error: {
          code: 'CONCURRENCY_LIMIT_EXCEEDED',
          message: `You have ${activeUserJobs.length} active generation jobs. Please wait for one to complete.`
        }
      };
    }

    // Determine credit cost and check for Personal KIE Key (BYOK)
    const userDoc = await dbStore.getUser(params.userId);
    const resolvedPersonalKey = (params.personalApiKey || (userDoc?.usePersonalKey ? userDoc.personalKieApiKey : ''))?.trim();
    const isUsingPersonalKey = Boolean(resolvedPersonalKey && resolvedPersonalKey.length >= 10);
    const creditCost = isUsingPersonalKey ? 0 : modelCap.defaultCreditCost;
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Create Initial Job in QUEUED state
    const job: GenerationJobDoc = {
      id: jobId,
      userId: params.userId,
      provider: 'KIE_SUNO',
      providerAccountName: isUsingPersonalKey ? 'Personal Key (BYOK)' : undefined,
      title: params.title.trim(),
      lyrics: params.lyrics,
      style: params.style.trim(),
      model: params.model,
      instrumental: params.instrumental,
      negativeTags: params.negativeTags,
      vocalGender: params.vocalGender,
      duration: params.duration,
      status: 'QUEUED',
      creditReservation: creditCost,
      creditFinalized: false,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await dbStore.createJob(job);

    // Reserve Credits only if NOT using personal key
    if (creditCost > 0) {
      const reserveRes = await creditService.reserveCredits(params.userId, jobId, creditCost);
      if (!reserveRes.success) {
        await dbStore.updateJob(jobId, {
          status: 'FAILED',
          errorCode: 'INSUFFICIENT_CREDITS',
          errorMessage: reserveRes.error
        });
        return {
          success: false,
          error: {
            code: 'INSUFFICIENT_CREDITS',
            message: reserveRes.error || 'Insufficient credits'
          }
        };
      }
    }

    // Transition to SUBMITTING
    await dbStore.updateJob(jobId, { status: 'SUBMITTING' });

    // Prepare Public Callback URL
    const publicAppUrl = getPublicAppUrl();
    const callBackUrl = `${publicAppUrl}/api/webhooks/kie/music`;

    console.log(`[JobQueueService] Submitting job ${jobId} to KIE.ai with callback: ${callBackUrl} (BYOK: ${isUsingPersonalKey})`);

    let submission: any = null;

    if (isUsingPersonalKey && resolvedPersonalKey) {
      // Direct submission using User's Personal KIE.ai API key
      const cleanPersonalKey = resolvedPersonalKey
        .replace(/^Bearer\s+/i, '')
        .replace(/^["']|["']$/g, '')
        .trim();

      const res = await kieSunoProvider.createMusic({
        title: params.title,
        prompt: params.lyrics,
        lyrics: params.lyrics,
        style: params.style,
        model: params.model,
        customMode: params.customMode,
        instrumental: params.instrumental,
        negativeTags: params.negativeTags,
        vocalGender: params.vocalGender,
        duration: params.duration,
        callBackUrl
      }, cleanPersonalKey);

      submission = {
        result: res,
        accountUsed: {
          id: `personal_${params.userId}`,
          name: 'Personal Key (BYOK)',
          status: 'ACTIVE',
          priority: 99
        }
      };
    } else {
      // Submit to KIE with multi-account routing & failover
      submission = await kieAccountManager.submitWithFailover({
        title: params.title,
        prompt: params.lyrics,
        lyrics: params.lyrics,
        style: params.style,
        model: params.model,
        customMode: params.customMode,
        instrumental: params.instrumental,
        negativeTags: params.negativeTags,
        vocalGender: params.vocalGender,
        duration: params.duration,
        callBackUrl
      }, settings.maxRetryCount);
    }

    if (!submission.result.success || !submission.result.taskId) {
      // Submission Failed: mark FAILED and refund reserved credits
      const err = submission.result.error;
      const errorMsg = err?.message || 'Provider failed to accept task';
      const errorCode = err?.code || 'PROVIDER_ERROR';

      await dbStore.updateJob(jobId, {
        status: 'FAILED',
        errorCode,
        errorMessage: errorMsg
      });

      await creditService.refundCredits(params.userId, jobId, creditCost, `Job submission failed: ${errorMsg}`);

      return {
        success: false,
        error: {
          code: errorCode,
          message: errorMsg
        }
      };
    }

    // Submission Succeeded: Update Job with Task ID & Account info -> PROCESSING
    const updatedJob = await dbStore.updateJob(jobId, {
      status: 'PROCESSING',
      taskId: submission.result.taskId,
      providerAccountId: submission.accountUsed?.id,
      providerAccountName: submission.accountUsed?.name,
      updatedAt: new Date().toISOString()
    });

    return {
      success: true,
      job: updatedJob || job
    };
  }

  /**
   * Status check / polling fallback for a job
   */
  async checkJobStatus(jobId: string): Promise<GenerationJobDoc | null> {
    const job = await dbStore.getJob(jobId);
    if (!job) return null;

    // If job is still PROCESSING, SUBMITTING, PARTIAL or has 0 tracks saved, check with KIE
    const currentTracks = await dbStore.getTracksForJob(job.id);
    const needsFetch = job.taskId && (
      job.status === 'PROCESSING' || 
      job.status === 'SUBMITTING' || 
      job.status === 'PARTIAL' || 
      (job.status === 'COMPLETED' && currentTracks.length === 0)
    );

    if (needsFetch && job.taskId) {
      let apiKey: string | null = null;
      const jobUser = await dbStore.getUser(job.userId);
      if (jobUser?.personalKieApiKey && jobUser.personalKieApiKey.trim().length >= 10) {
        apiKey = jobUser.personalKieApiKey.replace(/^Bearer\s+/i, '').replace(/^["']|["']$/g, '').trim();
      }

      if (!apiKey) {
        let account = job.providerAccountId ? await dbStore.getKieAccount(job.providerAccountId) : null;
        if (!account) {
          const allAccounts = await dbStore.getKieAccounts();
          account = allAccounts.find(a => a.status === 'ACTIVE') || allAccounts[0] || null;
        }
        if (account) {
          const { decryptApiKey } = await import('../encryption');
          apiKey = decryptApiKey(account.apiKey || account.encryptedApiKey || '');
        }
      }

      if (apiKey) {
        try {
          const statusRes = await kieSunoProvider.getMusicStatus(job.taskId, apiKey);

          if (statusRes.success && statusRes.tracks && statusRes.tracks.length > 0) {
            const existingTracks = await dbStore.getTracksForJob(job.id);
            const existingUrls = new Set(existingTracks.map(t => t.audioUrl));

            // Save new tracks
            for (const t of statusRes.tracks) {
              if (!existingUrls.has(t.audioUrl)) {
                const trackId = `trk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                await dbStore.addTrack({
                  id: trackId,
                  jobId: job.id,
                  userId: job.userId,
                  providerTrackId: t.id,
                  audioUrl: t.audioUrl,
                  streamAudioUrl: t.streamAudioUrl || t.audioUrl,
                  imageUrl: t.imageUrl,
                  prompt: t.prompt,
                  modelName: t.modelName || job.model,
                  title: t.title || job.title,
                  tags: t.tags || job.style,
                  duration: t.duration,
                  createdAt: new Date().toISOString()
                });
                existingUrls.add(t.audioUrl);
              }
            }

            // Finalize credits
            await creditService.finalizeCredits(job.userId, job.id, job.creditReservation);

            return await dbStore.updateJob(job.id, {
              status: 'COMPLETED',
              creditFinalized: true,
              completedAt: new Date().toISOString()
            });
          } else if (statusRes.success && statusRes.status === 'FAILED') {
            await creditService.refundCredits(job.userId, job.id, job.creditReservation, statusRes.error || 'Generation failed on provider');
            return await dbStore.updateJob(job.id, {
              status: 'FAILED',
              errorCode: 'PROVIDER_GENERATION_FAILED',
              errorMessage: statusRes.error || 'Music generation failed on KIE.ai'
            });
          }
        } catch (e: any) {
          console.warn(`[JobQueueService] Status check error for job ${jobId}:`, e.message);
        }
      }
    }

    return job;
  }

  /**
   * Automatic background polling worker to catch completions even if webhooks are delayed
   */
  startBackgroundWorker() {
    setInterval(async () => {
      try {
        const allJobs = await dbStore.getAllJobs();
        const pendingJobs = allJobs.filter(j => 
          (j.status === 'PROCESSING' || j.status === 'SUBMITTING' || j.status === 'PARTIAL') && 
          j.taskId
        );

        for (const job of pendingJobs) {
          await this.checkJobStatus(job.id);
        }
      } catch (err: any) {
        console.warn('[JobQueueService Worker] Background poll warning:', err.message);
      }
    }, 7000);
    console.log('[JobQueueService] Background polling worker started (interval: 7s)');
  }
}

export const jobQueueService = new JobQueueService();
jobQueueService.startBackgroundWorker();

