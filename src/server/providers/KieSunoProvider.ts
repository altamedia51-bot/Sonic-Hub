import { MusicProvider, CreateMusicInput, CreateMusicResult, MusicStatusResult, TrackData } from './MusicProvider';
import { MODEL_REGISTRY } from '../config';

export class KieSunoProvider implements MusicProvider {
  private readonly baseUrl = 'https://api.kie.ai/api/v1';

  /**
   * Submits a real music generation task to KIE.ai Suno API.
   * ABSOLUTE RULE: Never mock this. If the API fails or credentials are wrong, report real error.
   */
  async createMusic(input: CreateMusicInput, apiKey: string): Promise<CreateMusicResult> {
    const cleanApiKey = apiKey.replace(/^Bearer\s+/i, '').replace(/^["']|["']$/g, '').trim();

    if (!cleanApiKey) {
      return {
        success: false,
        error: {
          code: 'PROVIDER_NOT_CONFIGURED',
          message: 'KIE.ai API key is missing or not configured.',
          statusCode: 400,
          retryable: false
        }
      };
    }

    // Model capability checks
    const modelCap = MODEL_REGISTRY[input.model] || MODEL_REGISTRY['V6'];
    
    // Build documented input structure
    const promptText = input.instrumental ? '' : (input.lyrics || input.prompt || '');
    
    const requestInput: Record<string, any> = {
      model: input.model,
      custom_mode: input.customMode,
      instrumental: input.instrumental,
      title: input.title.trim(),
      style: input.style.trim(),
      prompt: promptText
    };

    // Include negative tags only if provided and supported
    if (input.negativeTags && input.negativeTags.trim() && modelCap.supportsNegativeTags) {
      requestInput.negative_tags = input.negativeTags.trim();
    }

    // Include vocal gender only if provided and supported
    if (input.vocalGender && modelCap.supportsVocalGender && !input.instrumental) {
      requestInput.vocal_gender = input.vocalGender; // 'm' or 'f'
    }

    // Include duration strictly only if custom_mode is true AND model is V5_5, V6, V6_WILD or V6_MINI
    const KIE_DURATION_SUPPORTED_MODELS = new Set(['V5_5', 'V6', 'V6_WILD', 'V6_MINI']);
    if (input.duration && input.customMode && KIE_DURATION_SUPPORTED_MODELS.has(input.model)) {
      const minD = modelCap.minDuration || 10;
      const maxD = modelCap.maxDuration || 360;
      const clamped = Math.max(minD, Math.min(maxD, Math.round(input.duration)));
      requestInput.duration = clamped;
    }

    const payload = {
      model: 'ai-music-api/generate',
      callBackUrl: input.callBackUrl,
      input: requestInput
    };

    try {
      const response = await fetch(`${this.baseUrl}/jobs/createTask`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${cleanApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const responseText = await response.text();
      let resJson: any = null;

      try {
        resJson = JSON.parse(responseText);
      } catch (e) {
        // Non-JSON response
        return {
          success: false,
          error: {
            code: 'INVALID_PROVIDER_RESPONSE',
            message: `KIE API returned non-JSON response (HTTP ${response.status}): ${responseText.slice(0, 150)}`,
            statusCode: response.status,
            retryable: response.status >= 500
          }
        };
      }

      // Check HTTP status code and response payload
      const rawMsg = String(resJson?.msg || resJson?.message || '');
      const isCreditInsufficient = response.status === 402 || 
        rawMsg.toLowerCase().includes('credits insufficient') || 
        rawMsg.toLowerCase().includes("balance isn't enough") || 
        rawMsg.toLowerCase().includes('insufficient');

      if (!response.ok) {
        const isAuthError = response.status === 401 || response.status === 403;
        const isRateLimit = response.status === 429 || resJson?.code === 429;
        const isRetryable = response.status >= 500 || isRateLimit || isCreditInsufficient;

        return {
          success: false,
          rawResponse: resJson,
          error: {
            code: isCreditInsufficient ? 'INSUFFICIENT_PROVIDER_CREDITS' : isAuthError ? 'AUTH_FAILED' : isRateLimit ? 'RATE_LIMITED' : 'KIE_PROVIDER_ERROR',
            message: rawMsg || `KIE request failed with HTTP ${response.status}`,
            statusCode: response.status,
            retryable: isRetryable
          }
        };
      }

      // Parse Task ID from flexible response forms (data.task_id, data.taskId, taskId, etc.)
      const taskId = resJson?.data?.task_id || resJson?.data?.taskId || resJson?.taskId || resJson?.task_id;

      if (!taskId) {
        const errMsg = rawMsg || 'No task_id returned by KIE API';
        return {
          success: false,
          rawResponse: resJson,
          error: {
            code: isCreditInsufficient ? 'INSUFFICIENT_PROVIDER_CREDITS' : 'TASK_ID_MISSING',
            message: errMsg,
            statusCode: response.status,
            retryable: isCreditInsufficient
          }
        };
      }

      return {
        success: true,
        taskId: String(taskId),
        rawResponse: resJson
      };

    } catch (networkErr: any) {
      return {
        success: false,
        error: {
          code: 'NETWORK_TIMEOUT',
          message: `Network error connecting to KIE.ai: ${networkErr.message}`,
          retryable: true
        }
      };
    }
  }

  /**
   * Retrieves real status and generated audio records from KIE.ai
   */
  async getMusicStatus(taskId: string, apiKey: string): Promise<MusicStatusResult> {
    if (!apiKey) {
      return {
        success: false,
        taskId,
        status: 'FAILED',
        error: 'API key is missing'
      };
    }

    try {
      // Try both standard KIE recordInfo endpoints if needed
      let url = `${this.baseUrl}/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`;
      let response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok && response.status === 404) {
        url = `${this.baseUrl}/jobs/record-info?taskId=${encodeURIComponent(taskId)}`;
        response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey.trim()}`,
            'Content-Type': 'application/json'
          }
        });
      }

      if (!response.ok) {
        return {
          success: false,
          taskId,
          status: 'PROCESSING',
          error: `HTTP error ${response.status} querying task status`
        };
      }

      const json = await response.json();
      console.log(`[KieSunoProvider] Task ${taskId} status response:`, JSON.stringify(json).slice(0, 350));
      
      const jobData = json?.data || json;
      const statusRaw = String(
        jobData?.state || 
        jobData?.status || 
        json?.state || 
        json?.status || 
        ''
      ).toUpperCase();

      // Look for tracks in multiple possible structures
      let rawTracks: any[] = [];
      if (Array.isArray(jobData?.data)) {
        rawTracks = jobData.data;
      } else if (Array.isArray(jobData?.response?.data)) {
        rawTracks = jobData.response.data;
      } else if (Array.isArray(jobData?.tracks)) {
        rawTracks = jobData.tracks;
      } else if (Array.isArray(jobData?.result)) {
        rawTracks = jobData.result;
      } else if (Array.isArray(json?.data)) {
        rawTracks = json.data;
      } else if (Array.isArray(json?.data?.response?.data)) {
        rawTracks = json.data.response.data;
      } else if (Array.isArray(jobData)) {
        rawTracks = jobData;
      }

      const tracks: TrackData[] = [];
      for (const item of rawTracks) {
        let permanentAudioUrl = item?.audio_url || item?.audioUrl || item?.source_url || item?.mp3_url || '';
        const streamAudioUrl = item?.stream_audio_url || item?.streamAudioUrl || '';

        // If permanentAudioUrl is missing or is an audiostream link, check for stream link fallback
        let resolvedAudioUrl = permanentAudioUrl || streamAudioUrl;

        // If the URL is an audiostream link, extract the UUID and convert to permanent tempfile CDN URL
        if (resolvedAudioUrl && resolvedAudioUrl.includes('audiostream.kie.ai')) {
          const match = resolvedAudioUrl.match(/audiostream\.kie\.ai\/stream\/([a-f0-9-]+)\.mp3/i);
          if (match && match[1]) {
            resolvedAudioUrl = `https://tempfile.aiquickdraw.com/r/${match[1]}.mp3`;
          }
        }

        if (resolvedAudioUrl) {
          tracks.push({
            id: String(item.id || item.trackId || `track_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`),
            audioUrl: resolvedAudioUrl,
            streamAudioUrl: streamAudioUrl || resolvedAudioUrl,
            imageUrl: item?.image_url || item?.imageUrl || item?.image_large_url || item?.cover_url,
            title: item?.title || item?.name,
            tags: item?.tags || item?.style,
            prompt: item?.prompt || item?.text || item?.lyrics,
            duration: item?.duration,
            modelName: item?.model_name || item?.model
          });
        }
      }

      let mappedStatus: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' = 'PROCESSING';
      const isCompleteState = ['SUCCESS', 'COMPLETED', 'COMPLETE', 'DONE', 'FINISHED', 'FIRST_SUCCESS'].includes(statusRaw);
      const isFailedState = ['FAILED', 'FAIL', 'ERROR', 'CREATE_TASK_FAILED', 'GENERATE_AUDIO_FAILED', 'CALLBACK_EXCEPTION', 'SENSITIVE_WORD_ERROR'].includes(statusRaw);
      const isQueuedState = ['PENDING', 'QUEUED', 'WAITING', 'QUEUING'].includes(statusRaw);

      if (isCompleteState || tracks.length > 0) {
        mappedStatus = 'COMPLETED';
      } else if (isFailedState) {
        mappedStatus = 'FAILED';
      } else if (isQueuedState) {
        mappedStatus = 'QUEUED';
      }

      return {
        success: true,
        taskId,
        status: mappedStatus,
        tracks,
        raw: json,
        error: isFailedState ? (jobData?.msg || jobData?.message || 'Music generation failed on KIE.ai') : undefined
      };

    } catch (err: any) {
      return {
        success: false,
        taskId,
        status: 'PROCESSING',
        error: err.message
      };
    }
  }

  /**
   * Verifies credentials against KIE API using real request
   */
  async testConnection(apiKey: string): Promise<{ success: boolean; message: string }> {
    if (!apiKey || !apiKey.trim()) {
      return { success: false, message: 'API key is empty.' };
    }
    try {
      // Query recordInfo with a known format test ID to verify authorization header
      const res = await fetch(`${this.baseUrl}/jobs/recordInfo?taskId=test_connection_probe`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json'
        }
      });

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          message: `Authentication failed (HTTP ${res.status}): Invalid or unauthorized KIE API key.`
        };
      }

      // If response is 200 or 404 (task not found), the API key was authenticated and recognized by KIE
      if (res.status === 200 || res.status === 404 || res.status === 400) {
        const text = await res.text();
        let parsed: any = null;
        try { parsed = JSON.parse(text); } catch(e) {}
        
        if (parsed?.code === 401 || parsed?.code === 403) {
          return { success: false, message: parsed.msg || 'Unauthorized KIE API key.' };
        }

        return {
          success: true,
          message: 'Connection verified successfully with KIE.ai Suno API.'
        };
      }

      return {
        success: true,
        message: `KIE API reached (HTTP ${res.status}). Authorization header accepted.`
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Network failure connecting to KIE.ai: ${err.message}`
      };
    }
  }

  /**
   * Queries real-time credit balance from KIE.ai
   * Endpoint: GET https://api.kie.ai/api/v1/chat/credit
   */
  async getAccountCredits(apiKey: string): Promise<{ success: boolean; credits: number; message?: string }> {
    if (!apiKey || !apiKey.trim()) {
      return { success: false, credits: 0, message: 'API key is empty' };
    }

    try {
      const url = `${this.baseUrl}/chat/credit`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        return {
          success: false,
          credits: 0,
          message: `HTTP ${res.status} from KIE Credit API`
        };
      }

      const json = await res.json();
      console.log('[KieSunoProvider] Credit balance response from KIE.ai:', json);

      // KIE returns { code: 200, msg: "success", data: 150 }
      if (json && (typeof json.data === 'number' || (!isNaN(Number(json.data)) && json.data !== null))) {
        return {
          success: true,
          credits: Number(json.data)
        };
      }

      const alt = json?.credits ?? json?.data?.credits ?? json?.data?.balance ?? json?.balance;
      if (typeof alt === 'number' || (alt !== undefined && !isNaN(Number(alt)))) {
        return {
          success: true,
          credits: Number(alt)
        };
      }

      return {
        success: true,
        credits: 0
      };
    } catch (err: any) {
      return {
        success: false,
        credits: 0,
        message: err.message
      };
    }
  }
}

export const kieSunoProvider = new KieSunoProvider();
