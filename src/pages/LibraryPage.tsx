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
  Loader2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { GenerationJob, GenerationTrack } from '../types';

interface LibraryItem {
  job: GenerationJob;
  tracks: GenerationTrack[];
}

export const LibraryPage: React.FC<{ onOpenStudio: () => void }> = ({ onOpenStudio }) => {
  const { user } = useAuth();
  const { playTrack, currentTrack, isPlaying } = usePlayer();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [activeJobs, setActiveJobs] = useState<GenerationJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [modelFilter, setModelFilter] = useState('ALL');

  const fetchLibrary = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setRefreshing(true);
      const res = await fetch('/api/music/library', {
        headers: {
          'x-user-id': user?.id || '',
          'x-user-email': user?.email || ''
        }
      });
      const data = await res.json();
      if (data.success) {
        if (Array.isArray(data.items)) {
          setItems(data.items);
        }
        if (Array.isArray(data.activeJobs)) {
          setActiveJobs(data.activeJobs);
        }
      }
    } catch (e) {
      console.warn('Failed to load library:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLibrary();
  }, [user]);

  // Periodic poll if any jobs are active
  useEffect(() => {
    if (activeJobs.length === 0) return;
    const interval = setInterval(() => {
      fetchLibrary(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [activeJobs.length]);

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
            Browse, play, and download your authentic KIE.ai Suno music generations.
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
                Music Synthesizing on KIE.ai ({activeJobs.length} active {activeJobs.length === 1 ? 'task' : 'tasks'})
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
                    <span className="text-xs font-bold text-white truncate">{j.title}</span>
                    <span className="px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 font-mono text-[10px]">
                      {j.model}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 font-mono mt-0.5 truncate">
                    Task: {j.taskId || 'Dispatching'} • Started {new Date(j.createdAt).toLocaleTimeString()}
                  </p>
                </div>
                <button
                  onClick={() => fetchLibrary(false)}
                  className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-amber-300 transition flex items-center gap-1 flex-shrink-0"
                >
                  <RefreshCw className="w-3 h-3" />
                  Check
                </button>
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
                  <div>
                    <h3 className="text-sm font-bold text-white truncate">{job.title}</h3>
                    <p className="text-xs text-zinc-400 line-clamp-2 mt-1 font-sans">
                      {job.style}
                    </p>
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
                          <span className="truncate text-[11px]">
                            {t.title || `Version ${idx + 1}`}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {t.duration && (
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {Math.round(t.duration)}s
                            </span>
                          )}
                          <a
                            href={`/api/music/download?url=${encodeURIComponent(t.audioUrl)}&filename=${encodeURIComponent((t.title || job.title) + '.mp3')}`}
                            className="p-1 text-zinc-400 hover:text-white"
                            title="Download track"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
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

    </div>
  );
};
