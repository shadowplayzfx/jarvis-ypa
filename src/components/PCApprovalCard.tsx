import { useEffect, useState } from 'react';
import { Check, Lock, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import type { PCCommand } from '../types/jarvis';

interface PCApprovalCardProps {
  command: PCCommand;
  pinConfigured: boolean;
  onDecide: (
    id: string,
    decision: 'approve' | 'deny',
    opts?: { pin?: string; alwaysAllowApp?: boolean }
  ) => Promise<string | null>;
}

const EXPIRY_SECONDS = 60;

export function PCApprovalCard({
  command,
  pinConfigured,
  onDecide,
}: PCApprovalCardProps) {
  const [alwaysAllowApp, setAlwaysAllowApp] = useState(false);
  const [pin, setPin] = useState('');
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

  const handleDecision = async (decision: 'approve' | 'deny') => {
    setSubmitting(true);
    setActionError(null);
    const err = await onDecide(command.id, decision, {
      pin: pin.trim() || undefined,
      alwaysAllowApp,
    });
    setSubmitting(false);
    if (err) setActionError(err);
  };

  const canAlwaysAllow = command.action === 'open_app' || command.action === 'close_app';
  const appTarget = typeof command.params.name === 'string' ? command.params.name : '';

  const riskBadgeStyle =
    command.risk_level === 'high'
      ? 'text-rose-300 border-rose-500/35 bg-rose-500/12'
      : command.risk_level === 'medium'
      ? 'text-amber-300 border-amber-500/35 bg-amber-500/12'
      : 'text-cyan-300 border-cyan-500/35 bg-cyan-500/12';

  const statusLabel =
    command.status === 'pending_approval'
      ? 'Waiting for approval'
      : command.status === 'approved'
      ? 'Approved · Queued for PC'
      : command.status === 'running'
      ? 'Running on PC'
      : command.status === 'done'
      ? 'Completed'
      : command.status === 'failed'
      ? 'Failed'
      : command.status === 'expired'
      ? 'Expired'
      : 'Denied';

  return (
    <div className="mt-3 rounded-xl border border-white/[0.1] bg-[#060B16]/95 p-3.5 text-left">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {command.risk_level === 'high' ? (
            <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0" />
          ) : (
            <ShieldCheck className="h-4 w-4 text-cyan-400 shrink-0" />
          )}
          <span className="font-mono text-xs font-medium text-white">
            {command.action}
          </span>
          <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${riskBadgeStyle}`}>
            {command.risk_level.toUpperCase()} RISK
          </span>
        </div>

        <span className="font-mono text-[11px] text-slate-400 tabular-nums">
          {command.status === 'pending_approval' ? `${secondsLeft}s left` : statusLabel}
        </span>
      </div>

      {Object.keys(command.params).length > 0 && (
        <div className="mt-2 rounded-lg border border-white/[0.06] bg-black/50 px-3 py-2 font-mono text-xs text-cyan-100 overflow-x-auto">
          {JSON.stringify(command.params)}
        </div>
      )}

      {command.result_message && command.status !== 'pending_approval' && (
        <p className="mt-2 text-xs text-slate-300">{command.result_message}</p>
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

          {command.risk_level === 'high' && pinConfigured && (
            <div className="flex items-center gap-2">
              <Lock className="h-3.5 w-3.5 text-rose-300 shrink-0" />
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter High-Risk PIN"
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
              className="flex h-9 items-center gap-1.5 rounded-lg bg-cyan-500 px-3.5 text-xs font-semibold text-slate-950 hover:bg-cyan-400 disabled:opacity-40 transition-colors cursor-pointer"
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
              <span>Deny</span>
            </button>

            {command.risk_level !== 'high' && (
              <span className="ml-auto hidden sm:inline text-[11px] text-slate-500">
                Or say “Approve” / “Deny”
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
