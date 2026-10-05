import React, { useState, useEffect } from 'react';
import { 
  Music, 
  Sparkles, 
  Sliders, 
  Clock, 
  User as UserIcon, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  Play, 
  Pause, 
  Download, 
  ExternalLink, 
  ShieldAlert, 
  Flame, 
  Volume2,
  RefreshCw
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { GenerationJob, GenerationTrack, ModelCapability } from '../types';
import { db } from '../firebase/config';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, where } from 'firebase/firestore';

interface StudioPageProps {
  onGoToAdmin?: () => void;
}

export const StudioPage: React.FC<StudioPageProps> = ({ onGoToAdmin }) => {
  const { user, isAdmin, credits, refreshUser } = useAuth();
  const { playTrack, currentTrack, isPlaying } = usePlayer();

  // Form State
  const [title, setTitle] = useState('');
  const [model, setModel] = useState('V6');
  const [customMode, setCustomMode] = useState(true);
  const [instrumental, setInstrumental] = useState(false);
  const [style, setStyle] = useState('125 BPM, Melancholic Alternative Rock, Post-Grunge, Pop Rock, Modern Hi-Fi Production, Gritty Emotional Male Vocals, Melodic Guitar Solo');
  const [lyrics, setLyrics] = useState(`[Intro: Atmospheric Synth & Distorted Guitar]

[Verse 1]
Walking through the neon rain
Shadows whisper out your name
Every chord is drenched in light
Chasing dawn into the night

[Pre-Chorus]
Can you hear the frequencies collide?
Everything we held inside

[Chorus: High Energy Hook]
Sonic waves carry us away
Breaking through the static gray
Turn the dial until it screams
Live inside the music dreams!

[Guitar Solo]

[Outro]
Fading into the midnight hum...`);
  const [negativeTags, setNegativeTags] = useState('low quality, muddy mix, distorted vocal, excessive autotune');
  const [vocalGender, setVocalGender] = useState<'m' | 'f'>('m');
  const [duration, setDuration] = useState(180);

  // System & Model Status
  const [models, setModels] = useState<ModelCapability[]>([]);
  const [hasKieAccounts, setHasKieAccounts] = useState<boolean | null>(null);

  // Active Generation Job State
  const [submitting, setSubmitting] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [activeJob, setActiveJob] = useState<GenerationJob | null>(null);
  const [activeTracks, setActiveTracks] = useState<GenerationTrack[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [refundNotif, setRefundNotif] = useState<string | null>(null);

  const checkCurrentStatus = async () => {
    if (!activeJob) return;
    setCheckingStatus(true);
    try {
      const res = await fetch(`/api/music/jobs/${activeJob.id}/status`);
      const text = await res.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch {}
      if (data && data.success) {
        setActiveJob(data.job);
        if (data.tracks && data.tracks.length > 0) {
          setActiveTracks(data.tracks);
        }
        if (data.status === 'COMPLETED') {
          refreshUser();
        }
        return;
      }
    } catch (e) {
      console.warn('API status check note:', e);
    }

    // Direct Firestore fallback
    try {
      const snap = await getDoc(doc(db, 'generation_jobs', activeJob.id));
      if (snap.exists()) {
        const liveJob = snap.data() as GenerationJob;
        setActiveJob(liveJob);
        const trSnap = await getDocs(query(collection(db, 'generation_tracks'), where('jobId', '==', activeJob.id)));
        if (!trSnap.empty) {
          setActiveTracks(trSnap.docs.map(d => d.data() as GenerationTrack));
        }
        if (liveJob.status === 'COMPLETED') {
          refreshUser();
        }
      }
    } catch (fsErr) {
      console.warn('Firestore fallback note:', fsErr);
    } finally {
      setCheckingStatus(false);
    }
  };

  // Fetch models & check KIE account availability & restore active job
  useEffect(() => {
    fetch('/api/music/models')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.models) {
          setModels(data.models);
        }
      })
      .catch(e => console.warn(e));

    // Check if any active KIE accounts exist
    fetch('/api/admin/kie-accounts', {
      headers: {
        'x-user-email': user?.email || '',
        'x-user-id': user?.id || ''
      }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && Array.isArray(data.accounts)) {
          const active = data.accounts.some((a: any) => a.status === 'ACTIVE');
          setHasKieAccounts(active);
        }
      })
      .catch(() => {
        setHasKieAccounts(true);
      });

    // Restore any active or recently created job for the user
    if (user) {
      fetch('/api/music/active', {
        headers: {
          'x-user-email': user.email || '',
          'x-user-id': user.id || ''
        }
      })
        .then(res => res.json())
        .then(data => {
          if (data.success && data.activeJob) {
            setActiveJob(data.activeJob);
            if (data.tracks && data.tracks.length > 0) {
              setActiveTracks(data.tracks);
            }
          }
        })
        .catch(e => console.warn(e));
    }
  }, [user]);

  // Models that strictly support target duration parameter in KIE.ai Suno API
  const isDurationSupported = customMode && (model === 'V6' || model === 'V6_MINI' || model === 'V6_WILD' || model === 'V5_5');

  // Selected Model Capabilities
  const foundModel = models.find(m => m.id === model);
  const selectedModelCap: ModelCapability = foundModel ? {
    ...foundModel,
    supportsDuration: isDurationSupported
  } : {
    id: model,
    name: model === 'V4_5' ? 'Suno V4.5' : model,
    description: '',
    supportsDuration: isDurationSupported,
    minDuration: 10,
    maxDuration: 360,
    supportsVocalGender: model !== 'V4_5' && model !== 'V4',
    supportsNegativeTags: model !== 'V4_5' && model !== 'V4' && model !== 'V5',
    maxPromptLength: 3000,
    maxStyleLength: 400,
    defaultCreditCost: model.startsWith('V6') ? 10 : 8,
    enabled: true
  };

  // Poll for job status updates when a job is active
  useEffect(() => {
    if (!activeJob || activeJob.status === 'COMPLETED' || activeJob.status === 'FAILED') {
      return;
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/music/jobs/${activeJob.id}/status`);
        const data = await res.json().catch(() => null);

        if (data?.success) {
          setActiveJob(data.job);
          if (data.tracks && data.tracks.length > 0) {
            setActiveTracks(data.tracks);
          }

          if (data.status === 'COMPLETED') {
            clearInterval(interval);
            refreshUser();
            return;
          } else if (data.status === 'FAILED') {
            clearInterval(interval);
            setErrorMsg(data.error || 'Music generation failed. Please try again.');
            setRefundNotif('Credits have been automatically refunded to your balance.');
            refreshUser();
            return;
          }
        }

        // Direct client Firestore fallback check
        const jobSnap = await getDoc(doc(db, 'generation_jobs', activeJob.id)).catch(() => null);
        if (jobSnap?.exists()) {
          const jData = { id: jobSnap.id, ...jobSnap.data() } as GenerationJob;
          setActiveJob(jData);
          const tracksSnap = await getDocs(query(collection(db, 'generation_tracks'), where('jobId', '==', activeJob.id))).catch(() => null);
          if (tracksSnap && !tracksSnap.empty) {
            const trks = tracksSnap.docs.map(d => ({ id: d.id, ...d.data() } as GenerationTrack));
            setActiveTracks(trks);
          }
          if (jData.status === 'COMPLETED') {
            clearInterval(interval);
            refreshUser();
          } else if (jData.status === 'FAILED') {
            clearInterval(interval);
            setErrorMsg(jData.errorMessage || 'Music generation failed. Please try again.');
            setRefundNotif('Credits have been automatically refunded to your balance.');
            refreshUser();
          }
        }
      } catch (err) {
        console.warn('Status poll error:', err);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [activeJob, refreshUser]);

  // Insert lyrics tag helper
  const insertTag = (tag: string) => {
    setLyrics(prev => prev + `\n\n${tag}\n`);
  };

  // Preset styles
  const presetStyles = [
    '125 BPM, Melancholic Alternative Rock, Post-Grunge, Pop Rock, Modern Hi-Fi Production, Gritty Emotional Male Vocals, Melodic Guitar Solo',
    'Synthwave, Cyberpunk, 118 BPM, Analog Synths, Driving Bassline, Neon 80s Vibe, Powerful Female Vocals',
    'Cinematic Epic Orchestral, Hans Zimmer Style, Huge Brass, Driving Taiko Drums, Soaring Strings, No Vocals',
    'Acoustic Indie Folk, Fingerpicked Guitar, Warm Intimate Vocals, Melancholic Strings, Lo-Fi Ambience',
    'Dark Underground Techno, 134 BPM, Acid 303 Bassline, Industrial Percussion, Hypnotic Groove',
    'Modern Lo-Fi Hip Hop, Relaxed Jazz Chords, Rainy Vinyl Crackle, Mellow Electric Piano, Head-nodding Beats'
  ];

  // Handle Generate
  const handleGenerate = async () => {
    if (!title.trim()) {
      setErrorMsg('Please enter a song title.');
      return;
    }
    if (!style.trim()) {
      setErrorMsg('Please enter a style prompt.');
      return;
    }
    if (!instrumental && customMode && !lyrics.trim()) {
      setErrorMsg('Please enter lyrics or toggle Instrumental mode ON.');
      return;
    }

    setErrorMsg(null);
    setRefundNotif(null);
    setSubmitting(true);
    setActiveTracks([]);

    try {
      let dispatchJob: GenerationJob | null = null;

      // 1. Try server endpoint first
      try {
        const res = await fetch('/api/music/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-user-id': user?.id || 'admin_altamedia',
            'x-user-email': user?.email || 'altamedia51@gmail.com'
          },
          body: JSON.stringify({
            title,
            lyrics: instrumental ? '' : lyrics,
            style,
            model,
            customMode,
            instrumental,
            negativeTags: selectedModelCap.supportsNegativeTags ? negativeTags : undefined,
            vocalGender: selectedModelCap.supportsVocalGender && !instrumental ? vocalGender : undefined,
            duration: isDurationSupported ? duration : undefined
          })
        });

        const text = await res.text();
        let data: any = null;
        try {
          data = JSON.parse(text);
        } catch {}

        if (res.ok && data?.success && data?.job) {
          dispatchJob = data.job;
        } else if (data?.code === 'INSUFFICIENT_CREDITS' || data?.code === 'VALIDATION_ERROR' || data?.code === 'MAINTENANCE_MODE') {
          // Genuine business error: throw directly
          throw new Error(data.message || 'Generation request rejected');
        }
      } catch (err: any) {
        if (err.message && (err.message.includes('Insufficient') || err.message.includes('Lyrics') || err.message.includes('Maintenance'))) {
          throw err;
        }
        console.warn('[Studio] Serverless invoke note, attempting direct failover:', err.message);
      }

      // 2. Direct client-side failover fallback if serverless invocation failed or timed out
      if (!dispatchJob) {
        const kieSnap = await getDocs(collection(db, 'kie_accounts'));
        const activeAcc = kieSnap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter((a: any) => a.status === 'ACTIVE' && (a.apiKey || a.encryptedApiKey))
          .sort((a, b) => (b.priority || 0) - (a.priority || 0) || (b.credits || 0) - (a.credits || 0))[0];

        if (!activeAcc) {
          throw new Error('No active KIE provider account found. Please check Admin Portal.');
        }

        const rawApiKey = (activeAcc.apiKey || activeAcc.encryptedApiKey || '').trim();
        const cleanApiKey = rawApiKey.replace(/^Bearer\s+/i, '').replace(/^["']|["']$/g, '').trim();

        if (!cleanApiKey || cleanApiKey.length < 10) {
          throw new Error('KIE.ai API key is missing or invalid in your active account. Please go to Admin Portal -> KIE Provider Accounts to rotate/update the key.');
        }

        const promptText = instrumental ? '' : lyrics;

        const kiePayload: any = {
          model: 'ai-music-api/generate',
          callBackUrl: `${window.location.origin}/api/webhooks/kie/music`,
          input: {
            model,
            custom_mode: customMode,
            instrumental,
            title: title.trim(),
            style: style.trim(),
            prompt: promptText
          }
        };

        if (selectedModelCap.supportsNegativeTags && negativeTags.trim()) {
          kiePayload.input.negative_tags = negativeTags.trim();
        }
        if (selectedModelCap.supportsVocalGender && !instrumental && vocalGender) {
          kiePayload.input.vocal_gender = vocalGender;
        }
        if (isDurationSupported && duration) {
          kiePayload.input.duration = duration;
        }

        const kieRes = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cleanApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(kiePayload)
        });

        const kieText = await kieRes.text();
        let kieData: any = null;
        try { kieData = JSON.parse(kieText); } catch {}
        const taskId = kieData?.data?.taskId || kieData?.data?.task_id || kieData?.taskId || kieData?.task_id;

        if (!kieRes.ok || !taskId) {
          const rawErrMsg = kieData?.msg || kieData?.message || kieText.slice(0, 150) || `KIE request failed (${kieRes.status})`;
          if (kieRes.status === 401 || rawErrMsg.toLowerCase().includes('unauthorized') || rawErrMsg.toLowerCase().includes('authentication failed')) {
            throw new Error('KIE.ai API Key Authentication Failed (401). Please check or rotate your API key in Admin Portal -> KIE Accounts.');
          }
          throw new Error(rawErrMsg);
        }

        // Deduct user credits directly in Firestore
        const requiredCost = selectedModelCap.defaultCreditCost || 10;
        const currentCredits = user?.credits ?? credits ?? 0;
        const newCredits = Math.max(0, currentCredits - requiredCost);
        if (user) {
          await updateDoc(doc(db, 'users', user.id), {
            credits: newCredits,
            updatedAt: new Date().toISOString()
          }).catch(() => {});
        }

        const newJobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const localJob: GenerationJob = {
          id: newJobId,
          userId: user?.id || 'admin_altamedia',
          provider: 'KIE_SUNO',
          providerAccountId: activeAcc.id,
          providerAccountName: activeAcc.name,
          taskId,
          title: title.trim(),
          lyrics: promptText,
          style: style.trim(),
          model,
          instrumental,
          status: 'PROCESSING',
          creditReservation: requiredCost,
          creditFinalized: false,
          retryCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'generation_jobs', newJobId), localJob).catch(() => {});
        dispatchJob = localJob;
      }

      if (dispatchJob) {
        setActiveJob(dispatchJob);
        refreshUser();
      } else {
        throw new Error('Could not initiate music generation. Please try again.');
      }

    } catch (err: any) {
      setErrorMsg(err.message || 'Generation submission failed');
      refreshUser();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-32">
      
      {/* Studio Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 sm:mb-8">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/40 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live Suno V6 AI Engine
            </span>
            <span className="hidden sm:inline-block text-xs text-zinc-500 font-mono">No Mocks • Real Task Processing</span>
          </div>
          <h1 className="text-xl sm:text-3xl font-black tracking-tight text-white font-mono break-words">
            SONIC STUDIO <span className="text-amber-400">CONSOLE</span>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Professional AI music generation studio with granular prompt, lyrics structure, and vocal modeling.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] sm:text-[11px] text-zinc-500 uppercase font-medium">Estimated Cost</div>
              <div className="text-xs sm:text-sm font-bold text-amber-300 font-mono">
                {selectedModelCap.defaultCreditCost || 10} Credits
              </div>
            </div>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 font-mono font-bold text-xs">
              ⚡
            </div>
          </div>
        </div>
      </div>

      {/* Provider Warning Banner if no accounts configured (Admin only) */}
      {isAdmin && hasKieAccounts === false && (
        <div className="mb-6 p-4 rounded-xl bg-amber-950/40 border border-amber-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-amber-200">AI Engine Provider Not Configured</h4>
              <p className="text-xs text-amber-300/80 mt-0.5">
                No active generation keys were detected in your system. Please configure an active provider key in the Admin Portal to generate real audio.
              </p>
            </div>
          </div>
          {onGoToAdmin && (
            <button
              onClick={onGoToAdmin}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold whitespace-nowrap transition"
            >
              Configure Provider →
            </button>
          )}
        </div>
      )}

      {/* Error notification banner */}
      {errorMsg && (
        <div className="mb-6 p-4 rounded-xl bg-rose-950/50 border border-rose-800 flex items-start gap-3 text-rose-200 text-xs animate-in fade-in">
          <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold">{errorMsg}</p>
            {refundNotif && (
              <p className="mt-1 text-emerald-400 font-semibold">{refundNotif}</p>
            )}
          </div>
        </div>
      )}

      {/* Active Job Progress Display */}
      {activeJob && (
        <div className="mb-8 p-4 sm:p-6 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-xl overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-zinc-800">
            <div className="min-w-0 max-w-full">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="text-[11px] sm:text-xs text-zinc-400 font-mono truncate max-w-[180px] sm:max-w-none">
                  Job: {activeJob.id}
                </span>
                {activeJob.taskId && (
                  <span 
                    title={`Task ID: ${activeJob.taskId}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 text-[10px] text-amber-300 font-mono max-w-full truncate"
                  >
                    <span className="text-zinc-500">Task:</span>
                    <span className="font-semibold">
                      {activeJob.taskId.length > 16 
                        ? `${activeJob.taskId.slice(0, 8)}...${activeJob.taskId.slice(-6)}` 
                        : activeJob.taskId}
                    </span>
                  </span>
                )}
              </div>
              <h3 className="text-base sm:text-lg font-bold text-white mt-1 truncate">{activeJob.title}</h3>
            </div>

            {/* Genuine State Badge */}
            <div className="flex items-center gap-2">
              {activeJob.status === 'QUEUED' && (
                <span className="px-3 py-1 rounded-full bg-zinc-800 text-zinc-300 text-xs font-semibold flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> QUEUED
                </span>
              )}
              {activeJob.status === 'SUBMITTING' && (
                <span className="px-3 py-1 rounded-full bg-blue-950 text-blue-300 border border-blue-800 text-xs font-semibold flex items-center gap-1.5 animate-pulse">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> SUBMITTING TO ENGINE
                </span>
              )}
              {activeJob.status === 'PROCESSING' && (
                <span className="px-3 py-1 rounded-full bg-amber-950 text-amber-300 border border-amber-800 text-xs font-semibold flex items-center gap-1.5 animate-pulse">
                  <Flame className="w-3.5 h-3.5 text-amber-400 animate-bounce" /> GENERATING SUNO AUDIO
                </span>
              )}
              {activeJob.status === 'PARTIAL' && (
                <span className="px-3 py-1 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800 text-xs font-semibold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" /> FIRST TRACK READY
                </span>
              )}
              {activeJob.status === 'COMPLETED' && (
                <span className="px-3 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 text-xs font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> COMPLETED
                </span>
              )}
              {activeJob.status === 'FAILED' && (
                <span className="px-3 py-1 rounded-full bg-rose-950 text-rose-300 border border-rose-800 text-xs font-semibold flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400" /> FAILED (REFUNDED)
                </span>
              )}
            </div>
          </div>

          {/* Real State Sequence Tracker (Zero Fake Percentages!) */}
          <div className="py-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              <div className={`p-2 rounded-lg border ${
                activeJob.status === 'QUEUED' || activeJob.status === 'SUBMITTING' || activeJob.status === 'PROCESSING' || activeJob.status === 'COMPLETED'
                  ? 'bg-zinc-800/80 border-amber-500/50 text-amber-300'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-500'
              }`}>
                1. Job Queued
              </div>
              <div className={`p-2 rounded-lg border ${
                activeJob.status === 'SUBMITTING' || activeJob.status === 'PROCESSING' || activeJob.status === 'COMPLETED'
                  ? 'bg-zinc-800/80 border-amber-500/50 text-amber-300'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-500'
              }`}>
                2. Submitting to Engine
              </div>
              <div className={`p-2 rounded-lg border ${
                activeJob.status === 'PROCESSING' || activeJob.status === 'COMPLETED'
                  ? 'bg-zinc-800/80 border-amber-500/50 text-amber-300'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-500'
              }`}>
                3. Suno Neural Synthesis
              </div>
              <div className={`p-2 rounded-lg border ${
                activeJob.status === 'COMPLETED'
                  ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300 font-bold'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-500'
              }`}>
                4. Callback Completed
              </div>
            </div>

            {/* Timing Guidance & Force Status Check */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mt-3 pt-3 border-t border-zinc-800/80 text-xs text-zinc-400">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                <span>
                  Suno V6 neural generation typically takes <strong>60–180 seconds</strong>. Polling runs automatically in the background.
                </span>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto flex-shrink-0">
                <button
                  type="button"
                  onClick={checkCurrentStatus}
                  disabled={checkingStatus}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-300 font-semibold text-xs flex items-center gap-1.5 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checkingStatus ? 'animate-spin' : ''}`} />
                  Check Status Now
                </button>
                {activeJob.status === 'COMPLETED' && (
                  <button
                    type="button"
                    onClick={() => { setActiveJob(null); setActiveTracks([]); }}
                    className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white text-xs transition"
                  >
                    Clear Card
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Generated Tracks Results Display */}
          {activeTracks.length > 0 && (
            <div className="mt-4 pt-4 border-t border-zinc-800">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
                Generated Audio Variations ({activeTracks.length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeTracks.map((trk, idx) => (
                  <div 
                    key={trk.id} 
                    className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-zinc-700 flex items-center justify-between gap-3 group transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-lg bg-zinc-800 overflow-hidden flex-shrink-0 relative border border-zinc-700">
                        {trk.imageUrl ? (
                          <img src={trk.imageUrl} alt={trk.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-amber-400">
                            <Music className="w-5 h-5" />
                          </div>
                        )}
                        <button
                          onClick={() => playTrack(trk, activeJob)}
                          className="absolute inset-0 bg-black/50 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition"
                        >
                          {currentTrack?.id === trk.id && isPlaying ? (
                            <Pause className="w-5 h-5 fill-current" />
                          ) : (
                            <Play className="w-5 h-5 fill-current" />
                          )}
                        </button>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white truncate">
                            {trk.title || `Variation ${idx + 1}`}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-400 font-mono">
                            Ver {idx + 1}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                          {trk.duration ? `${Math.round(trk.duration)}s` : 'Audio track ready'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => playTrack(trk, activeJob)}
                        className={`p-2 rounded-lg transition ${
                          currentTrack?.id === trk.id && isPlaying 
                            ? 'bg-amber-500 text-black' 
                            : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                        }`}
                      >
                        {currentTrack?.id === trk.id && isPlaying ? (
                          <Pause className="w-4 h-4 fill-current" />
                        ) : (
                          <Play className="w-4 h-4 fill-current" />
                        )}
                      </button>

                      <a
                        href={`/api/music/download?url=${encodeURIComponent(trk.audioUrl)}&filename=${encodeURIComponent((trk.title || 'sonic-hub') + '.mp3')}`}
                        className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition"
                        title="Download MP3"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main Studio Controls Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Song Parameters (Title, Model, Mode, Style) */}
        <div className="lg:col-span-6 space-y-6">
          
          {/* Song Information Card */}
          <div className="p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
              <Music className="w-4 h-4 text-amber-400" />
              Song Information
            </h2>

            {/* Song Title */}
            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                Song Title <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Neon Horizon, Midnight Symphony"
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition"
              />
            </div>

            {/* Model & Custom Mode Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Music Model
                </label>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white outline-none transition font-mono"
                >
                  <option value="V6">V6 (Latest Flagship)</option>
                  <option value="V6_MINI">V6 Mini (Low Latency)</option>
                  <option value="V6_WILD">V6 Wild (Experimental)</option>
                  <option value="V5_5">V5.5 (Studio Polish)</option>
                  <option value="V5">V5 (Balanced Harmony)</option>
                  <option value="V4_5">V4.5 (Vintage Mix)</option>
                </select>
              </div>

              {/* Custom Mode Toggle */}
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Custom Mode
                </label>
                <div className="flex items-center gap-2 h-9">
                  <button
                    type="button"
                    onClick={() => setCustomMode(!customMode)}
                    className={`flex-1 h-full rounded-xl text-xs font-bold transition flex items-center justify-center border ${
                      customMode 
                        ? 'bg-amber-500/20 border-amber-500/80 text-amber-300' 
                        : 'bg-zinc-950 border-zinc-800 text-zinc-500'
                    }`}
                  >
                    {customMode ? 'ON (Full Control)' : 'OFF (Auto Prompt)'}
                  </button>
                </div>
              </div>
            </div>

            {/* Instrumental Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800">
              <div>
                <span className="text-xs font-semibold text-zinc-200 block">Instrumental Only</span>
                <span className="text-[11px] text-zinc-400">Generate music without vocal tracks</span>
              </div>
              <button
                type="button"
                onClick={() => setInstrumental(!instrumental)}
                className={`w-12 h-6 rounded-full transition-colors relative p-0.5 border ${
                  instrumental ? 'bg-amber-500 border-amber-400' : 'bg-zinc-800 border-zinc-700'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  instrumental ? 'translate-x-6' : 'translate-x-0'
                }`} />
              </button>
            </div>
          </div>

          {/* Style Prompt Section */}
          <div className="p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Sliders className="w-4 h-4 text-amber-400" />
                Style & Production Prompt
              </h2>
              <span className="text-[11px] font-mono text-zinc-500">Max 500 chars</span>
            </div>

            <textarea
              rows={3}
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="e.g. 125 BPM, Melancholic Alternative Rock, Post-Grunge, Hi-Fi Production..."
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl p-3 text-xs text-white placeholder-zinc-500 outline-none transition font-sans leading-relaxed resize-none"
            />

            {/* Quick Genre Chips */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-2">
                Curated Style Inceptions
              </p>
              <div className="flex flex-wrap gap-1.5">
                {presetStyles.map((pst, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setStyle(pst)}
                    className="px-2.5 py-1 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-800/80 text-[11px] text-zinc-300 transition text-left truncate max-w-[280px]"
                  >
                    {pst.split(',')[0]} - {pst.split(',')[1] || ''}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Model Dynamic Controls (Vocal Gender, Duration, Negative Tags) */}
          <div className="p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              Advanced Model Controls
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              {/* Vocal Gender */}
              {selectedModelCap.supportsVocalGender && !instrumental && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-300 mb-1.5 flex items-center gap-1.5">
                    <UserIcon className="w-3.5 h-3.5 text-zinc-400" />
                    Vocal Gender
                  </label>
                  <select
                    value={vocalGender}
                    onChange={(e) => setVocalGender(e.target.value as 'm' | 'f')}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white outline-none transition font-mono"
                  >
                    <option value="m">Male Vocal (m)</option>
                    <option value="f">Female Vocal (f)</option>
                  </select>
                </div>
              )}

              {/* Target Duration Slider */}
              {selectedModelCap.supportsDuration && customMode && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-zinc-400" />
                      Target Duration
                    </label>
                    <span className="text-xs font-mono font-bold text-amber-300">
                      {duration}s
                    </span>
                  </div>
                  <input
                    type="range"
                    min={selectedModelCap.minDuration || 10}
                    max={selectedModelCap.maxDuration || 360}
                    step={5}
                    value={duration}
                    onChange={(e) => setDuration(parseInt(e.target.value, 10))}
                    className="w-full h-1.5 bg-zinc-950 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                  <div className="flex justify-between text-[10px] text-zinc-500 mt-1 font-mono">
                    <span>{selectedModelCap.minDuration}s</span>
                    <span>{selectedModelCap.maxDuration}s</span>
                  </div>
                </div>
              )}

            </div>

            {/* Negative Tags */}
            {selectedModelCap.supportsNegativeTags && (
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Negative Tags (Sound exclusions)
                </label>
                <input
                  type="text"
                  value={negativeTags}
                  onChange={(e) => setNegativeTags(e.target.value)}
                  placeholder="e.g. low quality, muddy mix, distorted vocals"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl px-3 py-2 text-xs text-white placeholder-zinc-500 outline-none transition"
                />
              </div>
            )}

          </div>

        </div>

        {/* Right Column: Professional Lyrics Editor & Generate Button */}
        <div className="lg:col-span-6 space-y-6">
          
          <div className="p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-amber-400" />
                  Lyrics & Song Structure Editor
                </h2>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Exact text is preserved and dispatched to Suno engine without automatic modification.
                </p>
              </div>
              <span className="text-[11px] font-mono text-zinc-500">
                {lyrics.length} chars
              </span>
            </div>

            {/* Structural Insertion Tags */}
            <div className="flex flex-wrap gap-1.5">
              {['[Intro]', '[Verse 1]', '[Pre-Chorus]', '[Chorus]', '[Verse 2]', '[Bridge]', '[Guitar Solo]', '[Outro]'].map(t => (
                <button
                  key={t}
                  type="button"
                  disabled={instrumental}
                  onClick={() => insertTag(t)}
                  className="px-2 py-1 rounded bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-[10px] font-mono text-amber-300 transition disabled:opacity-40"
                >
                  +{t}
                </button>
              ))}
            </div>

            {/* Large Professional Lyrics Editor */}
            <div className="relative">
              <textarea
                rows={16}
                disabled={instrumental}
                value={instrumental ? '/// INSTRUMENTAL MODE ACTIVE - NO VOCALS ///' : lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                placeholder="[Intro]\nEnter your lyrics here..."
                className={`w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl p-4 text-xs font-mono leading-relaxed outline-none transition resize-none ${
                  instrumental ? 'text-zinc-600 bg-zinc-950/40 italic' : 'text-zinc-200'
                }`}
              />
            </div>

            {/* Submit / Generate Button */}
            <button
              type="button"
              disabled={submitting || (activeJob !== null && (activeJob.status === 'PROCESSING' || activeJob.status === 'SUBMITTING'))}
              onClick={handleGenerate}
              className={`w-full py-4 rounded-xl font-black text-sm uppercase tracking-wider shadow-xl transition-all flex items-center justify-center gap-2 ${
                submitting || (activeJob && (activeJob.status === 'PROCESSING' || activeJob.status === 'SUBMITTING'))
                  ? 'bg-zinc-800 text-zinc-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-amber-500 via-rose-600 to-indigo-600 hover:from-amber-400 hover:via-rose-500 hover:to-indigo-500 text-white shadow-rose-900/30 hover:scale-[1.01]'
              }`}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  SUBMITTING GENERATION REQUEST...
                </>
              ) : activeJob && (activeJob.status === 'PROCESSING' || activeJob.status === 'SUBMITTING') ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  GENERATING MUSIC IN STUDIO ({activeJob.status})...
                </>
              ) : (
                <>
                  <Music className="w-5 h-5" />
                  🎵 GENERATE MUSIC
                </>
              )}
            </button>

            <div className="flex items-center justify-between text-[11px] text-zinc-500 px-1">
              <span>Cost: {selectedModelCap.defaultCreditCost || 10} credits reserved</span>
              <span>Available: {credits} credits</span>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
};
