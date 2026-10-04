import React from 'react';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Download, 
  Disc, 
  RotateCcw, 
  RotateCw,
  ExternalLink
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

export const AudioPlayerBar: React.FC = () => {
  const { 
    currentTrack, 
    currentJob, 
    isPlaying, 
    currentTime, 
    duration, 
    volume, 
    togglePlay, 
    seek, 
    setVolume, 
    formatTime 
  } = usePlayer();

  if (!currentTrack) {
    return null;
  }

  const audioSrc = currentTrack.streamAudioUrl || currentTrack.audioUrl;
  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleDownload = () => {
    if (!audioSrc) return;
    const downloadUrl = `/api/music/download?url=${encodeURIComponent(audioSrc)}&filename=${encodeURIComponent((currentTrack.title || 'sonic-hub-track') + '.mp3')}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `${currentTrack.title || 'sonic-hub-track'}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950/95 border-t border-zinc-800 backdrop-blur-xl shadow-2xl px-4 py-3">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        
        {/* Track Info & Artwork */}
        <div className="flex items-center gap-3 w-full md:w-1/4 min-w-0">
          <div className="w-12 h-12 rounded-lg bg-zinc-800 overflow-hidden flex-shrink-0 border border-zinc-700 relative group">
            {currentTrack.imageUrl ? (
              <img 
                src={currentTrack.imageUrl} 
                alt={currentTrack.title} 
                className="w-full h-full object-cover" 
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-tr from-amber-600 to-rose-700">
                <Disc className="w-6 h-6 text-white animate-spin-slow" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-white truncate">
              {currentTrack.title || currentJob?.title || 'Generated Audio Track'}
            </h4>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-[10px] font-mono text-amber-300">
                {currentTrack.modelName || currentJob?.model || 'V6'}
              </span>
              <span className="truncate max-w-[140px] text-[11px] text-zinc-400">
                {currentTrack.tags || currentJob?.style || 'Real Suno Generation'}
              </span>
            </div>
          </div>
        </div>

        {/* Central Controls & Scrubber */}
        <div className="flex flex-col items-center gap-1.5 w-full md:w-2/4">
          
          {/* Playback Buttons */}
          <div className="flex items-center gap-4">
            <button 
              onClick={() => seek(Math.max(0, currentTime - 10))}
              className="p-1.5 text-zinc-400 hover:text-white transition"
              title="Rewind 10s"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={togglePlay}
              className="w-10 h-10 rounded-full bg-gradient-to-r from-amber-500 to-rose-600 hover:scale-105 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-rose-900/30 transition-transform"
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current translate-x-0.5" />}
            </button>

            <button 
              onClick={() => seek(Math.min(duration, currentTime + 10))}
              className="p-1.5 text-zinc-400 hover:text-white transition"
              title="Forward 10s"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          </div>

          {/* Time Scrubber */}
          <div className="flex items-center gap-2.5 w-full">
            <span className="text-[11px] font-mono text-zinc-400 w-9 text-right">
              {formatTime(currentTime)}
            </span>
            
            <div className="relative flex-1 group py-1 cursor-pointer">
              <input
                type="range"
                min="0"
                max={duration || 100}
                value={currentTime}
                onChange={(e) => seek(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <div 
                className="absolute top-1/2 -translate-y-1/2 left-0 h-1.5 bg-gradient-to-r from-amber-500 to-rose-500 rounded-lg pointer-events-none"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <span className="text-[11px] font-mono text-zinc-400 w-9">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        {/* Volume & Download Actions */}
        <div className="flex items-center justify-end gap-3 w-full md:w-1/4">
          
          {/* Volume Control */}
          <div className="hidden sm:flex items-center gap-2">
            <button 
              onClick={() => setVolume(volume > 0 ? 0 : 0.8)}
              className="text-zinc-400 hover:text-white transition"
            >
              {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-16 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-zinc-400"
            />
          </div>

          {/* Download Audio */}
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700/80 hover:bg-zinc-800 text-xs font-medium text-zinc-200 transition"
            title="Download actual audio track"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Download</span>
          </button>

          {/* Open Direct Provider URL */}
          <a
            href={audioSrc}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
            title="Open original audio stream URL"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

      </div>
    </div>
  );
};
