import { Router, Request, Response } from 'express';
import { dbStore, GenerationTrackDoc } from '../db';
import { creditService } from '../services/CreditService';

export const webhookRouter = Router();

// In-memory idempotency cache
const processedCallbacks = new Set<string>();

webhookRouter.post('/kie/music', async (req: Request, res: Response) => {
  // Respond HTTP 200 quickly as recommended by KIE documentation (<15s)
  const payload = req.body || {};
  console.log('[Webhook] Received KIE callback:', JSON.stringify(payload).slice(0, 300));

  try {
    const rawData = payload.data || payload;
    const taskId = String(
      rawData.task_id || 
      rawData.taskId || 
      payload.task_id || 
      payload.taskId || 
      ''
    ).trim();

    const callbackType = String(
      payload.callbackType || 
      payload.callback_type || 
      payload.event || 
      rawData.callbackType || 
      'complete'
    ).toLowerCase();

    if (!taskId) {
      console.warn('[Webhook] Missing task_id in KIE callback');
      return res.status(200).json({ success: false, message: 'Missing task_id' });
    }

    const idempotencyKey = `${taskId}:${callbackType}`;
    if (processedCallbacks.has(idempotencyKey)) {
      console.log(`[Webhook] Duplicate callback received for key ${idempotencyKey}, skipping.`);
      return res.status(200).json({ success: true, message: 'Already processed' });
    }
    processedCallbacks.add(idempotencyKey);

    // Look up matching job
    const job = await dbStore.getJobByTaskId(taskId);
    if (!job) {
      console.warn(`[Webhook] No job found matching taskId ${taskId}`);
      await dbStore.addLog({
        id: `log_${Date.now()}`,
        level: 'warn',
        category: 'WEBHOOK',
        message: `Callback received for unindexed task_id: ${taskId}`,
        createdAt: new Date().toISOString()
      });
      return res.status(200).json({ success: true, message: 'Job not found' });
    }

    // Handle error callback
    if (callbackType === 'error' || payload.code === 500 || payload.status === 'failed') {
      const errorMsg = payload.msg || payload.message || rawData.msg || 'Generation failed on KIE provider';
      console.error(`[Webhook] Job ${job.id} (task ${taskId}) reported error:`, errorMsg);

      await dbStore.updateJob(job.id, {
        status: 'FAILED',
        callbackStage: 'error',
        errorCode: 'PROVIDER_ERROR',
        errorMessage: errorMsg
      });

      // Refund reserved credits
      await creditService.refundCredits(job.userId, job.id, job.creditReservation, errorMsg);

      await dbStore.addLog({
        id: `log_${Date.now()}`,
        level: 'error',
        category: 'WEBHOOK',
        message: `Task ${taskId} reported generation error: ${errorMsg}`,
        jobId: job.id,
        userId: job.userId,
        createdAt: new Date().toISOString()
      });

      return res.status(200).json({ success: true, message: 'Error recorded and credits refunded' });
    }

    // Handle text generation stage
    if (callbackType === 'text') {
      await dbStore.updateJob(job.id, {
        callbackStage: 'text'
      });
      return res.status(200).json({ success: true, message: 'Text stage acknowledged' });
    }

    // Extract tracks
    const tracksList = rawData.data || rawData.tracks || (Array.isArray(rawData) ? rawData : []);
    const validTracks: any[] = [];

    if (Array.isArray(tracksList)) {
      for (const item of tracksList) {
        if (item?.audio_url || item?.stream_audio_url) {
          validTracks.push(item);
        }
      }
    }

    // Handle first track available
    if (callbackType === 'first' && validTracks.length > 0) {
      for (const t of validTracks) {
        const trackId = `trk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        await dbStore.addTrack({
          id: trackId,
          jobId: job.id,
          userId: job.userId,
          providerTrackId: t.id || `prov_${Date.now()}`,
          audioUrl: t.audio_url || t.stream_audio_url,
          streamAudioUrl: t.stream_audio_url || t.audio_url,
          imageUrl: t.image_url || t.image_large_url,
          prompt: t.prompt || job.lyrics,
          modelName: t.model_name || job.model,
          title: t.title || job.title,
          tags: t.tags || job.style,
          duration: t.duration,
          createdAt: new Date().toISOString()
        });
      }

      await dbStore.updateJob(job.id, {
        status: 'PARTIAL',
        callbackStage: 'first'
      });

      return res.status(200).json({ success: true, message: 'First track recorded' });
    }

    // Handle complete callback
    if (callbackType === 'complete' || validTracks.length > 0) {
      if (validTracks.length === 0) {
        // Completion reported with no tracks
        console.warn(`[Webhook] Complete callback received for ${taskId} but no audio tracks found`);
        await dbStore.updateJob(job.id, {
          status: 'FAILED',
          errorCode: 'NO_TRACKS_GENERATED',
          errorMessage: 'Provider completed task without audio outputs'
        });
        await creditService.refundCredits(job.userId, job.id, job.creditReservation, 'No audio produced');
        return res.status(200).json({ success: true, message: 'No tracks produced' });
      }

      for (const t of validTracks) {
        const trackId = `trk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        await dbStore.addTrack({
          id: trackId,
          jobId: job.id,
          userId: job.userId,
          providerTrackId: t.id || `prov_${Date.now()}`,
          audioUrl: t.audio_url || t.stream_audio_url,
          streamAudioUrl: t.stream_audio_url || t.audio_url,
          imageUrl: t.image_url || t.image_large_url,
          prompt: t.prompt || job.lyrics,
          modelName: t.model_name || job.model,
          title: t.title || job.title,
          tags: t.tags || job.style,
          duration: t.duration,
          createdAt: new Date().toISOString()
        });
      }

      // Finalize credits
      await creditService.finalizeCredits(job.userId, job.id, job.creditReservation);

      await dbStore.updateJob(job.id, {
        status: 'COMPLETED',
        callbackStage: 'complete',
        creditFinalized: true,
        completedAt: new Date().toISOString()
      });

      await dbStore.addLog({
        id: `log_${Date.now()}`,
        level: 'info',
        category: 'GENERATION_COMPLETE',
        message: `Task ${taskId} completed with ${validTracks.length} tracks`,
        jobId: job.id,
        userId: job.userId,
        createdAt: new Date().toISOString()
      });

      return res.status(200).json({ success: true, message: 'Job completed successfully' });
    }

    return res.status(200).json({ success: true, message: 'Callback received' });

  } catch (err: any) {
    console.error('[Webhook] Unhandled error in KIE callback:', err.message);
    return res.status(200).json({ success: false, error: err.message });
  }
});
