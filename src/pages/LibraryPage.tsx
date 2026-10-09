import React, { useState, useEffect } from 'react';
import { 
  Disc, 
  Play, 
  Pause, 
  Download, 
  Search, 
  Music, 
  Clock, 
  Filter, 
  Sparkles,
  ExternalLink,
  RefreshCw,
  Flame,
  Loader2,
  FileText,
  Trash2,
  CheckCircle2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { GenerationJob, GenerationTrack } from '../types';
import { db } from '../firebase/config';
import { collection, getDocs, query, where, orderBy, doc, setDoc, updateDoc } from 'firebase/firestore';
import { downloadAudioFile } from '../utils/download';

interface LibraryItem {
  job: GenerationJob;
  tracks: GenerationTrack[];
}

export const LibraryPage: React.FC<{ onOpenStudio: () => void }> = ({ onOpenStudio }) => {
  const { user } = useAuth();
  const { playTrack, currentTrack, isPlaying, openSongDetails } = usePlayer();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [activeJobs, setActiveJobs] = useState<GenerationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [modelFilter, setModelFilter] = useState('ALL');

  // Deletion modal state
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'job' | 'track';
    id: string;
    title: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [deleteSuccessMsg, setDeleteSuccessMsg] = useState<string | null>(null);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const endpoint = deleteTarget.type === 'job' 
        ? `/api/music/jobs/${deleteTarget.id}`
        : `/api/music/tracks/${deleteTarget.id}`;

      const res = await fetch(endpoint, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${user?.id || ''}`,
          'x-user-id': user?.id || '',
          'x-user-email': user?.email || ''
        }
      });

      const data = await res.json().catch(() => null);

      if (res.ok && data?.success) {
        if (deleteTarget.type === 'job') {
          setItems(prev => prev.filter(item => item.job.id !== deleteTarget.id));
          setActiveJobs(prev => prev.filter(j => j.id !== deleteTarget.id));
          window.dispatchEvent(new CustomEvent('music_deleted', { detail: { jobId: deleteTarget.id } }));
        } else {
          setItems(prev => prev.map(item => ({
            ...item,
            tracks: item.tracks.filter(t => t.id !== deleteTarget.id)
          })).filter(item => item.tracks.length > 0));
          window.dispatchEvent(new CustomEvent('music_deleted', { detail: { trackId: deleteTarget.id } }));
        }

        setDeleteSuccessMsg(`"${deleteTarget.title}" berhasil dihapus.`);
        setTimeout(() => setDeleteSuccessMsg(null), 3500);
      } else {
        alert(data?.message || 'Gagal menghapus musik');
      }
    } catch (err: any) {
      alert('Terjadi kesalahan saat menghapus musik: ' + err.message);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const fetchLibrary = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setRefreshing(true);
      const res = await fetch('/api/music/library', {
        headers: {
          'x-user-id': user?.id || '',
          'x-user-email': user?.email || '',
          'x-personal-kie-key': user?.personalKieApiKey || ''
        }
      });
      const data = await res.json().catch(() => null);
      if (data?.success && Array.isArray(data.items)) {
        setItems(data.items);
        if (Array.isArray(data.activeJobs)) {
          setActiveJobs(data.activeJobs);
        }
        return;
      }

      // Direct Firestore Fallback
      try {
        const uId = user?.id || 'usr_altamedia51_gmail_com';
        const jobsSnap = await getDocs(query(
          collection(db, 'generation_jobs'),
          where('userId', '==', uId),
          orderBy('createdAt', 'desc')
        )).catch(async () => {
          // Fallback query without orderBy if composite index is pending
          return await getDocs(query(collection(db, 'generation_jobs'), where('userId', '==', uId)));
        });

        if (jobsSnap && !jobsSnap.empty) {
          const userJobs = jobsSnap.docs
            .map(d => ({ id: d.id, ...d.data() } as GenerationJob))
            .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

          const trSnap = await getDocs(query(collection(db, 'generation_tracks'), where('userId', '==', uId)));
          const trackMap = new Map<string, GenerationTrack[]>();
          trSnap.docs.forEach(d => {
            const trk = { id: d.id, ...d.data() } as GenerationTrack;
            const list = trackMap.get(trk.jobId) || [];
            list.push(trk);
            trackMap.set(trk.jobId, list);
          });

          const libItems: LibraryItem[] = userJobs.map(job => ({
            job,
            tracks: trackMap.get(job.id) || []
          }));

          setItems(libItems);
          setActiveJobs(userJobs.filter(j => j.status === 'QUEUED' || j.status === 'SUBMITTING' || j.status === 'PROCESSING'));
        }
      } catch (fsErr) {
        console.warn('Firestore library fallback error:', fsErr);
      }
    } catch (e) {
      console.warn('Failed to load library:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const [checkingJobId, setCheckingJobId] = useState<string | null>(null);

  const checkSingleActiveJob = async (job: GenerationJob) => {
    if (!job?.taskId) return;
    setCheckingJobId(job.id);
    try {
      // 1. If user has personal KIE key, try direct query to KIE
      const cleanKey = (user?.personalKieApiKey || '').replace(/^Bearer\s+/i, '').replace(/^["']|["']$/g, '').trim();
      let kData: any = null;

      if (cleanKey.length >= 10) {
        try {
          const res = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${job.taskId}`, {
            headers: {
              'Authorization': `Bearer ${cleanKey}`,
              'Content-Type': 'application/json'
            }
          });
          if (res.ok) {
            kData = await res.json().catch(() => null);
          }
        } catch (e) {}
      }

      if (kData?.code === 200 && kData?.data) {
        let rawList: any[] = [];
        if (Array.isArray(kData?.data?.response?.data)) rawList = kData.data.response.data;
        else if (kData?.data?.resultJson) {
          try {
            const parsed = JSON.parse(kData.data.resultJson);
            if (Array.isArray(parsed?.data)) rawList = parsed.data;
          } catch {}
        }

        if (rawList.length > 0) {
          for (let i = 0; i < rawList.length; i++) {
            const tr = rawList[i];
            const audioUrl = tr.audio_url || tr.audioUrl;
            if (audioUrl) {
              const tId = `trk_${tr.id || Math.random().toString(36).slice(2, 7)}_${i}`;
              await setDoc(doc(db, 'generation_tracks', tId), {
                id: tId,
                jobId: job.id,
                userId: job.userId,
                providerTrackId: tr.id || String(i),
                audioUrl: audioUrl,
                streamAudioUrl: tr.stream_audio_url || tr.streamAudioUrl || audioUrl,
                imageUrl: tr.image_url || tr.imageUrl,
                title: `${job.title} (Part ${i + 1})`,
                tags: job.style,
                modelName: tr.model_name || tr.modelName || job.model,
                duration: tr.duration,
                createdAt: new Date().toISOString()
              }, { merge: true }).catch(() => {});
            }
          }

          await updateDoc(doc(db, 'generation_jobs', job.id), {
            status: 'COMPLETED',
            updatedAt: new Date().toISOString(),
            completedAt: new Date().toISOString()
          }).catch(() => {});
        }
      }

      // 2. Also call server job status route
      await fetch(`/api/music/jobs/${job.id}`, {
        headers: {
          'x-user-id': user?.id || '',
          'x-user-email': user?.email || '',
          'x-personal-kie-key': user?.personalKieApiKey || ''
        }
      }).catch(() => {});

    } catch (err) {
      console.warn('Check active job error:', err);
    } finally {
      setCheckingJobId(null);
      await fetchLibrary(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, [user]);

  // Listen to external music deletion events (e.g. from modal or studio)
  useEffect(() => {
    const handleMusicDeleted = (e: any) => {
      const { jobId, trackId } = e.detail || {};
      if (jobId) {
        setItems(prev => prev.filter(item => item.job.id !== jobId));
        setActiveJobs(prev => prev.filter(j => j.id !== jobId));
      }
      if (trackId) {
        setItems(prev => prev.map(item => ({
          ...item,
          tracks: item.tracks.filter(t => t.id !== trackId)
        })).filter(item => item.tracks.length > 0));
      }
    };
    window.addEventListener('music_deleted', handleMusicDeleted);
    return () => window.removeEventListener('music_deleted', handleMusicDeleted);
  }, []);

  // Periodic poll if any jobs are active
  useEffect(() => {
    if (activeJobs.length === 0) return;
    const interval = setInterval(() => {
      for (const j of activeJobs) {
        checkSingleActiveJob(j);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [activeJobs]);

  const filteredItems = items.filter(({ job, tracks }) => {
    const matchesSearch = 
      job.title.toLowerCase().includes(search.toLowerCase()) ||
      job.style.toLowerCase().includes(search.toLowerCase());
    const matchesModel = modelFilter === 'ALL' || job.model === modelFilter;
    return matchesSearch && matchesModel;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-32">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white font-mono flex items-center gap-3">
            <Disc className="w-7 h-7 text-amber-400" />
            MY AUDIO <span className="text-amber-400">LIBRARY</span>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Browse, play, and download your authentic studio Suno music generations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchLibrary(false)}
            disabled={refreshing}
            className="px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-xs font-semibold text-zinc-300 flex items-center gap-2 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-amber-400' : ''}`} />
            Refresh Status
          </button>
          <button
            onClick={onOpenStudio}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-900/20 flex items-center gap-2 transition"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Create New Song
          </button>
        </div>
      </div>

      {/* Active Jobs in Progress Banner */}
      {activeJobs.length > 0 && (
        <div className="mb-8 p-5 rounded-2xl bg-gradient-to-r from-amber-950/40 via-zinc-900 to-zinc-900 border border-amber-800/50 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-amber-400 animate-bounce" />
              <h3 className="text-sm font-bold text-white">
                Music Synthesizing in Studio ({activeJobs.length} active {activeJobs.length === 1 ? 'task' : 'tasks'})
              </h3>
            </div>
            <span className="text-[11px] text-zinc-400 flex items-center gap-1.5 font-mono">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
              Typically 60–180s
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {activeJobs.map(j => (
              <div key={j.id} className="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openSongDetails(null, j)}
                      className="group/t text-left flex items-center gap-1 hover:text-amber-400 min-w-0"
                      title="Klik untuk melihat Style dan Lirik lagu ini"
                    >
                      <span className="text-xs font-bold text-white group-hover/t:text-amber-400 truncate underline decoration-dotted decoration-zinc-600 group-hover/t:decoration-amber-400 transition">
                        {j.title}
                      </span>
                      <FileText className="w-3 h-3 text-zinc-500 group-hover/t:text-amber-400 flex-shrink-0 transition" />
                    </button>
                    <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 font-mono text-[10px]">
                      {j.model}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 font-mono mt-0.5 truncate">
                    Task: {j.taskId || 'Dispatching'} • Started {new Date(j.createdAt).toLocaleTimeString()}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => checkSingleActiveJob(j)}
                    disabled={checkingJobId === j.id}
                    className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-xs font-medium text-amber-300 transition flex items-center gap-1 flex-shrink-0"
                  >
                    <RefreshCw className={`w-3 h-3 ${checkingJobId === j.id ? 'animate-spin' : ''}`} />
                    Check
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget({ type: 'job', id: j.id, title: j.title })}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                    title="Hapus / Batalkan tugas ini"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-6 bg-zinc-900/60 p-3 rounded-2xl border border-zinc-800">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or genre..."
            className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 outline-none transition"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-zinc-500" />
          <select
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none font-mono"
          >
            <option value="ALL">All Models</option>
            <option value="V6">V6</option>
            <option value="V6_MINI">V6 Mini</option>
            <option value="V6_WILD">V6 Wild</option>
            <option value="V5_5">V5.5</option>
            <option value="V5">V5</option>
            <option value="V4_5">V4.5</option>
          </select>
        </div>
      </div>

      {/* Songs Grid */}
      {loading ? (
        <div className="py-20 text-center text-zinc-500 text-xs font-mono">
          Loading your audio library...
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-zinc-900/40 border border-zinc-800/80">
          <Disc className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">No Generated Songs Found</h3>
          <p className="text-xs text-zinc-400 mt-1 max-w-sm mx-auto">
            {search ? 'Try adjusting your search query.' : 'Head over to the Studio to generate your first AI music track with real Suno V6!'}
          </p>
          <button
            onClick={onOpenStudio}
            className="mt-4 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition"
          >
            Open Studio
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map(({ job, tracks }) => {
            const firstTrack = tracks[0];
            return (
              <div 
                key={job.id}
                className="group rounded-2xl bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700/80 overflow-hidden shadow-lg transition-all flex flex-col justify-between"
              >
                {/* Artwork & Quick Play */}
                <div className="relative aspect-video bg-zinc-950 overflow-hidden">
                  {firstTrack?.imageUrl ? (
                    <img 
                      src={firstTrack.imageUrl} 
                      alt={job.title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-tr from-zinc-900 via-amber-950/40 to-rose-950/40">
                      <Music className="w-12 h-12 text-zinc-700" />
                    </div>
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

                  {/* Play Overlay */}
                  {firstTrack && (
                    <button
                      onClick={() => playTrack(firstTrack, job)}
                      className="absolute bottom-3 right-3 w-10 h-10 rounded-full bg-gradient-to-r from-amber-500 to-rose-600 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform"
                    >
                      {currentTrack?.id === firstTrack.id && isPlaying ? (
                        <Pause className="w-5 h-5 fill-current" />
                      ) : (
                        <Play className="w-5 h-5 fill-current translate-x-0.5" />
                      )}
                    </button>
                  )}

                  {/* Model badge */}
                  <div className="absolute top-3 left-3 flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded bg-black/60 backdrop-blur-md text-[10px] font-bold text-amber-300 font-mono border border-white/10">
                      {job.model}
                    </span>
                    {job.instrumental && (
                      <span className="px-2 py-0.5 rounded bg-black/60 backdrop-blur-md text-[10px] font-bold text-zinc-300 border border-white/10">
                        INST
                      </span>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => openSongDetails(tracks[0] || null, job)}
                        className="group/j text-left flex items-center gap-1.5 hover:text-amber-400 min-w-0 max-w-full"
                        title="Klik untuk melihat Style dan Lirik lagu ini"
                      >
                        <h3 className="text-sm font-bold text-white group-hover/j:text-amber-400 truncate underline decoration-dotted decoration-zinc-600 group-hover/j:decoration-amber-400 transition">
                          {job.title}
                        </h3>
                        <FileText className="w-3.5 h-3.5 text-zinc-500 group-hover/j:text-amber-400 flex-shrink-0 transition" />
                      </button>
                      <p 
                        onClick={() => openSongDetails(tracks[0] || null, job)}
                        className="text-xs text-zinc-400 line-clamp-2 mt-1 font-sans cursor-pointer hover:text-zinc-200 transition"
                        title="Klik untuk melihat Style dan Lirik lengkap"
                      >
                        {job.style}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDeleteTarget({ type: 'job', id: job.id, title: job.title })}
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition flex-shrink-0"
                      title="Hapus Lagu Ini"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Track Variations list */}
                  <div className="space-y-1.5 pt-2 border-t border-zinc-800">
                    <span className="text-[10px] uppercase font-bold text-zinc-500 block">
                      Track Variations ({tracks.length})
                    </span>
                    {tracks.map((t, idx) => (
                      <div 
                        key={t.id}
                        className={`flex items-center justify-between p-1.5 rounded-lg text-xs ${
                          currentTrack?.id === t.id ? 'bg-amber-500/10 text-amber-300' : 'bg-zinc-950/60 text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <button
                            onClick={() => playTrack(t, job)}
                            className="p-1 text-zinc-400 hover:text-white"
                          >
                            {currentTrack?.id === t.id && isPlaying ? (
                              <Pause className="w-3.5 h-3.5" />
                            ) : (
                              <Play className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => openSongDetails(t, job)}
                            className="text-left group/t truncate text-[11px] text-zinc-300 hover:text-amber-300 flex items-center gap-1 transition"
                            title="Klik untuk melihat Style dan Lirik versi ini"
                          >
                            <span className="truncate group-hover/t:underline">{t.title || `Version ${idx + 1}`}</span>
                            <FileText className="w-2.5 h-2.5 text-zinc-500 group-hover/t:text-amber-400 flex-shrink-0" />
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {t.duration && (
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {Math.round(t.duration)}s
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => downloadAudioFile(t.audioUrl, t.title || job.title)}
                            className="p-1 text-zinc-400 hover:text-white transition"
                            title="Download track"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget({ type: 'track', id: t.id, title: t.title || `Variasi ${idx + 1}` })}
                            className="p-1 text-zinc-500 hover:text-rose-400 transition"
                            title="Hapus variasi ini"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-2 font-mono">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(job.createdAt).toLocaleDateString()}
                    </span>
                    <span>Task: {job.taskId?.slice(0, 10)}...</span>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Success Toast Notification */}
      {deleteSuccessMsg && (
        <div className="fixed bottom-24 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-950/90 border border-emerald-800 text-emerald-300 text-xs shadow-2xl backdrop-blur-md animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{deleteSuccessMsg}</span>
        </div>
      )}

      {/* Delete Confirmation Modal Dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md p-6 rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {deleteTarget.type === 'job' ? 'Hapus Lagu Ini?' : 'Hapus Variasi Track?'}
                </h3>
                <p className="text-xs text-zinc-400">Tindakan ini permanen dan tidak dapat dibatalkan</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-950/70 border border-zinc-800 text-xs text-zinc-300">
              <p className="font-semibold text-white mb-1">{deleteTarget.title}</p>
              <p className="text-zinc-400">
                {deleteTarget.type === 'job' 
                  ? 'Seluruh lagu ini beserta semua file audio variasinya akan dihapus dari library musik Anda.'
                  : 'Variasi track audio ini akan dihapus dari proyek lagu.'}
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-300 hover:text-white hover:bg-zinc-800 transition disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-1.5 transition shadow-lg shadow-rose-600/20 disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Menghapus...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Ya, Hapus Musik
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
