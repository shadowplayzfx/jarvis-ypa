import { Fragment, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  Plus,
  Power,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type {
  PCApprovalMode,
  PCCommand,
  PCCommandStatus,
  PCRiskLevel,
  PCSettings,
} from '../types/jarvis';
import { PCApprovalCard } from './PCApprovalCard';

interface PCControlPageProps {
  isAdmin: boolean;
  adminClaimed: boolean;
  envPasscodeConfigured: boolean;
  onAdminAuthenticated: (token: string) => void;
  onAdminLogout: () => void;
  settings: PCSettings | null;
  commands: PCCommand[];
  agentOnline: boolean;
  lastSyncedAt: number | null;
  onRefreshState: () => Promise<void>;
  onUpdateSettings: (patch: Record<string, unknown>) => Promise<string | null>;
  onRegenerateToken: () => Promise<void>;
  onDecideCommand: (
    id: string,
    decision: 'approve' | 'deny',
    opts?: { pin?: string; alwaysAllowApp?: boolean }
  ) => Promise<string | null>;
}

const APPROVAL_MODES: Array<{
  id: PCApprovalMode;
  title: string;
  desc: string;
}> = [
  {
    id: 'ask_always',
    title: 'Ask Always',
    desc: 'Every detected PC command requires your explicit approval.',
  },
  {
    id: 'auto_low_risk',
    title: 'Auto Low Risk',
    desc: 'Low-risk actions & allowed apps run automatically; medium/high ask.',
  },
  {
    id: 'auto_all_except_high',
    title: 'Auto Except High',
    desc: 'Low & medium run automatically; high risk always asks.',
  },
];

export function PCControlPage({
  isAdmin,
  adminClaimed,
  envPasscodeConfigured,
  onAdminAuthenticated,
  onAdminLogout,
  settings,
  commands,
  agentOnline,
  lastSyncedAt,
  onRefreshState,
  onUpdateSettings,
  onRegenerateToken,
  onDecideCommand,
}: PCControlPageProps) {
  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const [newApp, setNewApp] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinMsg, setPinMsg] = useState<string | null>(null);
  const [tokenVisible, setTokenVisible] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | PCCommandStatus>('all');
  const [riskFilter, setRiskFilter] = useState<'all' | PCRiskLevel>('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [syncClock, setSyncClock] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setSyncClock(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const handleAuthSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    if (!adminClaimed && !envPasscodeConfigured) {
      if (passcode.trim().length < 4) {
        setAuthError('Passcode must be at least 4 characters.');
        return;
      }
      if (passcode !== confirmPasscode) {
        setAuthError('Passcodes do not match.');
        return;
      }
    }

    setAuthLoading(true);
    try {
      const endpoint =
        !adminClaimed && !envPasscodeConfigured ? '/api/admin/claim' : '/api/admin/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode: passcode.trim() }),
      });
      const data = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !data.token) {
        setAuthError(data.error || 'Authentication failed.');
      } else {
        setPasscode('');
        setConfirmPasscode('');
        onAdminAuthenticated(data.token);
      }
    } catch {
      setAuthError('Unable to reach server.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleCopyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  if (!isAdmin) {
    const isClaimMode = !adminClaimed && !envPasscodeConfigured;
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#060B16]/95 p-6 sm:p-7 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/12 text-cyan-300">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">
                {isClaimMode ? 'Claim Admin Access' : 'Admin Sign-In Required'}
              </h1>
              <p className="text-xs text-slate-400">
                {isClaimMode
                  ? 'Set your first-run admin passcode to unlock PC Control.'
                  : 'PC Control, approvals, and agent tokens are restricted to admins.'}
              </p>
            </div>
          </div>

          <form onSubmit={handleAuthSubmit} className="mt-5 space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                {isClaimMode ? 'Create Admin Passcode' : 'Admin Passcode'}
              </label>
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter passcode (min 4 characters)"
                required
                className="w-full rounded-xl border border-white/[0.12] bg-black/60 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>

            {isClaimMode && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Confirm Passcode
                </label>
                <input
                  type="password"
                  value={confirmPasscode}
                  onChange={(e) => setConfirmPasscode(e.target.value)}
                  placeholder="Re-enter passcode"
                  required
                  className="w-full rounded-xl border border-white/[0.12] bg-black/60 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>
            )}

            {authError && (
              <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
                {authError}
              </p>
            )}

            <button
              type="submit"
              disabled={authLoading}
              className="w-full h-11 rounded-xl bg-cyan-400 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {authLoading
                ? 'Verifying...'
                : isClaimMode
                ? 'Claim Admin & Unlock PC Control'
                : 'Unlock PC Control'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-12 text-sm text-slate-400">
        Loading PC Control state...
      </div>
    );
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const pollUrl = `${origin}/api/agent/poll`;
  const reportUrl = `${origin}/api/agent/report`;

  const pendingCommands = commands.filter((c) => c.status === 'pending_approval');
  const filteredCommands = commands.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (riskFilter !== 'all' && c.risk_level !== riskFilter) return false;
    return true;
  });

  const secondsSinceSync = lastSyncedAt
    ? Math.max(0, Math.floor((syncClock - lastSyncedAt) / 1000))
    : 0;

  const handleAddApp = async (e: FormEvent) => {
    e.preventDefault();
    const cleaned = newApp.trim().toLowerCase();
    if (!cleaned) return;
    if (!settings.allowed_apps.includes(cleaned)) {
      await onUpdateSettings({ allowed_apps: [...settings.allowed_apps, cleaned] });
    }
    setNewApp('');
  };

  const handleRemoveApp = async (app: string) => {
    await onUpdateSettings({
      allowed_apps: settings.allowed_apps.filter((a) => a !== app),
    });
  };

  const handleSetPin = async (e: FormEvent) => {
    e.preventDefault();
    setPinMsg(null);
    if (newPin.trim().length < 4) {
      setPinMsg('PIN must be at least 4 characters.');
      return;
    }
    const err = await onUpdateSettings({ new_pin: newPin.trim() });
    if (err) {
      setPinMsg(err);
    } else {
      setNewPin('');
      setPinMsg('High-risk PIN updated.');
    }
  };

  const handleExportCsv = () => {
    const header = ['Time', 'Command', 'Action', 'Risk', 'Status', 'Result'];
    const rows = filteredCommands.map((c) => [
      c.created_at,
      `"${c.command_text.replace(/"/g, '""')}"`,
      c.action,
      c.risk_level,
      c.status,
      `"${(c.result_message || '').replace(/"/g, '""')}"`,
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jarvis-pc-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="jarvis-scroll flex-1 overflow-y-auto px-4 sm:px-6 py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Top Console Status Strip */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 rounded-2xl border border-white/[0.09] bg-[#060B16]/95 p-5">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold text-white">PC Control Console</h1>
              <span
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium ${
                  agentOnline
                    ? 'border-emerald-500/35 bg-emerald-500/12 text-emerald-300'
                    : 'border-slate-600/40 bg-slate-800/60 text-slate-300'
                }`}
              >
                {agentOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                <span>PC Agent: {agentOnline ? 'Online' : 'Offline'}</span>
              </span>
              <span className="font-mono text-xs text-slate-400 tabular-nums">
                Synced {secondsSinceSync}s ago
              </span>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-slate-400">
              Manage permissions, allowed apps, and local Python agent connectivity.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => onRefreshState()}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 text-xs font-medium text-slate-200 hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Sync</span>
            </button>

            <button
              type="button"
              onClick={() =>
                onUpdateSettings({ pc_control_enabled: !settings.pc_control_enabled })
              }
              className={`flex h-10 items-center gap-2 rounded-xl border px-3.5 text-xs font-semibold transition-colors cursor-pointer ${
                settings.pc_control_enabled
                  ? 'border-cyan-400/50 bg-cyan-500/18 text-cyan-100 hover:bg-cyan-500/25'
                  : 'border-white/[0.1] bg-white/[0.04] text-slate-400 hover:text-white'
              }`}
            >
              <Power className="h-3.5 w-3.5" />
              <span>PC Control: {settings.pc_control_enabled ? 'Enabled' : 'Disabled'}</span>
            </button>

            <button
              type="button"
              onClick={() => onUpdateSettings({ kill_switch: !settings.kill_switch })}
              className={`flex h-10 items-center gap-2 rounded-xl border px-4 text-xs font-bold tracking-wide uppercase transition-all cursor-pointer active:scale-[0.98] ${
                settings.kill_switch
                  ? 'border-rose-400 bg-rose-600 text-white shadow-[0_0_24px_rgba(225,29,72,0.45)]'
                  : 'border-rose-500/45 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
              }`}
            >
              <ShieldAlert className="h-4 w-4" />
              <span>{settings.kill_switch ? 'KILL SWITCH ACTIVE' : 'KILL SWITCH'}</span>
            </button>

            <button
              type="button"
              onClick={onAdminLogout}
              title="Lock Admin Session"
              className="flex h-10 items-center gap-1.5 rounded-xl border border-white/[0.1] bg-white/[0.04] px-3 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Lock</span>
            </button>
          </div>
        </div>

        {/* Pending Approvals (if any) */}
        {pendingCommands.length > 0 && (
          <section className="rounded-2xl border border-amber-400/25 bg-[#0A0E1A]/95 p-5">
            <h2 className="text-sm font-semibold text-amber-200">
              Pending Approvals ({pendingCommands.length})
            </h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {pendingCommands.map((cmd) => (
                <div
                  key={cmd.id}
                  className="rounded-xl border border-white/[0.08] bg-black/40 p-3"
                >
                  <p className="text-xs text-slate-300 mb-1">“{cmd.command_text}”</p>
                  <PCApprovalCard
                    command={cmd}
                    pinConfigured={settings.pin_configured}
                    onDecide={onDecideCommand}
                  />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Settings Grid: Approval Mode + Allowed Apps + High-Risk PIN */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Approval Modes */}
          <section className="rounded-2xl border border-white/[0.09] bg-[#060B16]/95 p-5 space-y-3">
            <h2 className="text-sm font-semibold text-white">Approval Mode</h2>
            <div className="space-y-2">
              {APPROVAL_MODES.map((mode) => {
                const active = settings.approval_mode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => onUpdateSettings({ approval_mode: mode.id })}
                    className={`w-full rounded-xl border p-3 text-left transition-colors cursor-pointer ${
                      active
                        ? 'border-cyan-400/50 bg-cyan-500/12 text-white'
                        : 'border-white/[0.07] bg-white/[0.02] text-slate-300 hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span>{mode.title}</span>
                      {active && <Check className="h-3.5 w-3.5 text-cyan-400" />}
                    </div>
                    <p className="mt-1 text-xs text-slate-400 leading-relaxed">{mode.desc}</p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Allowed Apps */}
          <section className="rounded-2xl border border-white/[0.09] bg-[#060B16]/95 p-5 flex flex-col justify-between space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Allowed Apps</h2>
              <p className="mt-1 text-xs text-slate-400">
                Apps allowed to launch automatically in Auto Low Risk mode.
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {settings.allowed_apps.map((app) => (
                  <span
                    key={app}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-2.5 py-1 font-mono text-xs text-cyan-200"
                  >
                    <span>{app}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveApp(app)}
                      aria-label={`Remove ${app}`}
                      className="text-slate-400 hover:text-rose-300 cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <form onSubmit={handleAddApp} className="flex gap-2">
              <input
                type="text"
                value={newApp}
                onChange={(e) => setNewApp(e.target.value)}
                placeholder="Add app (e.g. discord)"
                className="flex-1 rounded-xl border border-white/[0.1] bg-black/60 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
              />
              <button
                type="submit"
                className="flex h-9 items-center gap-1 rounded-xl bg-cyan-500/20 border border-cyan-400/35 px-3 text-xs font-medium text-cyan-200 hover:bg-cyan-500/30 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add</span>
              </button>
            </form>
          </section>

          {/* High-Risk PIN & Agent Setup */}
          <section className="rounded-2xl border border-white/[0.09] bg-[#060B16]/95 p-5 space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">High-Risk PIN</h2>
                <span className="text-xs font-mono text-slate-400">
                  {settings.pin_configured ? 'Active' : 'Not set'}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Optional extra PIN required for lock, restart, and shutdown.
              </p>

              <form onSubmit={handleSetPin} className="mt-3 flex gap-2">
                <input
                  type="password"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder="New PIN (min 4 chars)"
                  className="flex-1 rounded-xl border border-white/[0.1] bg-black/60 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-white/[0.08] px-3 py-2 text-xs font-medium text-white hover:bg-white/[0.14] cursor-pointer"
                >
                  Save
                </button>
                {settings.pin_configured && (
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ new_pin: null })}
                    className="rounded-xl border border-rose-500/30 px-2.5 py-2 text-xs text-rose-300 hover:bg-rose-500/15 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </form>
              {pinMsg && <p className="mt-1.5 text-xs text-cyan-300">{pinMsg}</p>}
            </div>

            <div className="border-t border-white/[0.07] pt-4 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">Agent Setup</h3>
                <button
                  type="button"
                  onClick={onRegenerateToken}
                  className="text-xs text-cyan-300 hover:text-cyan-200 cursor-pointer"
                >
                  Regenerate token
                </button>
              </div>

              <div>
                <div className="text-[11px] text-slate-400 mb-1">X-Agent-Token</div>
                <div className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-black/60 px-2.5 py-1.5">
                  <code className="flex-1 truncate font-mono text-xs text-cyan-100">
                    {tokenVisible
                      ? settings.agent_token
                      : '••••••••••••••••••••••••••••••••••••••••'}
                  </code>
                  <button
                    type="button"
                    onClick={() => setTokenVisible((v) => !v)}
                    aria-label={tokenVisible ? 'Hide token' : 'Reveal token'}
                    className="p-1 text-slate-400 hover:text-white cursor-pointer"
                  >
                    {tokenVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCopyText('token', settings.agent_token)}
                    aria-label="Copy agent token"
                    className="p-1 text-slate-400 hover:text-cyan-300 cursor-pointer"
                  >
                    {copiedKey === 'token' ? (
                      <Check className="h-3.5 w-3.5 text-cyan-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-black/45 px-2.5 py-1.5">
                  <span className="truncate font-mono text-[11px] text-slate-300">
                    GET {pollUrl}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyText('poll', pollUrl)}
                    className="text-slate-400 hover:text-cyan-300 shrink-0 cursor-pointer"
                  >
                    {copiedKey === 'poll' ? (
                      <Check className="h-3.5 w-3.5 text-cyan-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-black/45 px-2.5 py-1.5">
                  <span className="truncate font-mono text-[11px] text-slate-300">
                    POST {reportUrl}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyText('report', reportUrl)}
                    className="text-slate-400 hover:text-cyan-300 shrink-0 cursor-pointer"
                  >
                    {copiedKey === 'report' ? (
                      <Check className="h-3.5 w-3.5 text-cyan-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Audit Log / Command History Table */}
        <section className="rounded-2xl border border-white/[0.09] bg-[#060B16]/95 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-white">Command Audit Log</h2>
              <span className="font-mono text-xs text-slate-400 tabular-nums">
                ({filteredCommands.length})
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | PCCommandStatus)}
                aria-label="Filter by status"
                className="rounded-lg border border-white/[0.1] bg-black/60 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
              >
                <option value="all">All Statuses</option>
                <option value="pending_approval">Pending</option>
                <option value="approved">Approved</option>
                <option value="running">Running</option>
                <option value="done">Done</option>
                <option value="failed">Failed</option>
                <option value="denied">Denied</option>
                <option value="expired">Expired</option>
              </select>

              <select
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value as 'all' | PCRiskLevel)}
                aria-label="Filter by risk"
                className="rounded-lg border border-white/[0.1] bg-black/60 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none"
              >
                <option value="all">All Risk Levels</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>

              <button
                type="button"
                onClick={handleExportCsv}
                disabled={filteredCommands.length === 0}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/[0.08] disabled:opacity-40 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {filteredCommands.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              No PC commands recorded matching the selected filters yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/[0.08] text-slate-400">
                    <th className="py-2.5 pr-3 font-medium">Time</th>
                    <th className="py-2.5 pr-3 font-medium">Command</th>
                    <th className="py-2.5 pr-3 font-medium">Action</th>
                    <th className="py-2.5 pr-3 font-medium">Risk</th>
                    <th className="py-2.5 pr-3 font-medium">Status</th>
                    <th className="py-2.5 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {filteredCommands.map((cmd) => {
                    const isExpanded = expandedRow === cmd.id;
                    return (
                      <Fragment key={cmd.id}>
                        <tr
                          onClick={() => setExpandedRow(isExpanded ? null : cmd.id)}
                          className="hover:bg-white/[0.03] cursor-pointer transition-colors"
                        >
                          <td className="py-2.5 pr-3 font-mono text-slate-400 tabular-nums whitespace-nowrap">
                            <span className="inline-flex items-center gap-1">
                              {isExpanded ? (
                                <ChevronDown className="h-3 w-3" />
                              ) : (
                                <ChevronRight className="h-3 w-3" />
                              )}
                              {new Date(cmd.created_at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit',
                              })}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3 text-slate-200 max-w-[220px] truncate">
                            {cmd.command_text}
                          </td>
                          <td className="py-2.5 pr-3 font-mono text-cyan-200 whitespace-nowrap">
                            {cmd.action}
                          </td>
                          <td className="py-2.5 pr-3 uppercase font-mono text-[11px] whitespace-nowrap">
                            <span
                              className={
                                cmd.risk_level === 'high'
                                  ? 'text-rose-300'
                                  : cmd.risk_level === 'medium'
                                  ? 'text-amber-300'
                                  : 'text-cyan-300'
                              }
                            >
                              {cmd.risk_level}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3 font-mono whitespace-nowrap text-slate-300">
                            {cmd.status}
                          </td>
                          <td className="py-2.5 text-slate-400 max-w-[200px] truncate">
                            {cmd.result_message || '—'}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-black/40">
                            <td colSpan={6} className="px-4 py-3 text-xs text-slate-300 space-y-1.5">
                              <div>
                                <span className="text-slate-500">Params: </span>
                                <code className="font-mono text-cyan-100">
                                  {JSON.stringify(cmd.params)}
                                </code>
                              </div>
                              <div className="flex flex-wrap gap-4 font-mono text-[11px] text-slate-400 tabular-nums">
                                <span>ID: {cmd.id}</span>
                                <span>Created: {cmd.created_at}</span>
                                {cmd.decided_at && <span>Decided: {cmd.decided_at}</span>}
                                {cmd.executed_at && <span>Executed: {cmd.executed_at}</span>}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
