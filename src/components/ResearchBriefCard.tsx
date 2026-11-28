import { ExternalLink, Globe, Loader2 } from 'lucide-react';
import { JARVIS_THEMES } from '../lib/jarvisThemes';
import type { JarvisColorTheme, ResearchJob, ResearchSource } from '../types/jarvis';

interface ResearchBriefCardProps {
  job?: ResearchJob;
  sources?: ResearchSource[];
  colorTheme?: JarvisColorTheme;
}

function isSafeHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function ResearchBriefCard({
  job,
  sources,
  colorTheme = 'blue',
}: ResearchBriefCardProps) {
  const ui = JARVIS_THEMES[colorTheme].ui;
  const activeSources = (job?.sources && job.sources.length > 0 ? job.sources : sources) || [];
  const safeSources = activeSources.filter((s) => isSafeHttpUrl(s.url));

  const isRunning =
    job &&
    (job.status === 'queued' ||
      job.status === 'planning' ||
      job.status === 'searching' ||
      job.status === 'reading' ||
      job.status === 'synthesizing');

  if (!isRunning && safeSources.length === 0 && !job?.error) {
    return null;
  }

  return (
    <div className="mt-3 border-t border-white/[0.08] pt-3 space-y-2.5 text-left">
      {isRunning && job && (
        <div className="flex items-center justify-between gap-3 text-xs text-slate-300">
          <div className="flex items-center gap-2 min-w-0">
            <Loader2 className={`h-3.5 w-3.5 animate-spin shrink-0 ${ui.accentIcon}`} />
            <span className="truncate font-medium">{job.stepLabel}</span>
          </div>
          {job.subQueries.length > 0 && (
            <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
              {job.subQueries.length} queries
            </span>
          )}
        </div>
      )}

      {job?.error && (
        <p className="text-xs text-rose-300">
          Couldn&apos;t finish that research: {job.error}
        </p>
      )}

      {safeSources.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
            <Globe className="h-3 w-3 shrink-0" />
            <span>Sources consulted ({safeSources.length})</span>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {safeSources.slice(0, 6).map((src) => (
              <a
                key={src.url}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between gap-2 rounded-lg border border-white/[0.07] bg-black/35 px-2.5 py-1.5 text-xs text-slate-300 hover:border-white/[0.16] hover:text-white transition-colors"
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium text-slate-200 group-hover:text-white">
                    {src.title || src.domain}
                  </span>
                  <span className="ml-1.5 text-[11px] text-slate-500">{src.domain}</span>
                </span>
                <ExternalLink className="h-3 w-3 shrink-0 text-slate-500 group-hover:text-slate-200" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
