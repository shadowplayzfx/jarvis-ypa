import { Fragment, useCallback, useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import type { AppLock, PCCommand, PCCommandStatus, PCRiskLevel } from '../types/jarvis';

export function HistoryPage() {
  const [commands, setCommands] = useState<PCCommand[]>([]);
  const [locks, setLocks] = useState<AppLock[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PCCommandStatus>('all');
  const [riskFilter, setRiskFilter] = useState<'all' | PCRiskLevel>('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/pc/history');
      if (!res.ok) return;
      const data = (await res.json()) as { commands?: PCCommand[]; locks?: AppLock[] };
      if (Array.isArray(data.commands)) setCommands(data.commands);
      if (Array.isArray(data.locks)) setLocks(data.locks);
    } catch {
      // Ignore network hiccup
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
    const id = window.setInterval(fetchHistory, 4000);
    return () => window.clearInterval(id);
  }, [fetchHistory]);

  const query = search.trim().toLowerCase();
  const filteredCommands = commands.filter((c) => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (riskFilter !== 'all' && c.risk_level !== riskFilter) return false;
    if (
      query &&
      !c.command_text.toLowerCase().includes(query) &&
      !c.action.toLowerCase().includes(query) &&
      !(c.result_message || '').toLowerCase().includes(query)
    ) {
      return false;
    }
    return true;
  });

  const handleExportCsv = () => {
    const header = ['Time', 'Command', 'Action', 'Risk', 'Status', 'Requested By', 'Result'];
    const rows = filteredCommands.map((c) => [
      c.created_at,
      `"${c.command_text.replace(/"/g, '""')}"`,
      c.action,
      c.risk_level,
      c.status,
      c.requested_by,
      `"${(c.result_message || '').replace(/"/g, '""')}"`,
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jarvis-pc-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusTextColor = (status: PCCommandStatus) => {
    switch (status) {
      case 'done':
        return 'text-emerald-300';
      case 'approved':
      case 'running':
        return 'text-cyan-300';
      case 'denied':
      case 'failed':
        return 'text-rose-300';
      case 'expired':
        return 'text-amber-300';
      default:
        return 'text-slate-300';
    }
  };

  return (
    <div className="jarvis-scroll flex-1 overflow-y-auto px-4 sm:px-6 py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-[#070B14]/95 p-5 shadow-lg shadow-black/45">
          <div>
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-5 w-5 text-cyan-400" />
              <h1 className="text-xl font-semibold text-white">PC Command History</h1>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-slate-400">
              Complete log of every allowed, denied, failed, and expired PC request and app lock.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchHistory}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.09] bg-white/[0.03] px-3 text-xs font-medium text-slate-200 hover:bg-white/[0.08] cursor-pointer"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredCommands.length === 0}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.09] bg-white/[0.04] px-3 text-xs font-medium text-slate-200 hover:bg-white/[0.08] disabled:opacity-40 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Command Audit Table */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#070B14]/95 p-5 shadow-lg shadow-black/45">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search commands, actions, results..."
                className="w-full rounded-xl border border-white/[0.09] bg-black/55 pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | PCCommandStatus)}
                aria-label="Filter by status"
                className="rounded-lg border border-white/[0.09] bg-black/55 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-400/60"
              >
                <option value="all">All Statuses</option>
                <option value="done">Done</option>
                <option value="approved">Approved</option>
                <option value="running">Running</option>
                <option value="pending_approval">Pending</option>
                <option value="denied">Denied</option>
                <option value="failed">Failed</option>
                <option value="expired">Expired</option>
              </select>

              <select
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value as 'all' | PCRiskLevel)}
                aria-label="Filter by risk"
                className="rounded-lg border border-white/[0.09] bg-black/55 px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-400/60"
              >
                <option value="all">All Risk Levels</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>

              <span className="font-mono text-xs text-slate-400 tabular-nums pl-1">
                {filteredCommands.length} entries
              </span>
            </div>
          </div>

          {loading ? (
            <div className="py-10 text-center text-xs text-slate-400">Loading command history…</div>
          ) : filteredCommands.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              No commands recorded for these filters yet.
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
                          <td className="py-2.5 pr-3 text-slate-200 max-w-[240px] truncate">
                            {cmd.command_text}
                          </td>
                          <td className="py-2.5 pr-3 font-mono text-cyan-200 whitespace-nowrap">
                            {cmd.action}
                          </td>
                          <td className="py-2.5 pr-3 capitalize font-medium text-xs whitespace-nowrap">
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
                          <td className={`py-2.5 pr-3 font-mono whitespace-nowrap ${statusTextColor(cmd.status)}`}>
                            {cmd.status}
                          </td>
                          <td className="py-2.5 text-slate-400 max-w-[260px] truncate">
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
                                <span>By: {cmd.requested_by}</span>
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

        {/* App Locks History */}
        <section className="rounded-2xl border border-white/[0.08] bg-[#070B14]/95 p-5 shadow-lg shadow-black/45">
          <div className="flex items-center gap-2 mb-3">
            <Lock className="h-4 w-4 text-amber-300" />
            <h2 className="text-sm font-semibold text-white">App Locks Log</h2>
            <span className="font-mono text-xs text-slate-400 tabular-nums">
              ({locks.length})
            </span>
          </div>

          {locks.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-500">
              No app locks have been created yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/[0.08] text-slate-400">
                    <th className="py-2 pr-3 font-medium">App</th>
                    <th className="py-2 pr-3 font-medium">Process</th>
                    <th className="py-2 pr-3 font-medium">Started</th>
                    <th className="py-2 pr-3 font-medium">Ends At</th>
                    <th className="py-2 pr-3 font-medium">Locked By</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.05]">
                  {locks.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2 pr-3 font-medium text-white whitespace-nowrap">{l.app}</td>
                      <td className="py-2 pr-3 font-mono text-slate-300 whitespace-nowrap">
                        {l.process_name}
                      </td>
                      <td className="py-2 pr-3 font-mono text-slate-400 tabular-nums whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(l.started_at).toLocaleString()}
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-mono text-slate-400 tabular-nums whitespace-nowrap">
                        {new Date(l.ends_at).toLocaleString()}
                      </td>
                      <td className="py-2 pr-3 text-slate-300">{l.locked_by}</td>
                      <td
                        className={`py-2 font-mono whitespace-nowrap ${
                          l.status === 'active'
                            ? 'text-amber-300'
                            : l.status === 'unlocked'
                            ? 'text-cyan-300'
                            : 'text-slate-400'
                        }`}
                      >
                        {l.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
