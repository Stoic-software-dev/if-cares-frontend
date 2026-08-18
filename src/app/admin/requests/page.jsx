'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Check, Loader, MoreVertical, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import Protected from '@/components/auth/Protected';
import AppNavbar from '@/components/shell/AppNavbar';
import StatusBadge from '@/components/requests/StatusBadge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiGet, apiPatch } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'NEW', label: 'New' },
  { key: 'IN_PROGRESS', label: 'In progress' },
  { key: 'RESOLVED', label: 'Resolved' },
];

function detailLabel(request) {
  if (request.time) {
    const [h, m] = request.time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
  }
  if (request.amount != null) return `${request.amount} units`;
  return '—';
}

function dateLabel(isoString) {
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function shortSite(name) {
  return name.replace(/^\d{4}\/\d{4}\s+(TX|OK)?\s*/i, '');
}

function AdminRequestsScreen() {
  const [filter, setFilter] = useState('ALL');
  const [inbox, setInbox] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    apiGet('/api/requests')
      .then((res) => setInbox(res.data))
      .catch((err) => setError(err.message));
  };

  useEffect(load, []);

  const requests = useMemo(
    () => (inbox ? (filter === 'ALL' ? inbox : inbox.filter((r) => r.status === filter)) : []),
    [filter, inbox]
  );

  const newCount = (inbox ?? []).filter((r) => r.status === 'NEW').length;

  const setStatus = async (request, status, message) => {
    const previous = inbox;
    setInbox((prev) => prev.map((r) => (r.id === request.id ? { ...r, status } : r)));
    try {
      await apiPatch(`/api/requests/${request.id}`, { status });
      toast.success(message);
    } catch (err) {
      setInbox(previous);
      toast.error(err.message);
    }
  };

  return (
    <main className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-5 md:px-8 md:py-7">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Requests</h1>
        <p className="text-[13px] tabular-nums text-slate-500">
          {inbox ? `${inbox.length} total · ${newCount} new` : 'Loading…'}
        </p>
      </div>

      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              'h-9 rounded-full border px-3.5 text-[13px] font-medium',
              filter === f.key
                ? 'border-teal-200 bg-teal-50 font-semibold text-primary'
                : 'border-slate-300 bg-white text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-12">
          <AlertCircle className="h-6 w-6 text-red-600" />
          <span className="text-[13px] font-semibold text-red-700">{error}</span>
          <Button variant="outline" onClick={load} className="mt-1 h-9 rounded-lg border-slate-300 px-4 text-xs font-semibold text-slate-700">
            Try again
          </Button>
        </div>
      )}

      {!inbox && !error && <div className="h-72 rounded-xl bg-slate-200/40" />}

      {inbox && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <div className="min-w-[840px] tabular-nums">
            <div className="grid grid-cols-[190px_minmax(0,1fr)_120px_170px_90px_120px_52px] border-b border-slate-200 px-5 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Site</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Type</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Details</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Requested by</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Date</span>
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Status</span>
              <span />
            </div>
            {requests.map((request, index) => (
              <div
                key={request.id}
                className={cn(
                  'grid grid-cols-[190px_minmax(0,1fr)_120px_170px_90px_120px_52px] items-center px-5 py-3 transition-colors hover:bg-slate-50/70',
                  index < requests.length - 1 && 'border-b border-slate-100'
                )}
              >
                <span className="truncate pr-3 text-[13px] font-semibold text-slate-900" title={request.site}>
                  {shortSite(request.site)}
                </span>
                <span className="truncate pr-3 text-[13px] text-slate-700">{request.type}</span>
                <span className="text-[13px] text-slate-500">{detailLabel(request)}</span>
                <span className="truncate pr-3 text-[13px] text-slate-500">{request.requestedBy}</span>
                <span className="text-[13px] text-slate-500">{dateLabel(request.createdAt)}</span>
                <StatusBadge status={request.status} />
                <span className="flex justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Row actions"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                      >
                        <MoreVertical className="h-[15px] w-[15px]" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {request.status === 'NEW' && (
                        <DropdownMenuItem
                          onClick={() => setStatus(request, 'IN_PROGRESS', `${request.type} marked as in progress`)}
                          className="gap-2 text-[13px]"
                        >
                          <Loader className="h-4 w-4 text-amber-600" />
                          Mark as in progress
                        </DropdownMenuItem>
                      )}
                      {request.status !== 'RESOLVED' && (
                        <DropdownMenuItem
                          onClick={() => setStatus(request, 'RESOLVED', `${request.type} resolved`)}
                          className="gap-2 text-[13px]"
                        >
                          <Check className="h-4 w-4 text-emerald-600" />
                          Mark as resolved
                        </DropdownMenuItem>
                      )}
                      {request.status === 'RESOLVED' && (
                        <DropdownMenuItem
                          onClick={() => setStatus(request, 'NEW', `${request.type} reopened`)}
                          className="gap-2 text-[13px]"
                        >
                          <RotateCcw className="h-4 w-4 text-slate-500" />
                          Reopen
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </span>
              </div>
            ))}
            {requests.length === 0 && (
              <div className="flex flex-col items-center gap-1 px-5 py-12">
                <span className="text-[13px] font-semibold text-slate-700">Nothing here</span>
                <span className="text-xs text-slate-400">No requests match this filter.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

export default function AdminRequestsPage() {
  return (
    <Protected adminOnly>
      <div className="min-h-screen bg-background">
        <AppNavbar active="Inbox" />
        <AdminRequestsScreen />
      </div>
    </Protected>
  );
}
