import React, { useState } from 'react';
import { Sliders, Play, Pause, Disc, Sparkles, Volume2, Info } from 'lucide-react';

export const DemoPage: React.FC<{ onGoToStudio: () => void }> = ({ onGoToStudio }) => {
  const [playingDemo, setPlayingDemo] = useState(false);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-32">
      
      {/* Notice Banner */}
      <div className="mb-6 p-4 rounded-xl bg-indigo-950/40 border border-indigo-800/60 flex items-start gap-3 text-xs text-indigo-200">
        <Info className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="font-bold text-white">Section 78 Isolated UI Playground Sandbox (/demo)</h4>
          <p className="mt-0.5 text-zinc-300">
            This route is strictly an interactive component sandbox for UI inspection.
            The production Studio route (<button onClick={onGoToStudio} className="underline text-amber-400 font-bold">Studio / Create</button>) strictly executes real KIE.ai Suno API tasks with real database reservations, never mock data.
          </p>
        </div>
      </div>

      <div className="p-8 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-xl space-y-6">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-400" />
            Audio Synthesis Waveform & Control Showcase
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Simulate player visualization and preview audio dynamics.
          </p>
        </div>

        {/* Mock Waveform Display */}
        <div className="p-6 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col items-center justify-center gap-4">
          <div className="flex items-center gap-1.5 h-16 w-full justify-center">
            {[40, 65, 30, 80, 95, 45, 60, 85, 100, 70, 50, 90, 80, 60, 40, 55, 75, 90, 65, 35].map((h, i) => (
              <div 
                key={i}
                className={`w-1.5 rounded-full transition-all duration-300 ${
                  playingDemo ? 'bg-gradient-to-t from-amber-500 to-rose-500 animate-pulse' : 'bg-zinc-800'
                }`}
                style={{ height: playingDemo ? `${h}%` : '25%' }}
              />
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setPlayingDemo(!playingDemo)}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-bold flex items-center gap-2 transition"
            >
              {playingDemo ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              {playingDemo ? 'Pause Visualization' : 'Animate Spectral Waveform'}
            </button>
            <button
              onClick={onGoToStudio}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Go to Real Studio Console
            </button>
          </div>
        </div>

      </div>

    </div>
  );
};
