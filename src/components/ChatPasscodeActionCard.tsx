import { useState } from 'react';
import type { FormEvent } from 'react';
import { Check, Lock, ShieldCheck, Unlock } from 'lucide-react';
import type { PendingChatAction } from '../types/jarvis';

interface ChatPasscodeActionCardProps {
  messageId: string;
  pendingAction: PendingChatAction;
  onConfirmAction: (
    messageId: string,
    action: PendingChatAction,
    passcode: string
  ) => Promise<string | null>;
}

export function ChatPasscodeActionCard({
  messageId,
  pendingAction,
  onConfirmAction,
}: ChatPasscodeActionCardProps) {
  const [passcode, setPasscode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (pendingAction.resolved) {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-200">
        <Check className="h-4 w-4 text-emerald-400 shrink-0" />
        <span>{pendingAction.statusText || 'Completed.'}</span>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!passcode) return;
    setSubmitting(true);
    setError(null);
    const err = await onConfirmAction(messageId, pendingAction, passcode);
    setSubmitting(false);
    if (err) {
      setError(err);
    } else {
      setPasscode('');
    }
  };

  const label =
    pendingAction.type === 'unlock_app'
      ? `Unlock ${pendingAction.appName} early`
      : pendingAction.type === 'grant_app'
      ? `Allow ${pendingAction.appName}`
      : `Remove ${pendingAction.appName} permission`;

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 rounded-xl border border-white/[0.1] bg-[#060B16]/95 p-3.5 text-left space-y-2.5"
    >
      <div className="flex items-center gap-2 text-xs font-medium text-white">
        {pendingAction.type === 'unlock_app' ? (
          <Unlock className="h-4 w-4 text-cyan-400 shrink-0" />
        ) : (
          <ShieldCheck className="h-4 w-4 text-cyan-400 shrink-0" />
        )}
        <span>{label}</span>
      </div>

      {pendingAction.type === 'grant_app' && (
        <div className="text-[11px] font-mono text-slate-400 flex flex-wrap gap-x-3 gap-y-1">
          <span>Command: {pendingAction.launchCommand}</span>
          <span>Process: {pendingAction.processName}</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Lock className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Enter admin passcode"
            required
            className="w-full rounded-lg border border-white/[0.12] bg-black/60 pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
          />
        </div>
        <button
          type="submit"
          disabled={submitting || !passcode}
          className="h-8 rounded-lg bg-cyan-400 px-3.5 text-xs font-semibold text-slate-950 hover:bg-cyan-300 disabled:opacity-45 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {submitting ? 'Checking…' : 'Confirm'}
        </button>
      </div>

      {error && <p className="text-xs text-rose-300">{error}</p>}
    </form>
  );
}
