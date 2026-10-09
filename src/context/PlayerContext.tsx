import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { GenerationTrack, GenerationJob } from '../types';
import { resolvePlayableAudioUrl } from '../utils/audioUrl';

interface SongDetailsTarget {
  track?: GenerationTrack | null;
  job?: GenerationJob | null;
}

interface PlayerContextType {
  currentTrack: GenerationTrack | null;
  currentJob: GenerationJob | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playTrack: (track: GenerationTrack, job?: GenerationJob) => void;
  togglePlay: () => void;
  pause: () => void;
  seek: (time: number) => void;
  setVolume: (vol: number) => void;
  formatTime: (seconds: number) => string;
  closePlayer: () => void;
  songDetails: SongDetailsTarget | null;
  isSongDetailsOpen: boolean;
  openSongDetails: (track?: GenerationTrack | null, job?: GenerationJob | null) => void;
  closeSongDetails: () => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTrack, setCurrentTrack] = useState<GenerationTrack | null>(null);
  const [currentJob, setCurrentJob] = useState<GenerationJob | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolumeState] = useState<number>(0.85);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.volume = volume;
    audioRef.current = audio;

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const onError = (e: Event) => {
      console.warn('[Player] Audio playback event error:', e);
      // Auto-fallback: if failed URL was an audiostream link, retry with permanent tempfile link
      if (audioRef.current && audioRef.current.src.includes('audiostream.kie.ai')) {
        const match = audioRef.current.src.match(/audiostream\.kie\.ai\/stream\/([a-f0-9-]+)\.mp3/i);
        if (match && match[1]) {
          const fallbackUrl = `https://tempfile.aiquickdraw.com/r/${match[1]}.mp3`;
          console.log('[Player] Switching from dead stream to permanent audio URL:', fallbackUrl);
          audioRef.current.src = fallbackUrl;
          audioRef.current.load();
          audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
          return;
        }
      }
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.pause();
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, []);

  const playTrack = (track: GenerationTrack, job?: GenerationJob) => {
    if (!audioRef.current) return;
    const url = resolvePlayableAudioUrl(track);
    if (!url) return;

    if (currentTrack?.id === track.id) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play().then(() => setIsPlaying(true)).catch(e => console.warn(e));
      }
      return;
    }

    setCurrentTrack(track);
    if (job) setCurrentJob(job);
    audioRef.current.src = url;
    audioRef.current.load();
    audioRef.current.play()
      .then(() => setIsPlaying(true))
      .catch(err => {
        console.warn('[Player] Autoplay prevented or error:', err);
        setIsPlaying(false);
      });
  };

  const togglePlay = () => {
    if (!audioRef.current || !currentTrack) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(e => console.warn(e));
    }
  };

  const pause = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  };

  const seek = (time: number) => {
    if (audioRef.current && !isNaN(time)) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const setVolume = (vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolumeState(clamped);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
  };

  const formatTime = (secs: number): string => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const [songDetails, setSongDetails] = useState<SongDetailsTarget | null>(null);
  const [isSongDetailsOpen, setIsSongDetailsOpen] = useState<boolean>(false);

  const openSongDetails = (track?: GenerationTrack | null, job?: GenerationJob | null) => {
    setSongDetails({ track: track || null, job: job || null });
    setIsSongDetailsOpen(true);
  };

  const closeSongDetails = () => {
    setIsSongDetailsOpen(false);
  };

  const closePlayer = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    setIsPlaying(false);
    setCurrentTrack(null);
    setCurrentJob(null);
    setCurrentTime(0);
    setDuration(0);
  };

  return (
    <PlayerContext.Provider value={{
      currentTrack,
      currentJob,
      isPlaying,
      currentTime,
      duration,
      volume,
      playTrack,
      togglePlay,
      pause,
      seek,
      setVolume,
      formatTime,
      closePlayer,
      songDetails,
      isSongDetailsOpen,
      openSongDetails,
      closeSongDetails
    }}>
      {children}
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider');
  return ctx;
};
