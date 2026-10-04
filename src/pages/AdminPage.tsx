import React, { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  Key, 
  Users, 
  Activity, 
  Settings, 
  Plus, 
  Trash2, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Coins, 
  Clock, 
  Flame, 
  Sliders, 
  Lock,
  ExternalLink,
  RotateCcw
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { KieAccount, User, GenerationJob, SystemLog, AppSettings } from '../types';

export const AdminPage: React.FC = () => {
  const { user } = useAuth();
  const [subTab, setSubTab] = useState<'accounts' | 'users' | 'generations' | 'logs' | 'settings'>('accounts');

  // Stats
  const [stats, setStats] = useState<any>(null);

  // KIE Accounts
  const [accounts, setAccounts] = useState<KieAccount[]>([]);
  const [showAddAccountModal, setShowAddAccountModal] = useState(false);
  const [showRotateKeyModal, setShowRotateKeyModal] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

  // Add Account Form
  const [accName, setAccName] = useState('');
  const [accApiKey, setAccApiKey] = useState('');
  const [accPriority, setAccPriority] = useState(1);
  const [accDailyLimit, setAccDailyLimit] = useState(0);
  const [accMaxConcurrent, setAccMaxConcurrent] = useState(3);
  const [accStatus, setAccStatus] = useState<'ACTIVE' | 'DISABLED'>('ACTIVE');
  const [newKeyInput, setNewKeyInput] = useState('');

  // Users Management
  const [usersList, setUsersList] = useState<User[]>([]);
  const [creditModalUser, setCreditModalUser] = useState<User | null>(null);
  const [creditAmount, setCreditAmount] = useState<number>(100);
  const [creditReason, setCreditReason] = useState<string>('Admin bonus');

  // Generations
  const [jobsList, setJobsList] = useState<GenerationJob[]>([]);

  // Logs
  const [logsList, setLogsList] = useState<SystemLog[]>([]);

  // Settings
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const authHeaders = {
    'x-user-id': user?.id || 'admin_altamedia',
    'x-user-email': user?.email || 'altamedia51@gmail.com',
    'Content-Type': 'application/json'
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      // Stats
      const statsRes = await fetch('/api/admin/stats', { headers: authHeaders });
      const statsData = await statsRes.json();
      if (statsData.success) setStats(statsData.stats);

      // Accounts
      const accRes = await fetch('/api/admin/kie-accounts', { headers: authHeaders });
      const accData = await accRes.json();
      if (accData.success) setAccounts(accData.accounts);

      // Users
      const usrRes = await fetch('/api/admin/users', { headers: authHeaders });
      const usrData = await usrRes.json();
      if (usrData.success) setUsersList(usrData.users);

      // Generations
      const genRes = await fetch('/api/admin/generations', { headers: authHeaders });
      const genData = await genRes.json();
      if (genData.success) setJobsList(genData.jobs);

      // Logs
      const logRes = await fetch('/api/admin/logs', { headers: authHeaders });
      const logData = await logRes.json();
      if (logData.success) setLogsList(logData.logs);

      // Settings
      const setRes = await fetch('/api/admin/settings', { headers: authHeaders });
      const setData = await setRes.json();
      if (setData.success) setAppSettings(setData.settings);

    } catch (e: any) {
      console.warn('Admin load error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [user]);

  // Add Account
  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim() || !accApiKey.trim()) {
      setMsg({ type: 'error', text: 'Name and API Key are required.' });
      return;
    }

    try {
      const res = await fetch('/api/admin/kie-accounts', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          name: accName,
          apiKey: accApiKey,
          priority: accPriority,
          dailyLimit: accDailyLimit,
          maxConcurrentJobs: accMaxConcurrent,
          status: accStatus
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to add account');
      }

      setMsg({ type: 'success', text: `KIE Account '${accName}' added with AES-256 encrypted key.` });
      setShowAddAccountModal(false);
      setAccName('');
      setAccApiKey('');
      loadAll();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  // Test Connection
  const handleTestConnection = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await fetch(`/api/admin/kie-accounts/${id}/test`, {
        method: 'POST',
        headers: authHeaders
      });
      const data = await res.json();
      setTestResult({
        id,
        success: data.success,
        message: data.message || (data.success ? 'KIE.ai API key verified successfully' : 'Verification failed')
      });
      loadAll();
    } catch (e: any) {
      setTestResult({ id, success: false, message: e.message });
    } finally {
      setTestingId(null);
    }
  };

  // Rotate Key
  const handleRotateKey = async (id: string) => {
    if (!newKeyInput.trim()) return;
    try {
      const res = await fetch(`/api/admin/kie-accounts/${id}`, {
        method: 'PATCH',
        headers: authHeaders,
        body: JSON.stringify({ newApiKey: newKeyInput })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to rotate key');
      
      setMsg({ type: 'success', text: 'API Key rotated and re-encrypted successfully.' });
      setShowRotateKeyModal(null);
      setNewKeyInput('');
      loadAll();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  // Delete Account
  const handleDeleteAccount = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete KIE Account '${name}'?`)) return;
    try {
      await fetch(`/api/admin/kie-accounts/${id}`, {
        method: 'DELETE',
        headers: authHeaders
      });
      setMsg({ type: 'success', text: `Account '${name}' deleted.` });
      loadAll();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  // Adjust User Credits
  const handleAdjustCredits = async () => {
    if (!creditModalUser) return;
    try {
      const res = await fetch(`/api/admin/users/${creditModalUser.id}/credits`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ amount: creditAmount, reason: creditReason })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Credit adjustment failed');

      setMsg({ type: 'success', text: `Granted ${creditAmount} credits to ${creditModalUser.email}` });
      setCreditModalUser(null);
      loadAll();
    } catch (err: any) {
      setMsg({ type: 'error', text: err.message });
    }
  };

  // Toggle User Status
  const handleToggleUserStatus = async (targetUser: User) => {
    const action = targetUser.status === 'active' ? 'suspend' : 'activate';
    try {
      await fetch(`/api/admin/users/${targetUser.id}/${action}`, {
        method: 'POST',
        headers: authHeaders
      });
      setMsg({ type: 'success', text: `User ${targetUser.email} ${action}d.` });
      loadAll();
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  // Update Settings
  const handleSaveSettings = async (updates: Partial<AppSettings>) => {
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(updates)
      });
      const data = await res.json();
      if (data.success) {
        setAppSettings(data.settings);
        setMsg({ type: 'success', text: 'Platform settings updated.' });
      }
    } catch (e: any) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-32">
      
      {/* Admin Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 text-[10px] font-mono font-bold border border-rose-800">
              PRIVILEGED ACCESS
            </span>
            <span className="text-xs text-zinc-500 font-mono">Real Infrastructure Metrics</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white font-mono flex items-center gap-3">
            <ShieldAlert className="w-7 h-7 text-rose-500" />
            ADMIN <span className="text-rose-400">MISSION CONTROL</span>
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Manage multi-account KIE.ai credentials, inspect job lifecycle, audit credit ledgers, and manage users.
          </p>
        </div>

        <button
          onClick={loadAll}
          className="px-3.5 py-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-xs font-semibold text-zinc-300 flex items-center gap-2 self-start sm:self-auto transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Data
        </button>
      </div>

      {/* Real Infrastructure Stats Grid */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
          <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase font-mono">Total Users</span>
            <div className="text-xl font-bold text-white font-mono mt-1">{stats.totalUsers}</div>
            <span className="text-[10px] text-zinc-500">{stats.activeUsers} active accounts</span>
          </div>
          <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase font-mono">Total Jobs</span>
            <div className="text-xl font-bold text-white font-mono mt-1">{stats.totalJobs}</div>
            <span className="text-[10px] text-emerald-400 font-mono">{stats.completedJobs} completed</span>
          </div>
          <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase font-mono">Active Renderings</span>
            <div className="text-xl font-bold text-amber-400 font-mono mt-1">{stats.processingJobs}</div>
            <span className="text-[10px] text-zinc-500 font-mono">{stats.queuedJobs} queued</span>
          </div>
          <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase font-mono">Credits Consumed</span>
            <div className="text-xl font-bold text-amber-300 font-mono mt-1">{stats.creditsUsed}</div>
            <span className="text-[10px] text-zinc-500 font-mono">{stats.todayJobs} jobs today</span>
          </div>
          <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800">
            <span className="text-[10px] text-zinc-500 uppercase font-mono">KIE Providers</span>
            <div className="text-xl font-bold text-emerald-400 font-mono mt-1">{stats.activeAccounts} Active</div>
            <span className={`text-[10px] font-mono ${stats.unhealthyAccounts > 0 ? 'text-rose-400' : 'text-zinc-500'}`}>
              {stats.unhealthyAccounts} Unhealthy
            </span>
          </div>
        </div>
      )}

      {/* Notification Toast */}
      {msg && (
        <div className={`mb-6 p-4 rounded-xl border flex items-center justify-between text-xs animate-in fade-in ${
          msg.type === 'success' 
            ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300' 
            : 'bg-rose-950/60 border-rose-800 text-rose-300'
        }`}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} className="text-zinc-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Admin Tabs */}
      <div className="flex border-b border-zinc-800 gap-4 mb-6 text-xs font-semibold overflow-x-auto">
        <button
          onClick={() => setSubTab('accounts')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition ${
            subTab === 'accounts' 
              ? 'border-amber-500 text-amber-400' 
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          <Key className="w-4 h-4" />
          Multi KIE Accounts ({accounts.length})
        </button>

        <button
          onClick={() => setSubTab('generations')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition ${
            subTab === 'generations' 
              ? 'border-amber-500 text-amber-400' 
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          <Activity className="w-4 h-4" />
          Generations Monitor ({jobsList.length})
        </button>

        <button
          onClick={() => setSubTab('users')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition ${
            subTab === 'users' 
              ? 'border-amber-500 text-amber-400' 
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          Users & Credits ({usersList.length})
        </button>

        <button
          onClick={() => setSubTab('logs')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition ${
            subTab === 'logs' 
              ? 'border-amber-500 text-amber-400' 
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          <Clock className="w-4 h-4" />
          Audit Logs
        </button>

        <button
          onClick={() => setSubTab('settings')}
          className={`pb-3 flex items-center gap-2 border-b-2 transition ${
            subTab === 'settings' 
              ? 'border-amber-500 text-amber-400' 
              : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          <Settings className="w-4 h-4" />
          Platform Settings
        </button>
      </div>

      {/* --- SUBTAB: KIE ACCOUNTS --- */}
      {subTab === 'accounts' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Configured KIE.ai Provider Keys
              </h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Keys are encrypted server-side with AES-256-GCM. Unmasked keys are never returned to client.
              </p>
            </div>

            <button
              onClick={() => setShowAddAccountModal(true)}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs flex items-center gap-2 transition"
            >
              <Plus className="w-4 h-4" />
              Add KIE Account
            </button>
          </div>

          {testResult && (
            <div className={`p-4 rounded-xl border text-xs flex items-start gap-3 ${
              testResult.success ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300' : 'bg-rose-950/60 border-rose-800 text-rose-300'
            }`}>
              {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5" /> : <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5" />}
              <div>
                <p className="font-bold">Real KIE Connection Verification:</p>
                <p className="mt-0.5">{testResult.message}</p>
              </div>
            </div>
          )}

          {accounts.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-zinc-900/40 border border-zinc-800">
              <Key className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
              <h4 className="text-base font-bold text-white">No KIE Accounts Configured</h4>
              <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
                Sonic Hub AI requires at least one official KIE.ai API key to process music generation requests.
              </p>
              <button
                onClick={() => setShowAddAccountModal(true)}
                className="mt-4 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs"
              >
                + Add First KIE Account
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {accounts.map(acc => (
                <div key={acc.id} className="p-5 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-white">{acc.name}</h4>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                          acc.status === 'ACTIVE' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40' :
                          acc.status === 'RATE_LIMITED' ? 'bg-amber-950 text-amber-400 border border-amber-800/40' :
                          'bg-rose-950 text-rose-400 border border-rose-800/40'
                        }`}>
                          {acc.status}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-zinc-400 mt-1">
                        Key: {acc.maskedApiKey}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setShowRotateKeyModal(acc.id)}
                        className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs transition"
                        title="Rotate API Key"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteAccount(acc.id, acc.name)}
                        className="p-1.5 rounded-lg bg-zinc-800 hover:bg-rose-900/60 text-zinc-400 hover:text-rose-300 text-xs transition"
                        title="Delete Account"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Account Metrics Grid */}
                  <div className="grid grid-cols-3 gap-2 text-center p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-[11px] font-mono">
                    <div>
                      <span className="text-zinc-500 block text-[10px]">Priority</span>
                      <span className="font-bold text-white">{acc.priority}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">Active Jobs</span>
                      <span className="font-bold text-amber-300">{acc.activeJobs} / {acc.maxConcurrentJobs || '∞'}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px]">Jobs Today</span>
                      <span className="font-bold text-zinc-200">{acc.usageToday} / {acc.dailyLimit || '∞'}</span>
                    </div>
                  </div>

                  {acc.lastError && (
                    <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-[11px]">
                      Last error: {acc.lastError}
                    </div>
                  )}

                  {acc.cooldownUntil && new Date(acc.cooldownUntil) > new Date() && (
                    <div className="p-2 rounded-lg bg-amber-950/40 border border-amber-800 text-amber-300 text-[11px] flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5" />
                      Cooldown until: {new Date(acc.cooldownUntil).toLocaleTimeString()}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                    <span className="text-[10px] text-zinc-500">
                      Failures: {acc.failureCount}
                    </span>
                    <button
                      onClick={() => handleTestConnection(acc.id)}
                      disabled={testingId === acc.id}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition flex items-center gap-1.5"
                    >
                      {testingId === acc.id ? 'Testing...' : 'Test Connection'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Account Modal */}
          {showAddAccountModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl">
                <h3 className="text-base font-bold text-white mb-1">Add KIE.ai Provider Account</h3>
                <p className="text-xs text-zinc-400 mb-4">
                  The API key is encrypted using AES-256-GCM before storage.
                </p>

                <form onSubmit={handleAddAccount} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">Account Label</label>
                    <input
                      type="text"
                      value={accName}
                      onChange={(e) => setAccName(e.target.value)}
                      placeholder="e.g. KIE Account 01 (Primary)"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">KIE.ai API Key</label>
                    <input
                      type="password"
                      value={accApiKey}
                      onChange={(e) => setAccApiKey(e.target.value)}
                      placeholder="sk-..."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500 font-mono"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 mb-1">Priority (1-10)</label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={accPriority}
                        onChange={(e) => setAccPriority(parseInt(e.target.value, 10))}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-zinc-300 mb-1">Max Concurrent Jobs</label>
                      <input
                        type="number"
                        min="1"
                        value={accMaxConcurrent}
                        onChange={(e) => setAccMaxConcurrent(parseInt(e.target.value, 10))}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">Daily Job Limit (0 = Unlimited)</label>
                    <input
                      type="number"
                      min="0"
                      value={accDailyLimit}
                      onChange={(e) => setAccDailyLimit(parseInt(e.target.value, 10))}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3">
                    <button
                      type="button"
                      onClick={() => setShowAddAccountModal(false)}
                      className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold"
                    >
                      Encrypt & Save Account
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Rotate Key Modal */}
          {showRotateKeyModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
              <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl">
                <h3 className="text-base font-bold text-white mb-1">Rotate KIE API Key</h3>
                <p className="text-xs text-zinc-400 mb-4">
                  Replaces the existing encrypted key with a newly verified key.
                </p>

                <div className="space-y-4">
                  <input
                    type="password"
                    value={newKeyInput}
                    onChange={(e) => setNewKeyInput(e.target.value)}
                    placeholder="Enter new KIE API key (sk-...)"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-amber-500 font-mono"
                  />

                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => { setShowRotateKeyModal(null); setNewKeyInput(''); }}
                      className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleRotateKey(showRotateKeyModal)}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold"
                    >
                      Rotate & Encrypt
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* --- SUBTAB: GENERATIONS MONITOR --- */}
      {subTab === 'generations' && (
        <div className="p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md">
          <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-4">
            Live Generation Pipeline Monitor
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 font-mono uppercase text-[10px]">
                  <th className="pb-3">Job ID</th>
                  <th className="pb-3">User</th>
                  <th className="pb-3">Title</th>
                  <th className="pb-3">Model</th>
                  <th className="pb-3">Provider Account</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Task ID</th>
                  <th className="pb-3">Created</th>
                  <th className="pb-3">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-sans">
                {jobsList.map(j => (
                  <tr key={j.id} className="hover:bg-zinc-800/30 transition">
                    <td className="py-3 font-mono text-zinc-400 text-[11px]">{j.id}</td>
                    <td className="py-3 text-zinc-300 truncate max-w-[140px]">{j.userEmail || j.userId}</td>
                    <td className="py-3 font-semibold text-white truncate max-w-[160px]">{j.title}</td>
                    <td className="py-3 font-mono text-amber-300">{j.model}</td>
                    <td className="py-3 text-zinc-400 text-[11px]">{j.providerAccountName || 'Auto Router'}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                        j.status === 'COMPLETED' ? 'bg-emerald-950 text-emerald-400' :
                        j.status === 'PROCESSING' ? 'bg-amber-950 text-amber-400' :
                        j.status === 'FAILED' ? 'bg-rose-950 text-rose-400' :
                        'bg-zinc-800 text-zinc-300'
                      }`}>
                        {j.status}
                      </span>
                    </td>
                    <td className="py-3 font-mono text-zinc-500 text-[11px] truncate max-w-[100px]">{j.taskId || '-'}</td>
                    <td className="py-3 text-zinc-400">{new Date(j.createdAt).toLocaleTimeString()}</td>
                    <td className="py-3 text-rose-400 text-[11px] truncate max-w-[120px]">{j.errorMessage || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- SUBTAB: USERS --- */}
      {subTab === 'users' && (
        <div className="p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
            User Accounts & Credit Ledgers
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-500 font-mono uppercase text-[10px]">
                  <th className="pb-3">Name</th>
                  <th className="pb-3">Email</th>
                  <th className="pb-3">Role</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Credits</th>
                  <th className="pb-3">Joined</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-sans">
                {usersList.map(u => (
                  <tr key={u.id} className="hover:bg-zinc-800/30 transition">
                    <td className="py-3 font-semibold text-white">{u.name}</td>
                    <td className="py-3 text-zinc-300 font-mono">{u.email}</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                        u.role === 'admin' ? 'bg-rose-950 text-rose-300 border border-rose-800/40' : 'bg-zinc-800 text-zinc-300'
                      }`}>
                        {u.role.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                        u.status === 'active' ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {u.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 font-mono font-bold text-amber-300">{u.credits}</td>
                    <td className="py-3 text-zinc-400">{new Date(u.createdAt).toLocaleDateString()}</td>
                    <td className="py-3 text-right space-x-2">
                      <button
                        onClick={() => { setCreditModalUser(u); setCreditAmount(100); }}
                        className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold"
                      >
                        + Credits
                      </button>
                      {u.role !== 'admin' && (
                        <button
                          onClick={() => handleToggleUserStatus(u)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                            u.status === 'active' ? 'bg-rose-950/60 text-rose-300 hover:bg-rose-900' : 'bg-emerald-950/60 text-emerald-300 hover:bg-emerald-900'
                          }`}
                        >
                          {u.status === 'active' ? 'Suspend' : 'Activate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Credit Adjustment Modal */}
          {creditModalUser && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
              <div className="w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 p-6 shadow-2xl">
                <h3 className="text-base font-bold text-white mb-1">Adjust User Credits</h3>
                <p className="text-xs text-zinc-400 mb-4">{creditModalUser.email}</p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">Amount (+ to grant, - to deduct)</label>
                    <input
                      type="number"
                      value={creditAmount}
                      onChange={(e) => setCreditAmount(parseInt(e.target.value, 10))}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-300 mb-1">Reason</label>
                    <input
                      type="text"
                      value={creditReason}
                      onChange={(e) => setCreditReason(e.target.value)}
                      placeholder="e.g. Promotional grant, Refund"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white outline-none"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      onClick={() => setCreditModalUser(null)}
                      className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAdjustCredits}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold"
                    >
                      Apply Adjustment
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* --- SUBTAB: AUDIT LOGS --- */}
      {subTab === 'logs' && (
        <div className="p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md">
          <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-4">
            System Security & Audit Trail
          </h3>

          <div className="space-y-2 font-mono text-xs max-h-[500px] overflow-y-auto">
            {logsList.map(log => (
              <div key={log.id} className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800/80 flex items-start gap-3">
                <span className="text-zinc-500 text-[10px] whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleTimeString()}
                </span>
                <span className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-bold ${
                  log.level === 'error' ? 'bg-rose-950 text-rose-300' :
                  log.level === 'warn' ? 'bg-amber-950 text-amber-300' :
                  'bg-zinc-800 text-zinc-400'
                }`}>
                  {log.category}
                </span>
                <span className="text-zinc-300 flex-1">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- SUBTAB: SETTINGS --- */}
      {subTab === 'settings' && appSettings && (
        <div className="p-6 rounded-2xl bg-zinc-900/80 border border-zinc-800 shadow-md space-y-6 max-w-2xl">
          <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
            Platform Operational Settings
          </h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-950 border border-zinc-800">
              <div>
                <span className="text-xs font-bold text-white block">Music Generation Service</span>
                <span className="text-[11px] text-zinc-400">Allow users to dispatch new generation jobs</span>
              </div>
              <button
                onClick={() => handleSaveSettings({ generationEnabled: !appSettings.generationEnabled })}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  appSettings.generationEnabled ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {appSettings.generationEnabled ? 'ENABLED' : 'PAUSED'}
              </button>
            </div>

            <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-950 border border-zinc-800">
              <div>
                <span className="text-xs font-bold text-white block">Maintenance Mode</span>
                <span className="text-[11px] text-zinc-400">Halts all generation requests with maintenance advisory</span>
              </div>
              <button
                onClick={() => handleSaveSettings({ maintenanceMode: !appSettings.maintenanceMode })}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  appSettings.maintenanceMode ? 'bg-rose-500 text-white' : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {appSettings.maintenanceMode ? 'ACTIVE' : 'OFF'}
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Default User Initial Credits
              </label>
              <input
                type="number"
                value={appSettings.defaultUserCredit}
                onChange={(e) => handleSaveSettings({ defaultUserCredit: parseInt(e.target.value, 10) })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1">
                Max Provider Failover Retries
              </label>
              <input
                type="number"
                min="0"
                max="5"
                value={appSettings.maxRetryCount}
                onChange={(e) => handleSaveSettings({ maxRetryCount: parseInt(e.target.value, 10) })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
