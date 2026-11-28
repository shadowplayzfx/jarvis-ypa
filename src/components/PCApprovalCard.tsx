import { useEffect, useState } from 'react';
import { Check, Lock, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import type { PCCommand } from '../types/jarvis';

interface PCApprovalCardProps {
  command: PCCommand;
  isAdmin: boolean;
  onDecide: (
    id: string,
    decision: 'approve' | 'deny',
    opts?: { passcode?: string; alwaysAllowApp?: boolean }
  ) => Promise<string | null>;
}

const EXPIRY_SECONDS = 60;

function formatHumanActionTitle(command: PCCommand): string {
  const p = command.params;
  switch (command.action) {
    case 'open_app':
      return `Open ${String(p.name || 'app')}`;
    case 'close_app':
      return `Close ${String(p.name || 'app')}`;
    case 'open_url':
      return `Open link ${String(p.url || '')}`;
    case 'search_web':
      return `Search ${String(p.engine || 'Google')} for “${String(p.query || '')}”`;
    case 'media_control': {
      const k = String(p.key || 'playpause');
      return k === 'next'
        ? 'Skip to next track'
        : k === 'prev'
        ? 'Go to previous track'
        : 'Play or pause media';
    }
    case 'volume': {
      const dir = String(p.direction || 'up');
      if (dir === 'mute') return 'Toggle volume mute';
      return `Turn volume ${dir} (${Number(p.steps || 2)} steps)`;
    }
    case 'screenshot':
      return 'Save a Desktop screenshot';
    case 'lock_app':
      return `Lock ${String(p.app || 'app')}`;
    case 'unlock_app':
      return `Unlock ${String(p.app || 'app')}`;
  }
}

export function PCApprovalCard({
  command,
  isAdmin,
  onDecide,
}: PCApprovalCardProps) {
  const [alwaysAllowApp, setAlwaysAllowApp] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const elapsed = (Date.now() - Date.parse(command.created_at)) / 1000;
    return Math.max(0, Math.ceil(EXPIRY_SECONDS - elapsed));
  });

  useEffect(() => {
    if (command.status !== 'pending_approval') return;
    const tick = () => {
      const elapsed = (Date.now() - Date.parse(command.created_at)) / 1000;
      setSecondsLeft(Math.max(0, Math.ceil(EXPIRY_SECONDS - elapsed)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [command.created_at, command.status]);

  const requiresPasscode = command.risk_level === 'high' || !isAdmin;

  const handleDecision = async (decision: 'approve' | 'deny') => {
    if (decision === 'approve' && requiresPasscode && !passcode) {
      setActionError('Enter the admin passcode to approve this action.');
      return;
    }
    setSubmitting(true);
    setActionError(null);
    const err = await onDecide(command.id, decision, {
      passcode: passcode || undefined,
      alwaysAllowApp,
    });
    setSubmitting(false);
    if (err) {
      setActionError(err);
    } else {
      setPasscode('');
    }
  };

  const canAlwaysAllow = command.action === 'open_app' || command.action === 'close_app';
  const appTarget = typeof command.params.name === 'string' ? command.params.name : '';

  const riskText =
    command.risk_level === 'high'
      ? 'Passcode required'
      : command.risk_level === 'medium'
      ? 'Medium risk'
      : 'Low risk';

  const statusLabel =
    command.status === 'pending_approval'
      ? 'Waiting for approval'
      : command.status === 'approved'
      ? 'Sent to your PC'
      : command.status === 'running'
      ? 'Running on your PC'
      : command.status === 'done'
      ? 'Completed'
      : command.status === 'failed'
      ? 'Could not run'
      : command.status === 'expired'
      ? 'Timed out'
      : 'Declined';

  return (
    <div className="mt-3 rounded-xl border border-white/[0.09] bg-[#060B16]/90 p-3.5 text-left">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {command.risk_level === 'high' ? (
            <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0" />
          ) : (
            <ShieldCheck className="h-4 w-4 text-cyan-400 shrink-0" />
          )}
          <span className="text-xs sm:text-sm font-medium text-white truncate">
            {formatHumanActionTitle(command)}
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400 tabular-nums shrink-0">
          <span
            className={
              command.risk_level === 'high'
                ? 'text-rose-300'
                : command.risk_level === 'medium'
                ? 'text-amber-300'
                : 'text-slate-400'
            }
          >
            {riskText}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {command.status === 'pending_approval' ? `${secondsLeft}s left` : statusLabel}
          </span>
        </div>
      </div>

      {command.result_message && command.status !== 'pending_approval' && (
        <p className="mt-2 text-xs text-slate-300 leading-relaxed">{command.result_message}</p>
      )}

      {command.status === 'pending_approval' && (
        <div className="mt-3 space-y-2.5 border-t border-white/[0.06] pt-2.5">
          {canAlwaysAllow && appTarget && (
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={alwaysAllowApp}
                onChange={(e) => setAlwaysAllowApp(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-600 bg-slate-900 text-cyan-400 focus:ring-cyan-400"
              />
              <span>Always allow “{appTarget}”</span>
            </label>
          )}

          {requiresPasscode && (
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-rose-300 shrink-0" />
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder={
                  command.risk_level === 'high'
                    ? 'Enter admin passcode to confirm'
                    : 'Enter admin passcode'
                }
                className="w-full rounded-lg border border-rose-500/30 bg-black/60 px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-rose-400"
              />
            </div>
          )}

          {actionError && <p className="text-xs text-rose-300">{actionError}</p>}

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={submitting || secondsLeft === 0}
              onClick={() => handleDecision('approve')}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-cyan-400 px-3.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Approve</span>
            </button>

            <button
              type="button"
              disabled={submitting}
              onClick={() => handleDecision('deny')}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.12] bg-white/[0.04] px-3.5 text-xs font-medium text-slate-200 hover:bg-rose-500/15 hover:border-rose-400/40 hover:text-rose-200 disabled:opacity-40 transition-colors cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
              <span>Decline</span>
            </button>

            {command.risk_level !== 'high' && isAdmin && (
              <span className="ml-auto hidden sm:inline text-[11px] text-slate-500">
                Or say “Approve” / “Cancel”
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
