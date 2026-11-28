import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Camera,
  Check,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogOut,
  Pause,
  Play,
  Plus,
  Power,
  RefreshCw,
  ShieldAlert,
  SkipBack,
  SkipForward,
  Trash2,
  Unlock,
  Volume1,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import type {
  AllowedAppEntry,
  AppLock,
  AppView,
  PCAction,
  PCApprovalMode,
  PCCommand,
  PCSettings,
} from '../types/jarvis';
import { PCApprovalCard } from './PCApprovalCard';

interface PCControlPageProps {
  isAdmin: boolean;
  onAdminAuthenticated: (token: string) => void;
  onAdminLogout: () => void;
  onNavigateView: (view: AppView) => void;
  settings: PCSettings | null;
  commands: PCCommand[];
  locks: AppLock[];
  agentOnline: boolean;
  lastSyncedAt: number | null;
  onRefreshState: () => Promise<void>;
  onUpdateSettings: (patch: Record<string, unknown>) => Promise<string | null>;
  onRegenerateToken: () => Promise<void>;
  onDecideCommand: (
    id: string,
    decision: 'approve' | 'deny',
    opts?: { passcode?: string; alwaysAllowApp?: boolean }
  ) => Promise<string | null>;
  onUnlockApp: (lockId: string, passcode: string) => Promise<string | null>;
  onQuickAction: (
    action: PCAction,
    params: Record<string, unknown>
  ) => Promise<{ ok: boolean; error?: string; message?: string }>;
}

const APPROVAL_MODES: Array<{
  id: PCApprovalMode;
  title: string;
  desc: string;
}> = [
  {
    id: 'ask_always',
    title: 'Ask Always',
    desc: 'System actions wait for admin approval before running.',
  },
  {
    id: 'auto_low_risk',
    title: 'Auto Low Risk',
    desc: 'Permitted apps and low-risk controls run right away; high risk asks.',
  },
  {
    id: 'auto_all_except_high',
    title: 'Auto Except High',
    desc: 'Low & medium run automatically; high risk still asks for passcode.',
  },
];

function formatCountdown(endsAtIso: string, nowMs: number): string {
  const diffSec = Math.max(0, Math.ceil((Date.parse(endsAtIso) - nowMs) / 1000));
  const hours = Math.floor(diffSec / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  const secs = diffSec % 60;
  if (hours > 0) {
    return `${hours}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
  }
  return `${mins}m ${secs.toString().padStart(2, '0')}s`;
}

export function PCControlPage({
  isAdmin,
  onAdminAuthenticated,
  onAdminLogout,
  onNavigateView,
  settings,
  commands,
  locks,
  agentOnline,
  lastSyncedAt,
  onRefreshState,
  onUpdateSettings,
  onRegenerateToken,
  onDecideCommand,
  onUnlockApp,
  onQuickAction,
}: PCControlPageProps) {
  const [passcode, setPasscode] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  // Quick Remote Feedback + Lock Picker
  const [quickFeedback, setQuickFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [quickLockApp, setQuickLockApp] = useState('Chrome');
  const [quickLockMins, setQuickLockMins] = useState(30);

  // Add / Edit Allowed App Form
  const [editingAppId, setEditingAppId] = useState<string | null>(null);
  const [appNameInput, setAppNameInput] = useState('');
  const [appAliasesInput, setAppAliasesInput] = useState('');
  const [appCommandInput, setAppCommandInput] = useState('');
  const [appProcessInput, setAppProcessInput] = useState('');
  const [appFormError, setAppFormError] = useState<string | null>(null);

  // Change Passcode Form
  const [currentPassInput, setCurrentPassInput] = useState('');
  const [newPassInput, setNewPassInput] = useState('');
  const [confirmPassInput, setConfirmPassInput] = useState('');
  const [passChangeMsg, setPassChangeMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [passChangeLoading, setPassChangeLoading] = useState(false);

  // Early Unlock Passcode Prompt
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [unlockPasscode, setUnlockPasscode] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlockLoading, setUnlockLoading] = useState(false);

  // Agent Token & Copy State
  const [tokenVisible, setTokenVisible] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [nowClock, setNowClock] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => {
      setNowClock(Date.now());
      setLockoutSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (isAdmin) return;
    fetch('/api/admin/status')
      .then((res) => res.json())
      .then((data: { lockout?: { locked?: boolean; remainingSeconds?: number } }) => {
        if (data.lockout?.locked && typeof data.lockout.remainingSeconds === 'number') {
          setLockoutSeconds(data.lockout.remainingSeconds);
        }
      })
      .catch(() => {});
  }, [isAdmin]);

  const handleAuthSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (lockoutSeconds > 0) return;
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      const data = (await res.json()) as {
        token?: string;
        error?: string;
        locked?: boolean;
        remainingSeconds?: number;
      };
      if (!res.ok || !data.token) {
        if (data.locked && typeof data.remainingSeconds === 'number') {
          setLockoutSeconds(data.remainingSeconds);
        }
        setAuthError(data.error || 'Incorrect passcode.');
      } else {
        setPasscode('');
        setLockoutSeconds(0);
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

  const runQuick = async (
    action: PCAction,
    params: Record<string, unknown>,
    successLabel: string
  ) => {
    setQuickFeedback(null);
    const res = await onQuickAction(action, params);
    if (!res.ok) {
      setQuickFeedback({ ok: false, text: res.error || 'Could not queue action.' });
    } else {
      setQuickFeedback({
        ok: true,
        text: agentOnline
          ? `${successLabel} — sent to your PC.`
          : `${successLabel} — queued (waiting for PC Agent).`,
      });
    }
  };

  if (!isAdmin) {
    const lockMins = Math.floor(lockoutSeconds / 60);
    const lockSecs = lockoutSeconds % 60;
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-white/[0.09] bg-[#070B14]/96 p-6 sm:p-7 shadow-2xl shadow-black/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-500/10 text-cyan-300 shrink-0">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Admin Sign-In</h1>
              <p className="text-xs text-slate-400 leading-relaxed mt-0.5">
                Enter your case-sensitive admin passcode to manage remote controls, app locks, and permissions.
              </p>
            </div>
          </div>

          <form onSubmit={handleAuthSubmit} className="mt-5 space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Admin Passcode
              </label>
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                disabled={lockoutSeconds > 0}
                placeholder="Enter admin passcode"
                required
                className="w-full rounded-xl border border-white/[0.1] bg-black/55 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 disabled:opacity-45 transition-colors"
              />
            </div>

            {lockoutSeconds > 0 && (
              <div className="rounded-lg border border-rose-500/35 bg-rose-500/12 px-3 py-2.5 text-xs text-rose-200 font-mono tabular-nums">
                Passcode prompt locked after 5 wrong attempts. Retry in {lockMins}m{' '}
                {lockSecs.toString().padStart(2, '0')}s.
              </div>
            )}

            {authError && lockoutSeconds === 0 && (
              <p className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2">
                {authError}
              </p>
            )}

            <button
              type="submit"
              disabled={authLoading || lockoutSeconds > 0}
              className="w-full h-11 rounded-xl bg-cyan-400 text-sm font-semibold text-slate-950 hover:bg-cyan-300 active:scale-[0.99] disabled:opacity-45 transition-all shadow-md shadow-black/40 cursor-pointer"
            >
              {authLoading ? 'Checking passcode…' : 'Open PC Console'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-12 text-sm text-slate-400">
        Loading your PC console…
      </div>
    );
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const pollUrl = `${origin}/api/agent/poll`;
  const reportUrl = `${origin}/api/agent/report`;

  const pendingCommands = commands.filter((c) => c.status === 'pending_approval');
  const activeLocks = locks.filter(
    (l) => l.status === 'active' && Date.parse(l.ends_at) > nowClock
  );
  const lockedNames = new Set(activeLocks.map((l) => l.app.toLowerCase()));

  const secondsSinceSync = lastSyncedAt
    ? Math.max(0, Math.floor((nowClock - lastSyncedAt) / 1000))
    : 0;

  const resetAppForm = () => {
    setEditingAppId(null);
    setAppNameInput('');
    setAppAliasesInput('');
    setAppCommandInput('');
    setAppProcessInput('');
    setAppFormError(null);
  };

  const handleStartEditApp = (app: AllowedAppEntry) => {
    setEditingAppId(app.id);
    setAppNameInput(app.displayName);
    setAppAliasesInput(app.aliases.join(', '));
    setAppCommandInput(app.launchCommand);
    setAppProcessInput(app.processName);
    setAppFormError(null);
  };

  const handleSaveApp = async (e: FormEvent) => {
    e.preventDefault();
    setAppFormError(null);
    const displayName = appNameInput.trim();
    const launchCommand = appCommandInput.trim();
    const processName = appProcessInput.trim();
    const aliases = appAliasesInput
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (!displayName || !launchCommand || !processName) {
      setAppFormError('Display name, launch command, and process name are required.');
      return;
    }

    const finalAliases = aliases.length > 0 ? aliases : [displayName.toLowerCase()];

    if (editingAppId) {
      const updatedList = settings.allowed_apps.map((a) =>
        a.id === editingAppId
          ? { ...a, displayName, aliases: finalAliases, launchCommand, processName }
          : a
      );
      const err = await onUpdateSettings({ allowed_apps: updatedList });
      if (err) setAppFormError(err);
      else resetAppForm();
    } else {
      const newEntry: AllowedAppEntry = {
        id: `app_${displayName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now()
          .toString(36)
          .slice(-3)}`,
        displayName,
        aliases: finalAliases,
        launchCommand,
        processName,
      };
      const err = await onUpdateSettings({
        allowed_apps: [...settings.allowed_apps, newEntry],
      });
      if (err) setAppFormError(err);
      else resetAppForm();
    }
  };

  const handleRemoveApp = async (id: string) => {
    await onUpdateSettings({
      allowed_apps: settings.allowed_apps.filter((a) => a.id !== id),
    });
    if (editingAppId === id) resetAppForm();
  };

  const handleConfirmUnlock = async (e: FormEvent, lockId: string) => {
    e.preventDefault();
    setUnlockError(null);
    setUnlockLoading(true);
    const err = await onUnlockApp(lockId, unlockPasscode);
    setUnlockLoading(false);
    if (err) {
      setUnlockError(err);
    } else {
      setUnlockingId(null);
      setUnlockPasscode('');
    }
  };

  const controlsDisabled = settings.kill_switch || !settings.pc_control_enabled;

  return (
    <div className="jarvis-scroll flex-1 overflow-y-auto px-4 sm:px-6 py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Top Console Strip */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 rounded-2xl border border-white/[0.08] bg-[#070B14]/95 p-5 shadow-lg shadow-black/45">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-semibold text-white">PC Controls</h1>
              <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                {agentOnline ? (
                  <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <WifiOff className="h-3.5 w-3.5 text-slate-500" />
                )}
                <span className={agentOnline ? 'text-emerald-300' : 'text-slate-400'}>
                  PC Agent: {agentOnline ? 'Online' : 'Offline'}
                </span>
              </span>
              <span className="text-slate-600" aria-hidden="true">
                ·
              </span>
              <span className="text-xs text-slate-400 tabular-nums">
                Updated {secondsSinceSync}s ago
              </span>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-slate-400">
              Launch permitted apps, adjust media or volume, lock distracting apps, and manage your Windows agent.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigateView('guide')}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-white/[0.09] bg-white/[0.03] px-3 text-xs font-medium text-slate-200 hover:bg-white/[0.08] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <BookOpen className="h-3.5 w-3.5 text-cyan-300" />
              <span>Setup Guide</span>
            </button>

            <button
              type="button"
              onClick={() => onRefreshState()}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-white/[0.09] bg-white/[0.03] px-3 text-xs font-medium text-slate-200 hover:bg-white/[0.08] active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Sync</span>
            </button>

            <button
              type="button"
              onClick={() =>
                onUpdateSettings({ pc_control_enabled: !settings.pc_control_enabled })
              }
              className={`flex h-10 items-center gap-2 rounded-xl border px-3.5 text-xs font-semibold active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                settings.pc_control_enabled
                  ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/22'
                  : 'border-white/[0.09] bg-white/[0.03] text-slate-400 hover:text-white'
              }`}
            >
              <Power className="h-3.5 w-3.5" />
              <span>PC Controls: {settings.pc_control_enabled ? 'On' : 'Off'}</span>
            </button>

            <button
              type="button"
              onClick={() => onUpdateSettings({ kill_switch: !settings.kill_switch })}
              className={`flex h-10 items-center gap-2 rounded-xl border px-4 text-xs font-semibold transition-all cursor-pointer active:scale-[0.98] whitespace-nowrap shrink-0 ${
                settings.kill_switch
                  ? 'border-rose-400 bg-rose-600 text-white shadow-lg shadow-rose-950/60'
                  : 'border-rose-500/45 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
              }`}
            >
              <ShieldAlert className="h-4 w-4" />
              <span>{settings.kill_switch ? 'Kill Switch Active' : 'Kill Switch'}</span>
            </button>

            <button
              type="button"
              onClick={onAdminLogout}
              title="Lock Admin Session"
              className="flex h-10 items-center gap-1.5 rounded-xl border border-white/[0.09] bg-white/[0.03] px-3 text-xs font-medium text-slate-300 hover:text-white hover:bg-white/[0.08] active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Lock</span>
            </button>
          </div>
        </div>

        {/* Offline warning when active locks exist */}
        {activeLocks.length > 0 && !agentOnline && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
            <div className="flex items-start sm:items-center gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-300 shrink-0 mt-0.5 sm:mt-0" />
              <span>
                <strong>PC Agent is offline.</strong> JARVIS chat blocks locked apps, though closing running processes on your PC waits until the local agent connects.
              </span>
            </div>
            <button
              type="button"
              onClick={() => onNavigateView('guide')}
              className="text-xs font-semibold text-amber-200 underline underline-offset-2 hover:text-white shrink-0 cursor-pointer"
            >
              Open Guide
            </button>
          </div>
        )}

        {/* Quick Remote Controls Deck */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#070B14]/95 p-5 shadow-lg shadow-black/45 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-white">Quick Remote Controls</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Launch permitted apps, control media or volume, take a screenshot, or start a focus lock in one click.
              </p>
            </div>
            {quickFeedback && (
              <span
                className={`text-xs font-medium ${
                  quickFeedback.ok ? 'text-emerald-300' : 'text-rose-300'
                }`}
              >
                {quickFeedback.text}
              </span>
            )}
          </div>

          {/* 1-Click App Launcher */}
          <div>
            <div className="text-xs font-medium text-slate-400 mb-2">Launch an app</div>
            <div className="flex flex-wrap gap-2">
              {settings.allowed_apps.map((app) => {
                const isLocked = lockedNames.has(app.displayName.toLowerCase());
                return (
                  <button
                    key={app.id}
                    type="button"
                    disabled={controlsDisabled || isLocked}
                    onClick={() =>
                      runQuick('open_app', { name: app.displayName }, `Open ${app.displayName}`)
                    }
                    className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.09] bg-black/40 px-3.5 text-xs font-medium text-slate-200 hover:border-cyan-400/45 hover:bg-cyan-500/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  >
                    {isLocked && <Lock className="h-3 w-3 text-amber-300" />}
                    <span>{app.displayName}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 pt-2 border-t border-white/[0.06]">
            {/* Media, Volume & Screenshot */}
            <div>
              <div className="text-xs font-medium text-slate-400 mb-2">Media, Volume & Screen</div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={controlsDisabled}
                  onClick={() => runQuick('media_control', { key: 'prev' }, 'Previous track')}
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.09] bg-black/40 px-3 text-xs text-slate-200 hover:bg-white/[0.08] disabled:opacity-40 cursor-pointer"
                >
                  <SkipBack className="h-3.5 w-3.5" />
                  <span>Prev</span>
                </button>
                <button
                  type="button"
                  disabled={controlsDisabled}
                  onClick={() =>
                    runQuick('media_control', { key: 'playpause' }, 'Play / Pause media')
                  }
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.09] bg-black/40 px-3 text-xs text-slate-200 hover:bg-white/[0.08] disabled:opacity-40 cursor-pointer"
                >
                  <Play className="h-3.5 w-3.5" />
                  <Pause className="h-3.5 w-3.5 -ml-1" />
                  <span>Play / Pause</span>
                </button>
                <button
                  type="button"
                  disabled={controlsDisabled}
                  onClick={() => runQuick('media_control', { key: 'next' }, 'Next track')}
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.09] bg-black/40 px-3 text-xs text-slate-200 hover:bg-white/[0.08] disabled:opacity-40 cursor-pointer"
                >
                  <SkipForward className="h-3.5 w-3.5" />
                  <span>Next</span>
                </button>

                <span className="h-5 w-px bg-white/[0.08] mx-0.5 hidden sm:inline-block" />

                <button
                  type="button"
                  disabled={controlsDisabled}
                  onClick={() =>
                    runQuick('volume', { direction: 'down', steps: 2 }, 'Volume down')
                  }
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.09] bg-black/40 px-3 text-xs text-slate-200 hover:bg-white/[0.08] disabled:opacity-40 cursor-pointer"
                >
                  <Volume1 className="h-3.5 w-3.5" />
                  <span>Vol -</span>
                </button>
                <button
                  type="button"
                  disabled={controlsDisabled}
                  onClick={() => runQuick('volume', { direction: 'mute', steps: 1 }, 'Toggle mute')}
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.09] bg-black/40 px-3 text-xs text-slate-200 hover:bg-white/[0.08] disabled:opacity-40 cursor-pointer"
                >
                  <VolumeX className="h-3.5 w-3.5" />
                  <span>Mute</span>
                </button>
                <button
                  type="button"
                  disabled={controlsDisabled}
                  onClick={() => runQuick('volume', { direction: 'up', steps: 2 }, 'Volume up')}
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.09] bg-black/40 px-3 text-xs text-slate-200 hover:bg-white/[0.08] disabled:opacity-40 cursor-pointer"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                  <span>Vol +</span>
                </button>

                <button
                  type="button"
                  disabled={controlsDisabled}
                  onClick={() => runQuick('screenshot', {}, 'Desktop screenshot')}
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 text-xs font-medium text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-40 cursor-pointer"
                >
                  <Camera className="h-3.5 w-3.5 text-cyan-300" />
                  <span>Screenshot</span>
                </button>
              </div>
            </div>

            {/* Quick Focus Lock */}
            <div>
              <div className="text-xs font-medium text-slate-400 mb-2">Quick Focus Lock</div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={quickLockApp}
                  onChange={(e) => setQuickLockApp(e.target.value)}
                  aria-label="Choose app to lock"
                  className="h-9 rounded-lg border border-white/[0.1] bg-black/60 px-2.5 text-xs text-white focus:outline-none focus:border-cyan-400"
                >
                  {settings.allowed_apps.map((app) => (
                    <option key={app.id} value={app.displayName}>
                      {app.displayName}
                    </option>
                  ))}
                  <option value="Discord">Discord</option>
                  <option value="Steam">Steam</option>
                </select>

                {[15, 30, 60].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setQuickLockMins(m)}
                    className={`h-9 rounded-lg px-2.5 text-xs font-medium tabular-nums transition-colors cursor-pointer ${
                      quickLockMins === m
                        ? 'bg-amber-400/20 border border-amber-400/45 text-amber-200'
                        : 'border border-white/[0.08] bg-black/40 text-slate-300 hover:text-white'
                    }`}
                  >
                    {m}m
                  </button>
                ))}

                <button
                  type="button"
                  disabled={controlsDisabled}
                  onClick={() =>
                    runQuick(
                      'lock_app',
                      { app: quickLockApp, duration_minutes: quickLockMins },
                      `Locked ${quickLockApp} for ${quickLockMins}m`
                    )
                  }
                  className="flex h-9 items-center gap-1.5 rounded-lg bg-amber-400 px-3.5 text-xs font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-40 cursor-pointer"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>Lock Now</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Pending Approvals */}
        {pendingCommands.length > 0 && (
          <section className="rounded-2xl border border-amber-400/25 bg-[#0A0E1A]/95 p-5 shadow-lg shadow-black/45">
            <h2 className="text-sm font-semibold text-amber-200">
              Waiting for Approval ({pendingCommands.length})
            </h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {pendingCommands.map((cmd) => (
                <div key={cmd.id} className="pt-1">
                  <p className="text-xs text-slate-300">“{cmd.command_text}”</p>
                  <PCApprovalCard command={cmd} isAdmin={isAdmin} onDecide={onDecideCommand} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Active App Locks Section */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#070B14]/95 p-5 shadow-lg shadow-black/45">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="text-sm font-semibold text-white">Active App Locks</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Say “lock Chrome for 30 minutes” or “lock Spotify until 6 pm”. Unlocking early always requires the admin passcode.
              </p>
            </div>
            <span className="text-xs text-slate-400 tabular-nums">{activeLocks.length} active</span>
          </div>

          {activeLocks.length === 0 ? (
            <div className="border-t border-white/[0.06] py-6 text-center text-xs text-slate-500">
              No apps are locked right now.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
              {activeLocks.map((lock) => {
                const isUnlocking = unlockingId === lock.id;
                return (
                  <div key={lock.id} className="py-3.5 space-y-2.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <Lock className="h-4 w-4 text-amber-300 shrink-0" />
                        <span className="text-sm font-medium text-white">{lock.app}</span>
                        <span className="font-mono text-xs text-slate-400">
                          {lock.process_name}
                        </span>
                        <span className="text-slate-600">·</span>
                        <span className="font-mono text-xs text-amber-300 tabular-nums">
                          {formatCountdown(lock.ends_at, nowClock)} left
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400 tabular-nums">
                          Until{' '}
                          {new Date(lock.ends_at).toLocaleTimeString([], {
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setUnlockingId(isUnlocking ? null : lock.id);
                            setUnlockPasscode('');
                            setUnlockError(null);
                          }}
                          className="flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.1] bg-white/[0.04] px-3 text-xs font-medium text-slate-200 hover:bg-white/[0.09] transition-colors cursor-pointer"
                        >
                          <Unlock className="h-3.5 w-3.5 text-cyan-300" />
                          <span>{isUnlocking ? 'Cancel' : 'Unlock Early'}</span>
                        </button>
                      </div>
                    </div>

                    {isUnlocking && (
                      <form
                        onSubmit={(e) => handleConfirmUnlock(e, lock.id)}
                        className="flex flex-col sm:flex-row sm:items-center gap-2 pt-2 border-t border-white/[0.06]"
                      >
                        <input
                          type="password"
                          value={unlockPasscode}
                          onChange={(e) => setUnlockPasscode(e.target.value)}
                          placeholder="Enter admin passcode to unlock early"
                          required
                          className="flex-1 rounded-lg border border-white/[0.12] bg-black/60 px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                        />
                        <button
                          type="submit"
                          disabled={unlockLoading || !unlockPasscode}
                          className="h-8 rounded-lg bg-cyan-400 px-3.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-45 cursor-pointer"
                        >
                          {unlockLoading ? 'Verifying…' : 'Confirm Unlock'}
                        </button>
                        {unlockError && (
                          <p className="text-xs text-rose-300 sm:ml-2">{unlockError}</p>
                        )}
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Permitted Apps Allowlist Manager */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#070B14]/95 p-5 shadow-lg shadow-black/45 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-white">Permitted Apps</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Anyone can open apps on this list by voice or text. Unlisted apps are politely refused until an admin grants permission.
              </p>
            </div>
            <span className="text-xs text-slate-400 tabular-nums">
              {settings.allowed_apps.length} permitted
            </span>
          </div>

          <div className="overflow-x-auto border-t border-white/[0.07]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/[0.08] text-slate-400">
                  <th className="py-2.5 pr-3.5 font-medium">Display Name</th>
                  <th className="py-2.5 px-3.5 font-medium">Aliases</th>
                  <th className="py-2.5 px-3.5 font-medium">Launch Command</th>
                  <th className="py-2.5 px-3.5 font-medium">Process Name</th>
                  <th className="py-2.5 pl-3.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {settings.allowed_apps.map((app) => (
                  <tr key={app.id} className="hover:bg-white/[0.03] transition-colors">
                    <td className="py-2.5 pr-3.5 font-medium text-white whitespace-nowrap">
                      {app.displayName}
                    </td>
                    <td className="py-2.5 px-3.5 text-slate-300 max-w-[260px]">
                      {app.aliases.join(', ')}
                    </td>
                    <td className="py-2.5 px-3.5 font-mono text-cyan-200 whitespace-nowrap">
                      {app.launchCommand}
                    </td>
                    <td className="py-2.5 px-3.5 font-mono text-slate-300 whitespace-nowrap">
                      {app.processName}
                    </td>
                    <td className="py-2.5 pl-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleStartEditApp(app)}
                          aria-label={`Edit ${app.displayName}`}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-white/[0.07] hover:text-white transition-colors cursor-pointer"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveApp(app.id)}
                          aria-label={`Revoke ${app.displayName}`}
                          className="rounded-md p-1.5 text-slate-400 hover:bg-rose-500/15 hover:text-rose-300 transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form
            onSubmit={handleSaveApp}
            className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5 items-end border-t border-white/[0.07] pt-4"
          >
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Display Name</label>
              <input
                type="text"
                value={appNameInput}
                onChange={(e) => setAppNameInput(e.target.value)}
                placeholder="e.g. Discord"
                className="w-full rounded-lg border border-white/[0.1] bg-black/60 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                Aliases (comma-separated)
              </label>
              <input
                type="text"
                value={appAliasesInput}
                onChange={(e) => setAppAliasesInput(e.target.value)}
                placeholder="discord, voice chat"
                className="w-full rounded-lg border border-white/[0.1] bg-black/60 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Launch Command</label>
              <input
                type="text"
                value={appCommandInput}
                onChange={(e) => setAppCommandInput(e.target.value)}
                placeholder="e.g. discord"
                className="w-full rounded-lg border border-white/[0.1] bg-black/60 px-3 py-2 text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1">Process Name</label>
              <input
                type="text"
                value={appProcessInput}
                onChange={(e) => setAppProcessInput(e.target.value)}
                placeholder="e.g. Discord.exe"
                className="w-full rounded-lg border border-white/[0.1] bg-black/60 px-3 py-2 text-xs font-mono text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="flex flex-1 h-9 items-center justify-center gap-1.5 rounded-lg bg-cyan-400 px-3 text-xs font-semibold text-slate-950 hover:bg-cyan-300 transition-colors cursor-pointer"
              >
                {editingAppId ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                <span>{editingAppId ? 'Update App' : 'Grant App'}</span>
              </button>
              {editingAppId && (
                <button
                  type="button"
                  onClick={resetAppForm}
                  aria-label="Cancel edit"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.1] text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {appFormError && (
              <p className="sm:col-span-2 lg:col-span-5 text-xs text-rose-300">{appFormError}</p>
            )}
          </form>
        </section>

        {/* Bottom 3-column Admin Settings: Approval Mode, Change Passcode, Agent Setup */}
        <div className="grid gap-5 lg:grid-cols-3">
          <section className="rounded-2xl border border-white/[0.08] bg-[#070B14]/95 p-5 space-y-3 shadow-lg shadow-black/45">
            <h2 className="text-sm font-semibold text-white">Approval Mode</h2>
            <div className="space-y-2">
              {APPROVAL_MODES.map((mode) => {
                const active = settings.approval_mode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => onUpdateSettings({ approval_mode: mode.id })}
                    className={`w-full rounded-xl border p-3 text-left transition-all cursor-pointer ${
                      active
                        ? 'border-cyan-400/45 bg-cyan-500/12 text-white'
                        : 'border-white/[0.06] bg-white/[0.02] text-slate-300 hover:bg-white/[0.05]'
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

          <ChangePasscodeCard
            currentPassInput={currentPassInput}
            setCurrentPassInput={setCurrentPassInput}
            newPassInput={newPassInput}
            setNewPassInput={setNewPassInput}
            confirmPassInput={confirmPassInput}
            setConfirmPassInput={setConfirmPassInput}
            passChangeMsg={passChangeMsg}
            setPassChangeMsg={setPassChangeMsg}
            passChangeLoading={passChangeLoading}
            setPassChangeLoading={setPassChangeLoading}
          />

          <section className="rounded-2xl border border-white/[0.08] bg-[#070B14]/95 p-5 space-y-3 shadow-lg shadow-black/45">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Agent Setup</h2>
              <button
                type="button"
                onClick={onRegenerateToken}
                className="text-xs text-cyan-300 hover:text-cyan-200 cursor-pointer"
              >
                Regenerate token
              </button>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Admin-only credentials for your local Windows agent. Never share this token.
            </p>

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

            <div className="space-y-2">
              <div>
                <div className="text-[11px] text-slate-400 mb-1">Poll URL (GET)</div>
                <div className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-black/45 px-2.5 py-1.5">
                  <span className="truncate font-mono text-[11px] text-slate-200">{pollUrl}</span>
                  <button
                    type="button"
                    onClick={() => handleCopyText('poll', pollUrl)}
                    aria-label="Copy Poll URL"
                    className="text-slate-400 hover:text-cyan-300 shrink-0 cursor-pointer"
                  >
                    {copiedKey === 'poll' ? (
                      <Check className="h-3.5 w-3.5 text-cyan-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <div className="text-[11px] text-slate-400 mb-1">Report URL (POST)</div>
                <div className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-black/45 px-2.5 py-1.5">
                  <span className="truncate font-mono text-[11px] text-slate-200">{reportUrl}</span>
                  <button
                    type="button"
                    onClick={() => handleCopyText('report', reportUrl)}
                    aria-label="Copy Report URL"
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
      </div>
    </div>
  );
}

interface ChangePasscodeCardProps {
  currentPassInput: string;
  setCurrentPassInput: (v: string) => void;
  newPassInput: string;
  setNewPassInput: (v: string) => void;
  confirmPassInput: string;
  setConfirmPassInput: (v: string) => void;
  passChangeMsg: { ok: boolean; text: string } | null;
  setPassChangeMsg: (v: { ok: boolean; text: string } | null) => void;
  passChangeLoading: boolean;
  setPassChangeLoading: (v: boolean) => void;
}

function ChangePasscodeCard({
  currentPassInput,
  setCurrentPassInput,
  newPassInput,
  setNewPassInput,
  confirmPassInput,
  setConfirmPassInput,
  passChangeMsg,
  setPassChangeMsg,
  passChangeLoading,
  setPassChangeLoading,
}: ChangePasscodeCardProps) {
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPassChangeMsg(null);
    if (newPassInput.length < 4) {
      setPassChangeMsg({ ok: false, text: 'New passcode must be at least 4 characters.' });
      return;
    }
    if (newPassInput !== confirmPassInput) {
      setPassChangeMsg({ ok: false, text: 'New passcodes do not match.' });
      return;
    }

    setPassChangeLoading(true);
    try {
      const event = new CustomEvent('jarvis-change-passcode', {
        detail: {
          currentPasscode: currentPassInput,
          newPasscode: newPassInput,
          resolve: (res: { ok: boolean; text: string }) => {
            setPassChangeLoading(false);
            setPassChangeMsg(res);
            if (res.ok) {
              setCurrentPassInput('');
              setNewPassInput('');
              setConfirmPassInput('');
            }
          },
        },
      });
      window.dispatchEvent(event);
    } catch {
      setPassChangeLoading(false);
      setPassChangeMsg({ ok: false, text: 'Unable to update passcode.' });
    }
  };

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#070B14]/95 p-5 space-y-3 shadow-lg shadow-black/45">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-cyan-400" />
        <h2 className="text-sm font-semibold text-white">Change Passcode</h2>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">
        Verify your current admin passcode before setting a new one. Stored as a salted SHA-256 hash.
      </p>

      <form onSubmit={handleSubmit} className="space-y-2.5">
        <input
          type="password"
          value={currentPassInput}
          onChange={(e) => setCurrentPassInput(e.target.value)}
          placeholder="Current passcode"
          required
          className="w-full rounded-xl border border-white/[0.1] bg-black/60 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
        />
        <input
          type="password"
          value={newPassInput}
          onChange={(e) => setNewPassInput(e.target.value)}
          placeholder="New passcode (min 4 chars)"
          required
          className="w-full rounded-xl border border-white/[0.1] bg-black/60 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
        />
        <input
          type="password"
          value={confirmPassInput}
          onChange={(e) => setConfirmPassInput(e.target.value)}
          placeholder="Confirm new passcode"
          required
          className="w-full rounded-xl border border-white/[0.1] bg-black/60 px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
        />

        {passChangeMsg && (
          <p className={`text-xs ${passChangeMsg.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
            {passChangeMsg.text}
          </p>
        )}

        <button
          type="submit"
          disabled={passChangeLoading}
          className="w-full h-9 rounded-xl bg-white/[0.08] text-xs font-medium text-white hover:bg-white/[0.14] disabled:opacity-45 transition-colors cursor-pointer"
        >
          {passChangeLoading ? 'Updating…' : 'Update Admin Passcode'}
        </button>
      </form>
    </section>
  );
}
