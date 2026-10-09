import React, { useState, useEffect } from 'react';
import { 
  X, 
  Music, 
  Sparkles, 
  FileText, 
  Copy, 
  Check, 
  Play, 
  Pause, 
  Download, 
  Volume2, 
  Disc, 
  Sliders, 
  Wand2, 
  Tag, 
  Mic2,
  Clock,
  Layers,
  ArrowRight,
  Trash2,
  Loader2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { GenerationJob, GenerationTrack } from '../types';
import { db } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { downloadAudioFile } from '../utils/download';
import { resolvePlayableAudioUrl } from '../utils/audioUrl';

interface SongDetailsModalProps {
  onApplyToStudio?: (songData: {
    title: string;
    style: string;
    lyrics: string;
    instrumental: boolean;
    model: string;
    negativeTags?: string;
    vocalGender?: 'm' | 'f';
  }) => void;
}

export const SongDetailsModal: React.FC<SongDetailsModalProps> = ({ onApplyToStudio }) => {
  const { 
    songDetails, 
    isSongDetailsOpen, 
    closeSongDetails, 
    playTrack, 
    currentTrack, 
    isPlaying 
  } = usePlayer();

  const { user } = useAuth();
  const [copiedLyrics, setCopiedLyrics] = useState(false);
  const [copiedStyle, setCopiedStyle] = useState(false);
  const [copiedTitle, setCopiedTitle] = useState(false);
  const [fetchedJob, setFetchedJob] = useState<GenerationJob | null>(null);
  const [loadingJob, setLoadingJob] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'lyrics' | 'style'>('all');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const rawTrack = songDetails?.track || null;
  const rawJob = songDetails?.job || fetchedJob;

  // Reset delete confirm state when modal is reopened
  useEffect(() => {
    if (!isSongDetailsOpen) {
      setShowDeleteConfirm(false);
      setIsDeleting(false);
    }
  }, [isSongDetailsOpen]);

  const handleDeleteSong = async () => {
    const targetJobId = rawJob?.id || rawTrack?.jobId;
    const targetTrackId = rawTrack?.id;

    if (!targetJobId && !targetTrackId) return;

    setIsDeleting(true);
    try {
      const endpoint = targetJobId 
        ? `/api/music/jobs/${targetJobId}` 
        : `/api/music/tracks/${targetTrackId}`;

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
        if (targetJobId) {
          window.dispatchEvent(new CustomEvent('music_deleted', { detail: { jobId: targetJobId } }));
        } else if (targetTrackId) {
          window.dispatchEvent(new CustomEvent('music_deleted', { detail: { trackId: targetTrackId } }));
        }
        closeSongDetails();
      } else {
        alert(data?.message || 'Gagal menghapus musik');
      }
    } catch (err: any) {
      alert('Terjadi kesalahan saat menghapus: ' + err.message);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  // Auto fetch job if not provided but track.jobId is available
  useEffect(() => {
    if (!isSongDetailsOpen) {
      setFetchedJob(null);
      setLoadingJob(false);
      return;
    }

    if (rawTrack?.jobId && !songDetails?.job) {
      setLoadingJob(true);
      getDoc(doc(db, 'generation_jobs', rawTrack.jobId))
        .then((snap) => {
          if (snap.exists()) {
            setFetchedJob({ id: snap.id, ...snap.data() } as GenerationJob);
          }
        })
        .catch((err) => {
          console.warn('[SongDetailsModal] Error fetching job:', err);
        })
        .finally(() => {
          setLoadingJob(false);
        });
    }
  }, [isSongDetailsOpen, rawTrack?.jobId, songDetails?.job]);

  // Handle keyboard Escape to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSongDetailsOpen) {
        closeSongDetails();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSongDetailsOpen, closeSongDetails]);

  if (!isSongDetailsOpen) return null;

  const title = rawTrack?.title || rawJob?.title || 'Lagu Tanpa Judul';
  const style = rawJob?.style || rawTrack?.tags || 'Tidak ada deskripsi style';
  const lyrics = rawJob?.lyrics || rawTrack?.prompt || '';
  const isInstrumental = Boolean(rawJob?.instrumental);
  const model = rawJob?.model || rawTrack?.modelName || 'V6';
  const vocalGender = rawJob?.vocalGender;
  const negativeTags = rawJob?.negativeTags;
  const duration = rawTrack?.duration || rawJob?.duration;
  const playableUrl = rawTrack ? resolvePlayableAudioUrl(rawTrack) : '';
  const isThisPlaying = currentTrack?.id === rawTrack?.id && isPlaying;

  const copyToClipboard = (text: string, type: 'lyrics' | 'style' | 'title') => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    if (type === 'lyrics') {
      setCopiedLyrics(true);
      setTimeout(() => setCopiedLyrics(false), 2000);
    } else if (type === 'style') {
      setCopiedStyle(true);
      setTimeout(() => setCopiedStyle(false), 2000);
    } else if (type === 'title') {
      setCopiedTitle(true);
      setTimeout(() => setCopiedTitle(false), 2000);
    }
  };

  const handleApplyToStudio = () => {
    const payload = {
      title,
      style: rawJob?.style || rawTrack?.tags || '',
      lyrics: rawJob?.lyrics || rawTrack?.prompt || '',
      instrumental: isInstrumental,
      model,
      negativeTags,
      vocalGender: vocalGender as 'm' | 'f' | undefined
    };

    if (onApplyToStudio) {
      onApplyToStudio(payload);
    }

    // Also dispatch a window event for flexible listening in any page
    window.dispatchEvent(new CustomEvent('load_song_to_studio', { detail: payload }));
    closeSongDetails();
  };

  // Render formatted lyrics with colored section tags (e.g. [Verse 1], [Chorus])
  const renderLyricsFormatted = (text: string) => {
    if (!text || !text.trim()) {
      return (
        <div className="py-8 text-center text-zinc-500 italic text-sm">
          Tidak ada teks lirik tersimpan untuk lagu ini.
        </div>
      );
    }

    const lines = text.split('\n');
    return (
      <div className="space-y-1 font-sans text-sm leading-relaxed text-zinc-200">
        {lines.map((line, idx) => {
          const trimmed = line.trim();
          const isSectionHeader = /^\[.*\]$/.test(trimmed);

          if (isSectionHeader) {
            return (
              <div key={idx} className="pt-3 pb-1">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-xs font-bold uppercase tracking-wide">
                  <Mic2 className="w-3 h-3 text-amber-400" />
                  {trimmed}
                </span>
              </div>
            );
          }

          if (!trimmed) {
            return <div key={idx} className="h-2" />;
          }

          return (
            <div key={idx} className="text-zinc-300 hover:text-white transition-colors">
              {line}
            </div>
          );
        })}
      </div>
    );
  };

  // Split tags into individual badges if comma or semicolon separated
  const styleTags = style
    ? style.split(/[,;]+/).map(s => s.trim()).filter(Boolean)
    : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden text-zinc-100">
        
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-zinc-800 bg-zinc-950/60 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            {/* Thumbnail */}
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-zinc-800 border border-zinc-700 overflow-hidden flex-shrink-0 relative group shadow-md">
              {rawTrack?.imageUrl ? (
                <img 
                  src={rawTrack.imageUrl} 
                  alt={title} 
                  className="w-full h-full object-cover" 
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-tr from-amber-600 to-rose-700 text-white">
                  <Disc className="w-7 h-7" />
                </div>
              )}
              {rawTrack && (
                <button
                  type="button"
                  onClick={() => playTrack(rawTrack, rawJob || undefined)}
                  className="absolute inset-0 bg-black/50 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition"
                  title={isThisPlaying ? "Pause" : "Putar lagu"}
                >
                  {isThisPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}
                </button>
              )}
            </div>

            {/* Title & Metadata */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-[10px] font-bold">
                  Suno {model}
                </span>

                {isInstrumental ? (
                  <span className="px-2 py-0.5 rounded bg-purple-950 border border-purple-800/60 text-purple-300 text-[10px] font-semibold flex items-center gap-1">
                    <Music className="w-2.5 h-2.5" /> Instrumental
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded bg-blue-950 border border-blue-800/60 text-blue-300 text-[10px] font-semibold flex items-center gap-1">
                    <Mic2 className="w-2.5 h-2.5" />
                    {vocalGender === 'm' ? 'Vokal Pria' : vocalGender === 'f' ? 'Vokal Wanita' : 'Vokal'}
                  </span>
                )}

                {duration && (
                  <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono text-[10px] flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5 text-zinc-400" />
                    {Math.round(duration)}s
                  </span>
                )}

                {loadingJob && (
                  <span className="text-[10px] text-zinc-500 italic">
                    Memuat data detail...
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-white truncate" title={title}>
                  {title}
                </h2>
                <button
                  type="button"
                  onClick={() => copyToClipboard(title, 'title')}
                  className="p-1 rounded text-zinc-400 hover:text-white transition flex-shrink-0"
                  title="Salin Judul"
                >
                  {copiedTitle ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              <p className="text-xs text-zinc-400 truncate mt-0.5">
                Detail Lengkap Style & Lirik Lagu
              </p>
            </div>
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={closeSongDetails}
            className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white transition flex-shrink-0"
            title="Tutup (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Audio Controls & Navigation Bar */}
        <div className="px-4 sm:px-6 py-2.5 bg-zinc-950/40 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-zinc-800/70 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1 rounded-md font-semibold transition ${
                activeTab === 'all' 
                  ? 'bg-amber-500 text-black shadow-sm' 
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Semua Info
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('style')}
              className={`px-3 py-1 rounded-md font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'style' 
                  ? 'bg-amber-500 text-black shadow-sm' 
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Style & Genre
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('lyrics')}
              className={`px-3 py-1 rounded-md font-semibold flex items-center gap-1.5 transition ${
                activeTab === 'lyrics' 
                  ? 'bg-amber-500 text-black shadow-sm' 
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Lirik Lagu
            </button>
          </div>

          {/* Audio Action Buttons */}
          <div className="flex items-center gap-2">
            {rawTrack && (
              <>
                <button
                  type="button"
                  onClick={() => playTrack(rawTrack, rawJob || undefined)}
                  className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition ${
                    isThisPlaying 
                      ? 'bg-amber-500 text-black' 
                      : 'bg-zinc-800 hover:bg-zinc-700 text-white'
                  }`}
                >
                  {isThisPlaying ? (
                    <>
                      <Pause className="w-3.5 h-3.5 fill-current" /> Pause
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" /> Putar
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => downloadAudioFile(playableUrl, title)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-semibold flex items-center gap-1.5 transition"
                  title="Unduh MP3"
                >
                  <Download className="w-3.5 h-3.5" />
                  Unduh MP3
                </button>
              </>
            )}

            <button
              type="button"
              onClick={handleApplyToStudio}
              className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-500 hover:to-rose-500 text-white font-semibold flex items-center gap-1.5 transition shadow-sm active:scale-95"
              title="Salin dan gunakan data lagu ini di Studio untuk kreasi lagu baru"
            >
              <Wand2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Gunakan di</span> Studio
            </button>

            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="px-2.5 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-400 font-semibold flex items-center gap-1.5 transition text-xs"
              title="Hapus lagu ini"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Hapus</span>
            </button>
          </div>
        </div>

        {/* Inline Delete Confirmation Banner */}
        {showDeleteConfirm && (
          <div className="p-3.5 bg-rose-950/70 border-b border-rose-800/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs animate-fade-in">
            <div className="flex items-center gap-2.5 text-rose-300">
              <Trash2 className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <div>
                <span className="font-bold text-white">Konfirmasi Hapus Musik:</span>
                <span className="ml-1 text-rose-200">
                  Yakin ingin menghapus lagu ini secara permanen dari akun Anda?
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleDeleteSong}
                disabled={isDeleting}
                className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold flex items-center gap-1.5 transition shadow-sm disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Menghapus...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    Ya, Hapus
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Scrollable Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 divide-y divide-zinc-800/60">
          
          {/* STYLE & GENRE SECTION */}
          {(activeTab === 'all' || activeTab === 'style') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      Musical Style & Genre
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      Tag genre, instrumen, mood, dan aransemen
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => copyToClipboard(style, 'style')}
                  className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 hover:text-white flex items-center gap-1.5 transition"
                  title="Salin Deskripsi Style"
                >
                  {copiedStyle ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Salin Style</span>
                    </>
                  )}
                </button>
              </div>

              {/* Tag Pills */}
              {styleTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {styleTags.map((t, idx) => (
                    <span 
                      key={idx}
                      className="px-2.5 py-1 rounded-lg bg-zinc-800/90 border border-zinc-700/60 text-xs text-amber-300 font-medium hover:border-amber-500/40 transition"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}

              {/* Full Raw Style Text Box */}
              <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800 text-xs text-zinc-300 font-mono leading-relaxed select-text">
                {style}
              </div>

              {/* Negative Tags if available */}
              {negativeTags && (
                <div className="pt-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400 block mb-1">
                    Negative Tags (Elemen yang Dihindari):
                  </span>
                  <div className="p-2.5 rounded-lg bg-rose-950/20 border border-rose-900/40 text-xs text-rose-300 font-mono">
                    {negativeTags}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* LYRICS SECTION */}
          {(activeTab === 'all' || activeTab === 'lyrics') && (
            <div className={`space-y-3 ${activeTab === 'all' ? 'pt-6' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                      Lirik Lagu (Lyrics)
                    </h3>
                    <p className="text-[11px] text-zinc-400">
                      {isInstrumental ? 'Komposisi instrumental (tanpa vokal)' : 'Teks vokal, struktur bait, dan chorus'}
                    </p>
                  </div>
                </div>

                {!isInstrumental && lyrics && (
                  <button
                    type="button"
                    onClick={() => copyToClipboard(lyrics, 'lyrics')}
                    className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 hover:text-white flex items-center gap-1.5 transition"
                    title="Salin Teks Lirik"
                  >
                    {copiedLyrics ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400">Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Lirik</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* If Instrumental */}
              {isInstrumental ? (
                <div className="p-5 rounded-xl bg-purple-950/30 border border-purple-800/40 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-purple-900/50 text-purple-300 flex items-center justify-center mx-auto border border-purple-700/50">
                    <Music className="w-5 h-5" />
                  </div>
                  <h4 className="text-sm font-bold text-purple-200">
                    Instrumen Penuh (Tanpa Lirik Vokal)
                  </h4>
                  <p className="text-xs text-purple-300/80 max-w-md mx-auto">
                    Lagu ini dibuat dalam mode instrumental. Semua dinamika melodi dan progresi harmoni dipandu oleh aransemen musik dan style prompt.
                  </p>
                </div>
              ) : (
                /* Lyrics text view */
                <div className="p-4 sm:p-5 rounded-xl bg-zinc-950/80 border border-zinc-800 select-text max-h-[360px] overflow-y-auto">
                  {renderLyricsFormatted(lyrics)}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 bg-zinc-950/80 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
            <span className="hidden sm:inline">
              Tip: Klik "Gunakan di Studio" untuk mengimpor style & lirik ini ke generator lagu baru.
            </span>
            <span className="sm:hidden">
              Tip: Tekan Esc untuk keluar.
            </span>
          </div>

          <button
            type="button"
            onClick={closeSongDetails}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold transition"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
};
