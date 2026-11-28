import { useState } from 'react';
import { Check, Copy, Trash2, Volume2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { JARVIS_THEMES } from '../lib/jarvisThemes';
import type {
  ChatMessage,
  JarvisColorTheme,
  PCCommand,
  PendingChatAction,
  ResearchJob,
} from '../types/jarvis';
import { ChatPasscodeActionCard } from './ChatPasscodeActionCard';
import { PCApprovalCard } from './PCApprovalCard';
import { ResearchBriefCard } from './ResearchBriefCard';

interface TranscriptDrawerProps {
  open: boolean;
  colorTheme?: JarvisColorTheme;
  messages: ChatMessage[];
  commandsById: Record<string, PCCommand>;
  researchJobsById?: Record<string, ResearchJob>;
  isAdmin: boolean;
  onDecideCommand: (
    id: string,
    decision: 'approve' | 'deny',
    opts?: { passcode?: string; alwaysAllowApp?: boolean }
  ) => Promise<string | null>;
  onConfirmChatAction: (
    messageId: string,
    action: PendingChatAction,
    passcode: string
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
              className="overflow-x-auto rounded-lg border border-white/[0.08] bg-[#03050A] p-3 font-mono text-xs text-cyan-100 leading-relaxed"
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
  colorTheme = 'blue',
  messages,
  commandsById,
  researchJobsById = {},
  isAdmin,
  onDecideCommand,
  onConfirmChatAction,
  onClose,
  onClear,
  onReplayMessage,
}: TranscriptDrawerProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const ui = JARVIS_THEMES[colorTheme].ui;

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
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 flex justify-end sm:items-stretch items-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            aria-hidden="true"
            className="fixed inset-0 bg-black/65"
          />

          <motion.aside
            aria-label="Conversation history"
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-50 flex w-full sm:w-[420px] lg:w-[460px] h-[80dvh] sm:h-full flex-col rounded-t-2xl sm:rounded-none border-t sm:border-t-0 sm:border-l border-white/[0.08] bg-[#070B14] shadow-2xl shadow-black/80"
          >
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4 shrink-0">
              <div>
                <h2 className="text-base font-semibold text-white">Conversation</h2>
                <p className="text-xs text-slate-400 tabular-nums mt-0.5">
                  {messages.length === 0
                    ? 'Quiet so far'
                    : `${messages.length} ${messages.length === 1 ? 'message' : 'messages'} in this session`}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={onClear}
                    aria-label="Clear conversation"
                    className="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-400 hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Clear</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close history"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-white transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="jarvis-scroll flex-1 overflow-y-auto px-5 py-5 space-y-5">
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center px-4">
                  <p className="text-sm font-medium text-slate-300">Nothing here yet</p>
                  <p className="text-xs text-slate-500 mt-1.5 max-w-[30ch] leading-relaxed">
                    Once we start talking, our messages, PC actions, and research briefs will live here.
                  </p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isUser = msg.role === 'user';
                  const cmdIds = msg.pcCommandIds?.length
                    ? msg.pcCommandIds
                    : msg.pcCommandId
                    ? [msg.pcCommandId]
                    : [];
                  const resolvedCmds = cmdIds
                    .map((id) => commandsById[id])
                    .filter((c): c is PCCommand => Boolean(c));
                  const researchJob = msg.researchJobId
                    ? researchJobsById[msg.researchJobId]
                    : undefined;

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                    >
                      <div className="mb-1.5 flex items-center gap-1.5 text-xs text-slate-400">
                        <span className={isUser ? `${ui.accentText} font-medium` : `${ui.accentTextSoft} font-medium`}>
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
                        className={`max-w-[92%] rounded-2xl px-4 py-3 shadow-md shadow-black/25 ${
                          isUser
                            ? ui.userBubble
                            : 'bg-white/[0.04] border border-white/[0.07] text-slate-200'
                        }`}
                      >
                        <FormattedContent content={msg.content} />

                        {resolvedCmds.map((cmd) => (
                          <PCApprovalCard
                            key={cmd.id}
                            command={cmd}
                            isAdmin={isAdmin}
                            onDecide={onDecideCommand}
                          />
                        ))}

                        {(researchJob || (msg.sources && msg.sources.length > 0)) && (
                          <ResearchBriefCard
                            job={researchJob}
                            sources={msg.sources}
                            colorTheme={colorTheme}
                          />
                        )}

                        {msg.pendingAction && (
                          <ChatPasscodeActionCard
                            messageId={msg.id}
                            pendingAction={msg.pendingAction}
                            onConfirmAction={onConfirmChatAction}
                          />
                        )}

                        {!isUser && (
                          <div className="mt-2.5 flex items-center gap-3 border-t border-white/[0.06] pt-2">
                            <button
                              type="button"
                              onClick={() => handleCopy(msg.id, msg.content)}
                              className={`flex items-center gap-1 rounded px-1 py-0.5 text-xs text-slate-400 hover:bg-white/[0.05] ${ui.copyHover} transition-colors cursor-pointer`}
                            >
                              {copiedId === msg.id ? (
                                <>
                                  <Check className={`h-3.5 w-3.5 ${ui.accentIcon}`} />
                                  <span className={ui.accentText}>Copied</span>
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
                              className={`flex items-center gap-1 rounded px-1 py-0.5 text-xs text-slate-400 hover:bg-white/[0.05] ${ui.copyHover} transition-colors cursor-pointer`}
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
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
