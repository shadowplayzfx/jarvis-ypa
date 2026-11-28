import { CheckCircle2, Globe, Loader2, Monitor, Sparkles, X, XCircle } from 'lucide-react';
import { JARVIS_THEMES } from '../lib/jarvisThemes';
import type { ActiveTask, JarvisColorTheme } from '../types/jarvis';

interface ActiveTasksTrayProps {
  tasks: ActiveTask[];
  colorTheme: JarvisColorTheme;
  nowMs: number;
  onDismissTask: (id: string) => void;
}

export function ActiveTasksTray({
  tasks,
  colorTheme,
  nowMs,
  onDismissTask,
}: ActiveTasksTrayProps) {
  if (tasks.length === 0) return null;

  const ui = JARVIS_THEMES[colorTheme].ui;
  const visible = tasks.slice(0, 4);

  return (
    <div
      aria-label="Active tasks"
      className="w-full max-w-2xl mb-2 rounded-xl border border-white/[0.08] bg-[#070B14]/90 px-3.5 py-2 shadow-md shadow-black/40"
    >
      <div className="divide-y divide-white/[0.06]">
        {visible.map((task) => {
          const elapsedSec = Math.max(0, Math.floor((nowMs - task.startedAt) / 1000));
          return (
            <div
              key={task.id}
              className="flex items-center justify-between gap-3 py-1.5 first:pt-0 last:pb-0 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0">
                {task.status === 'running' ? (
                  <Loader2 className={`h-3.5 w-3.5 animate-spin shrink-0 ${ui.accentIcon}`} />
                ) : task.status === 'done' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                )}

                {task.kind === 'research' ? (
                  <Globe className="h-3 w-3 text-slate-400 shrink-0 hidden sm:inline" />
                ) : task.kind === 'pc' ? (
                  <Monitor className="h-3 w-3 text-slate-400 shrink-0 hidden sm:inline" />
                ) : (
                  <Sparkles className="h-3 w-3 text-slate-400 shrink-0 hidden sm:inline" />
                )}

                <span className="font-medium text-slate-200 truncate">{task.title}</span>
                <span className="text-slate-600 hidden sm:inline" aria-hidden="true">
                  ·
                </span>
                <span className="text-slate-400 truncate hidden sm:inline">{task.detail}</span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {task.status === 'running' && (
                  <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                    {elapsedSec}s
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onDismissTask(task.id)}
                  aria-label={`Dismiss ${task.title}`}
                  className="p-0.5 text-slate-500 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
