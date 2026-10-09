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
  Music,
  Key,
  User as UserIcon,
  Eye,
  EyeOff,
  Save,
  Trash2,
  ExternalLink,
  RefreshCw,
  Loader2,
  ShieldCheck,
  Zap,
  FileText
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { usePlayer } from '../context/PlayerContext';
import { GenerationJob, CreditTransaction } from '../types';

export const DashboardPage: React.FC<{ onOpenStudio: () => void }> = ({ onOpenStudio }) => {
  const { user, credits, updateUserProfile } = useAuth();
  const { openSongDetails } = usePlayer();
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [loading, setLoading] = useState(true);

  // Profile & Personal KIE Key State
  const [displayName, setDisplayName] = useState('');
  const [personalKey, setPersonalKey] = useState('');
  const [usePersonalKey, setUsePersonalKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; credits?: number } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'settings'>('overview');

  // Sync state when user updates
  useEffect(() => {
    if (user) {
      setDisplayName(user.name || '');
      setPersonalKey(user.personalKieApiKey || '');
      setUsePersonalKey(Boolean(user.usePersonalKey));
    }
  }, [user]);

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

  // Test personal KIE.ai API key & fetch live credits
  const handleTestPersonalKey = async () => {
    const cleanKey = personalKey
      .replace(/^Bearer\s+/i, '')
      .replace(/^["']|["']$/g, '')
      .trim();

    if (!cleanKey || cleanKey.length < 10) {
      setTestResult({
        success: false,
        message: 'Please enter a valid KIE.ai API key before testing.'
      });
      return;
    }

    setTestingKey(true);
    setTestResult(null);

    try {
      // 1. Direct browser call to KIE credit API (CORS enabled on official endpoint)
      const res = await fetch('https://api.kie.ai/api/v1/chat/credit', {
        headers: {
          'Authorization': `Bearer ${cleanKey}`,
          'Content-Type': 'application/json'
        }
      }).catch(() => null);

      if (res && res.ok) {
        const data = await res.json();
        let balance = 0;
        if (typeof data?.data === 'number') balance = data.data;
        else if (typeof data?.data?.credit === 'number') balance = data.data.credit;
        else if (typeof data?.data?.credits === 'number') balance = data.data.credits;
        else if (typeof data?.credit === 'number') balance = data.credit;

        setTestResult({
          success: true,
          credits: balance,
          message: `Key valid! Live balance: ${balance} credits`
        });
        return;
      }

      // 2. Server proxy fallback
      const serverRes = await fetch('/api/auth/test-personal-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: cleanKey })
      });
      const sData = await serverRes.json();
      if (sData.success) {
        setTestResult({
          success: true,
          credits: sData.credits,
          message: sData.message || `Key valid! Live balance: ${sData.credits} credits`
        });
      } else {
        setTestResult({
          success: false,
          message: sData.message || 'Key test failed. Check key format and permissions.'
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Unable to connect to KIE.ai service.'
      });
    } finally {
      setTestingKey(false);
    }
  };

  // Save profile and personal key
  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setSaveSuccess(false);

    try {
      const cleanKey = personalKey.trim();
      const res = await updateUserProfile({
        name: displayName.trim() || user?.name,
        personalKieApiKey: cleanKey,
        usePersonalKey: Boolean(cleanKey && usePersonalKey)
      });

      if (res.success) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3500);
      } else {
        alert(res.error || 'Failed to save settings');
      }
    } catch (e: any) {
      alert(e.message || 'Error saving settings');
    } finally {
      setSavingProfile(false);
    }
  };

  const totalSongs = jobs.length;
  const completedCount = jobs.filter(j => j.status === 'COMPLETED').length;
  const processingCount = jobs.filter(j => j.status === 'PROCESSING' || j.status === 'SUBMITTING').length;
  const failedCount = jobs.filter(j => j.status === 'FAILED').length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-32">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white font-mono flex items-center gap-3">
            <Coins className="w-7 h-7 text-amber-400" />
            CREATIVE <span className="text-amber-400">DASHBOARD</span>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Real-time credit accounting, personal API key settings, and generation history.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab(activeTab === 'overview' ? 'settings' : 'overview')}
            className={`px-3.5 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition ${
              activeTab === 'settings'
                ? 'bg-amber-500/10 border-amber-500/50 text-amber-300'
                : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700'
            }`}
          >
            <Key className="w-4 h-4 text-amber-400" />
            {activeTab === 'settings' ? 'View Activity' : 'Profile & API Key'}
          </button>

          <button
            onClick={onOpenStudio}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-900/20 flex items-center gap-2 self-start sm:self-auto"
          >
            <Sparkles className="w-4 h-4" />
            Create Music
          </button>
        </div>
      </div>

      {/* Tabs Selector */}
      <div className="flex items-center gap-2 border-b border-zinc-800 mb-8 pb-1">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'overview'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Coins className="w-3.5 h-3.5" />
          Overview & Generations
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2 text-xs font-bold border-b-2 transition flex items-center gap-2 ${
            activeTab === 'settings'
              ? 'border-amber-400 text-amber-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Key className="w-3.5 h-3.5" />
          Profile & KIE.ai Key (BYOK)
          {user?.usePersonalKey && user?.personalKieApiKey && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          )}
        </button>
      </div>

      {/* Profile & Personal KIE.ai API Key (BYOK) Tab - Only shown on settings tab */}
      {activeTab === 'settings' && (
        <div className="mb-10 rounded-2xl bg-zinc-900/90 border border-zinc-800 shadow-xl overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-zinc-900 via-zinc-900/95 to-amber-950/20">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-600 flex items-center justify-center text-white font-black text-lg shadow-md shadow-rose-950/30 flex-shrink-0">
                {(user?.name || user?.email || 'U').slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-bold text-white">{user?.name || 'Musician'}</h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-zinc-800 text-zinc-300 border border-zinc-700">
                    {user?.role || 'User'}
                  </span>
                  {user?.usePersonalKey && user?.personalKieApiKey ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-950/80 text-emerald-400 border border-emerald-800 flex items-center gap-1">
                      <Zap className="w-3 h-3 text-emerald-400" /> BYOK Active
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-zinc-800/80 text-zinc-400 border border-zinc-700">
                      Platform Pool
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">{user?.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="px-3.5 py-1.5 rounded-xl bg-zinc-950 border border-zinc-800 text-right">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500 block font-mono">Platform Credits</span>
                <span className="text-sm font-black text-amber-400 font-mono">{credits.toLocaleString()} pts</span>
              </div>
            </div>
          </div>

          {/* Form Content */}
          <div className="p-6 sm:p-8 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Left Column: Profile Details */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-amber-400" />
                  Profile Information
                </h3>
                
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Artist / Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter your artist or producer name"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-sm focus:outline-none focus:border-amber-500 transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Registered Email
                  </label>
                  <input
                    type="text"
                    value={user?.email || ''}
                    disabled
                    className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800 text-zinc-500 text-sm cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    User Identifier
                  </label>
                  <div className="px-3.5 py-2 rounded-xl bg-zinc-950/60 border border-zinc-800 text-zinc-500 text-xs font-mono truncate">
                    {user?.id}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-zinc-950/80 border border-zinc-800/80">
                  <h4 className="text-xs font-bold text-zinc-300 flex items-center gap-1.5 mb-1">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    Flexible BYOK Architecture
                  </h4>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    You can use your personal KIE.ai API key to generate songs directly against your own KIE account balance. When your key is active, zero platform credits are consumed.
                  </p>
                </div>
              </div>

              {/* Right Column: Personal KIE.ai API Key (BYOK) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 font-mono flex items-center gap-2">
                    <Key className="w-4 h-4 text-amber-400" />
                    Personal KIE.ai Key (BYOK)
                  </h3>
                  <a
                    href="https://kie.ai/api-key"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 transition font-medium"
                  >
                    Get / Copy Key on KIE.ai <ExternalLink className="w-3 h-3" />
                  </a>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    KIE.ai API Key
                  </label>
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={personalKey}
                      onChange={(e) => {
                        setPersonalKey(e.target.value);
                        setTestResult(null);
                      }}
                      placeholder="Paste your KIE.ai API key here..."
                      className="w-full pl-3.5 pr-20 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-white text-sm focus:outline-none focus:border-amber-500 font-mono transition"
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setShowKey(!showKey)}
                        className="p-1.5 text-zinc-400 hover:text-zinc-200 transition"
                        title={showKey ? 'Hide key' : 'Show key'}
                      >
                        {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      {personalKey && (
                        <button
                          type="button"
                          onClick={() => {
                            setPersonalKey('');
                            setUsePersonalKey(false);
                            setTestResult(null);
                          }}
                          className="p-1.5 text-zinc-500 hover:text-rose-400 transition"
                          title="Clear Key"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Your key is securely saved in your private profile and only used to generate your music.
                  </p>
                </div>

                {/* Test Connection Button & Live Balance Indicator */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTestPersonalKey}
                    disabled={testingKey || !personalKey.trim()}
                    className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 text-xs font-bold flex items-center justify-center gap-2 transition flex-shrink-0"
                  >
                    {testingKey ? <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Test Key & Check Balance
                  </button>

                  {testResult && (
                    <div className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-2 ${
                      testResult.success 
                        ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/80' 
                        : 'bg-rose-950/80 text-rose-300 border border-rose-800/80'
                    }`}>
                      {testResult.success ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />}
                      <span className="truncate">{testResult.message}</span>
                    </div>
                  )}
                </div>

                {/* Enable Personal Key Toggle */}
                <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800 flex items-start gap-3">
                  <input
                    type="checkbox"
                    id="byok-toggle"
                    checked={usePersonalKey}
                    disabled={!personalKey.trim()}
                    onChange={(e) => setUsePersonalKey(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-amber-500 focus:ring-amber-400 bg-zinc-900 border-zinc-700 cursor-pointer"
                  />
                  <label htmlFor="byok-toggle" className="text-xs cursor-pointer select-none">
                    <span className="font-bold text-zinc-200 block">
                      Use My Personal Key For Music Generation
                    </span>
                    <span className="text-zinc-400 block text-[11px] mt-0.5 leading-relaxed">
                      When enabled, music generation requests in Studio will run directly through your personal KIE.ai account. Platform credits will not be deducted.
                    </span>
                  </label>
                </div>

              </div>

            </div>

            {/* Bottom Save Bar */}
            <div className="pt-4 border-t border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                {saveSuccess && (
                  <span className="text-emerald-400 text-xs font-bold flex items-center gap-1.5 animate-pulse">
                    <CheckCircle2 className="w-4 h-4" /> Profile and KIE.ai settings updated successfully!
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-950/20 flex items-center justify-center gap-2 transition disabled:opacity-50"
              >
                {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Profile & Key Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overview Tab Content - Exact 4 Cards and Recent Generations */}
      {activeTab === 'overview' && (
        <>
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
                10 credits reserved per Suno job
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
            Generated via Studio Suno Engine
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
            Active audio synthesis tasks
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
                      <button
                        type="button"
                        onClick={() => openSongDetails(null, j)}
                        className="group/d text-left flex items-center gap-1.5 hover:text-amber-400 min-w-0 max-w-full"
                        title="Klik untuk melihat Style dan Lirik lagu ini"
                      >
                        <span className="truncate underline decoration-dotted decoration-zinc-600 group-hover/d:decoration-amber-400">
                          {j.title}
                        </span>
                        <FileText className="w-3 h-3 text-zinc-500 group-hover/d:text-amber-400 flex-shrink-0 transition" />
                      </button>
                    </td>
                    <td className="py-3 font-mono text-amber-300">
                      {j.model}
                    </td>
                    <td className="py-3 font-mono text-zinc-300">
                      {j.creditReservation === 0 ? (
                        <span className="text-emerald-400 font-bold">BYOK (0 pts)</span>
                      ) : (
                        j.creditReservation
                      )}
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
    </>
  )}

</div>
  );
};

