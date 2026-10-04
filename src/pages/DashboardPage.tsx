import React, { useState, useEffect } from 'react';
import { 
  Coins, 
  Disc, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Sparkles,
  ArrowUpRight,
  ArrowDownLeft,
  Flame,
  Music
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { GenerationJob, CreditTransaction } from '../types';

export const DashboardPage: React.FC<{ onOpenStudio: () => void }> = ({ onOpenStudio }) => {
  const { user, credits } = useAuth();
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        // Fetch user jobs & library
        const res = await fetch('/api/music/library', {
          headers: {
            'x-user-id': user?.id || '',
            'x-user-email': user?.email || ''
          }
        });
        const data = await res.json();
        if (data.success && data.items) {
          setJobs(data.items.map((i: any) => i.job));
        }
      } catch (e) {
        console.warn(e);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [user]);

  const totalSongs = jobs.length;
  const completedCount = jobs.filter(j => j.status === 'COMPLETED').length;
  const processingCount = jobs.filter(j => j.status === 'PROCESSING' || j.status === 'SUBMITTING').length;
  const failedCount = jobs.filter(j => j.status === 'FAILED').length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-32">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white font-mono flex items-center gap-3">
            <Coins className="w-7 h-7 text-amber-400" />
            CREATIVE <span className="text-amber-400">DASHBOARD</span>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Real-time credit accounting, activity ledger, and generation history.
          </p>
        </div>

        <button
          onClick={onOpenStudio}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-900/20 flex items-center gap-2 self-start sm:self-auto"
        >
          <Sparkles className="w-4 h-4" />
          Create Music
        </button>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        
        {/* Credits Balance Card */}
        <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Available Credits</span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-300 font-mono">
            {credits.toLocaleString()}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">
            10 credits reserved per Suno V6 job
          </p>
        </div>

        {/* Total Songs Card */}
        <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Songs</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
              <Disc className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white font-mono">
            {totalSongs}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">
            Generated via KIE.ai Suno
          </p>
        </div>

        {/* Completed Jobs */}
        <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Completed</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono">
            {completedCount}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">
            Synthesized successfully
          </p>
        </div>

        {/* Processing / Active */}
        <div className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md">
          <div className="flex items-center justify-between text-zinc-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">In Progress</span>
            <div className="w-7 h-7 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-rose-300 font-mono">
            {processingCount}
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">
            Active KIE rendering tasks
          </p>
        </div>

      </div>

      {/* Recent Generations & Activity Section */}
      <div className="p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md">
        <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-4 flex items-center gap-2">
          <Music className="w-4 h-4 text-amber-400" />
          Recent Music Generations
        </h3>

        {jobs.length === 0 ? (
          <div className="text-center py-10 text-zinc-500 text-xs font-mono">
            No generation activity recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 font-mono uppercase text-[10px]">
                  <th className="pb-3">Title</th>
                  <th className="pb-3">Model</th>
                  <th className="pb-3">Credits Reserved</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Task ID</th>
                  <th className="pb-3">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-sans">
                {jobs.slice(0, 10).map(j => (
                  <tr key={j.id} className="hover:bg-zinc-800/30 transition">
                    <td className="py-3 font-semibold text-white truncate max-w-[200px]">
                      {j.title}
                    </td>
                    <td className="py-3 font-mono text-amber-300">
                      {j.model}
                    </td>
                    <td className="py-3 font-mono text-zinc-300">
                      {j.creditReservation}
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                        j.status === 'COMPLETED' ? 'bg-emerald-950 text-emerald-400' :
                        j.status === 'PROCESSING' ? 'bg-amber-950 text-amber-400' :
                        j.status === 'FAILED' ? 'bg-rose-950 text-rose-400' :
                        'bg-zinc-800 text-zinc-300'
                      }`}>
                        {j.status}
                      </span>
                    </td>
                    <td className="py-3 font-mono text-zinc-500 truncate max-w-[120px]">
                      {j.taskId || 'Queued'}
                    </td>
                    <td className="py-3 text-zinc-400">
                      {new Date(j.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
