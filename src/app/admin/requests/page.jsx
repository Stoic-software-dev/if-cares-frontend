'use client';

import { useMemo, useState } from 'react';
import { Check, Loader, MoreVertical, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import AppNavbar from '@/components/shell/AppNavbar';
import { ADMIN_NAV } from '@/components/shell/nav';
import StatusBadge from '@/components/requests/StatusBadge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { MOCK_INBOX_REQUESTS } from '@/lib/mock-data';

const ADMIN_USER = { name: 'Dana', lastname: 'Whitfield' };

const FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'NEW', label: 'New' },
  { key: 'IN_PROGRESS', label: 'In progress' },
  { key: 'RESOLVED', label: 'Resolved' },
];

export default function AdminRequestsPage() {
  const [filter, setFilter] = useState('ALL');
  const [inbox, setInbox] = useState(MOCK_INBOX_REQUESTS);

  const requests = useMemo(
    () => (filter === 'ALL' ? inbox : inbox.filter((r) => r.status === filter)),
    [filter, inbox]
  );

  const newCount = inbox.filter((r) => r.status === 'NEW').length;

  const setStatus = (id, status, message) => {
    setInbox((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    toast.success(message);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppNavbar items={ADMIN_NAV} active="Requests" user={ADMIN_USER} />

      <main className="mx-auto flex max-w-screen-xl flex-col gap-4 px-4 py-5 md:px-8 md:py-7">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Requests</h1>
          <p className="text-[13px] tabular-nums text-slate-500">
            {inbox.length} total · {newCount} new
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

        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <div className="min-w-[840px] tabular-nums">
            <div className="grid grid-cols-[170px_minmax(0,1fr)_130px_130px_90px_120px_52px] border-b border-slate-200 px-5 py-2.5">
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
                  'grid grid-cols-[170px_minmax(0,1fr)_130px_130px_90px_120px_52px] items-center px-5 py-3 transition-colors hover:bg-slate-50/70',
                  index < requests.length - 1 && 'border-b border-slate-100'
                )}
              >
                <span className="truncate pr-3 text-[13px] font-semibold text-slate-900">{request.site}</span>
                <span className="truncate pr-3 text-[13px] text-slate-700">{request.type}</span>
                <span className="text-[13px] text-slate-500">{request.detail}</span>
                <span className="text-[13px] text-slate-500">{request.by}</span>
                <span className="text-[13px] text-slate-500">{request.date}</span>
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
                          onClick={() => setStatus(request.id, 'IN_PROGRESS', `${request.type} marked as in progress`)}
                          className="gap-2 text-[13px]"
                        >
                          <Loader className="h-4 w-4 text-amber-600" />
                          Mark as in progress
                        </DropdownMenuItem>
                      )}
                      {request.status !== 'RESOLVED' && (
                        <DropdownMenuItem
                          onClick={() => setStatus(request.id, 'RESOLVED', `${request.type} resolved`)}
                          className="gap-2 text-[13px]"
                        >
                          <Check className="h-4 w-4 text-emerald-600" />
                          Mark as resolved
                        </DropdownMenuItem>
                      )}
                      {request.status === 'RESOLVED' && (
                        <DropdownMenuItem
                          onClick={() => setStatus(request.id, 'NEW', `${request.type} reopened`)}
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
      </main>
    </div>
  );
}
