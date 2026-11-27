import { useState } from 'react';
import { Check, Copy, Trash2, Volume2, X } from 'lucide-react';
import type { ChatMessage, PCCommand } from '../types/jarvis';
import { PCApprovalCard } from './PCApprovalCard';

interface TranscriptDrawerProps {
  open: boolean;
  messages: ChatMessage[];
  commandsById: Record<string, PCCommand>;
  pinConfigured: boolean;
  onDecideCommand: (
    id: string,
    decision: 'approve' | 'deny',
    opts?: { pin?: string; alwaysAllowApp?: boolean }
  ) => Promise<string | null>;
  onClose: () => void;
  onClear: () => void;
  onReplayMessage: (content: string) => void;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function FormattedContent({ content }: { content: string }) {
  const segments = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2.5 text-sm leading-relaxed text-slate-200 break-words">
      {segments.map((segment, idx) => {
        if (segment.startsWith('```') && segment.endsWith('```')) {
          const inner = segment.slice(3, -3).replace(/^[a-zA-Z0-9_-]+\n/, '');
          return (
            <pre
              key={idx}
              className="overflow-x-auto rounded-xl border border-white/[0.08] bg-[#020408] p-3 font-mono text-xs text-cyan-100 leading-relaxed"
            >
              <code>{inner}</code>
            </pre>
          );
        }

        const paragraphs = segment.split(/\n{2,}/).filter((p) => p.trim().length > 0);
        return paragraphs.map((para, pIdx) => (
          <p key={`${idx}-${pIdx}`} className="whitespace-pre-wrap">
            {para.trim()}
          </p>
        ));
      })}
    </div>
  );
}

export function TranscriptDrawer({
  open,
  messages,
  commandsById,
  pinConfigured,
  onDecideCommand,
  onClose,
  onClear,
  onReplayMessage,
}: TranscriptDrawerProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!open) return null;

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end sm:items-stretch items-end">
      <div
        onClick={onClose}
        aria-hidden="true"
        className="fixed inset-0 bg-black/60 transition-opacity"
      />

      <aside
        aria-label="Conversation history"
        className="relative z-50 flex w-full sm:w-[410px] lg:w-[450px] h-[78dvh] sm:h-full flex-col rounded-t-2xl sm:rounded-none border-t sm:border-t-0 sm:border-l border-white/[0.1] bg-[#060A14] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">Session Transcript</h2>
            <p className="text-xs text-slate-400 tabular-nums mt-0.5">
              {messages.length === 0
                ? 'No messages yet'
                : `${messages.length} ${messages.length === 1 ? 'entry' : 'entries'} in session`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={onClear}
                aria-label="Clear conversation"
                className="flex h-9 items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 text-xs font-medium text-slate-300 hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close history"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-slate-300 hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="jarvis-scroll flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center px-4">
              <p className="text-sm font-medium text-slate-300">Your conversation appears here</p>
              <p className="text-xs text-slate-500 mt-1.5 max-w-[26ch] leading-relaxed">
                Tap Talk to Jarvis or hold Space to draft emails, plan tasks, or control your PC.
              </p>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              const pcCmd = msg.pcCommandId ? commandsById[msg.pcCommandId] : undefined;

              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs text-slate-400">
                    <span className={isUser ? 'text-cyan-300 font-medium' : 'text-sky-300 font-medium'}>
                      {isUser ? 'You' : 'JARVIS'}
                    </span>
                    {!isUser && msg.providerName && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{msg.providerName}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums text-slate-500">{formatTime(msg.timestamp)}</span>
                  </div>

                  <div
                    className={`max-w-[92%] rounded-2xl px-4 py-3 ${
                      isUser
                        ? 'bg-cyan-500/12 border border-cyan-400/22 text-slate-100'
                        : 'bg-white/[0.04] border border-white/[0.08] text-slate-200'
                    }`}
                  >
                    <FormattedContent content={msg.content} />

                    {pcCmd && (
                      <PCApprovalCard
                        command={pcCmd}
                        pinConfigured={pinConfigured}
                        onDecide={onDecideCommand}
                      />
                    )}

                    {!isUser && (
                      <div className="mt-2.5 flex items-center gap-3 border-t border-white/[0.06] pt-2">
                        <button
                          type="button"
                          onClick={() => handleCopy(msg.id, msg.content)}
                          className="flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
                        >
                          {copiedId === msg.id ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-cyan-400" />
                              <span className="text-cyan-300">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => onReplayMessage(msg.content)}
                          className="flex items-center gap-1 text-xs text-slate-400 hover:text-sky-300 transition-colors cursor-pointer"
                        >
                          <Volume2 className="h-3.5 w-3.5" />
                          <span>Speak</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}
