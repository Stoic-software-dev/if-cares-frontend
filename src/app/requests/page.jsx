'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Send } from 'lucide-react';
import { toast } from 'sonner';
import { assignedSiteNames, useAuth } from '@/components/auth/AuthProvider';
import Protected from '@/components/auth/Protected';
import AppNavbar from '@/components/shell/AppNavbar';
import StatusBadge from '@/components/requests/StatusBadge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { apiGet, apiPost } from '@/lib/api-client';
import { cn } from '@/lib/utils';

// The eight request types of the current app, verbatim.
const REQUEST_TYPES = [
  'Sporks',
  'Meal Increase',
  'Meal Decrease',
  'Change approved meal service time',
  'Condiments',
  'Special Meals',
  'Dietary Restrictions',
  'Amount of milk on hand',
];

const TYPE_WITH_TIME = 'Change approved meal service time';

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

function RequestsScreen() {
  const { user } = useAuth();
  const ownSites = assignedSiteNames(user);

  const [sites, setSites] = useState(ownSites ?? []);
  const [site, setSite] = useState(ownSites?.[0] ?? '');
  const [type, setType] = useState('');
  const [amount, setAmount] = useState('');
  const [time, setTime] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [requests, setRequests] = useState(null);
  const [listError, setListError] = useState('');

  useEffect(() => {
    if (!ownSites) {
      apiGet('/api/sites')
        .then((list) => {
          const names = list.map((s) => s.name);
          setSites(names);
          setSite((current) => current || names[0] || '');
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRequests = () => {
    setListError('');
    apiGet('/api/requests')
      .then((res) => setRequests(res.data))
      .catch((err) => setListError(err.message));
  };

  useEffect(loadRequests, []);

  const needsTime = type === TYPE_WITH_TIME;
  const needsAmount = type !== '' && !needsTime;
  const valid =
    site !== '' && type !== '' && (needsTime ? time !== '' : amount !== '' && Number(amount) > 0);

  const submit = async (event) => {
    event.preventDefault();
    if (!valid) {
      setAttempted(true);
      return;
    }
    setSubmitting(true);
    try {
      await apiPost('/api/requests', {
        requestType: type,
        selectedSite: site,
        ...(needsAmount ? { amount: Number(amount) } : {}),
        ...(needsTime ? { time } : {}),
      });
      toast.success('Request sent — the IF Cares team was notified');
      setType('');
      setAmount('');
      setTime('');
      setAttempted(false);
      loadRequests();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 pb-8 pt-5 md:max-w-screen-xl md:px-8 md:pt-7">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Requests</h1>
        <p className="text-[13px] text-slate-500">Ask the IF Cares team for supplies or changes for your site.</p>
      </div>

      <div className="flex flex-col gap-6 md:grid md:grid-cols-[420px_minmax(0,1fr)] md:items-start md:gap-8">
        <form
          onSubmit={submit}
          className="flex flex-col gap-4 rounded-[14px] border border-slate-200 bg-white p-4 md:sticky md:top-6 md:p-5"
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">New request</span>

          {sites.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="request-site" className="text-[13px] text-slate-700">Site</Label>
              <div className="relative">
                <select
                  id="request-site"
                  value={site}
                  onChange={(e) => setSite(e.target.value)}
                  className="h-12 w-full appearance-none rounded-[10px] border border-slate-300 bg-white px-3.5 pr-10 text-sm font-medium text-slate-900 outline-none transition-shadow focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
                >
                  {sites.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="request-type" className="text-[13px] text-slate-700">Request type</Label>
            <div className="relative">
              <select
                id="request-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className={cn(
                  'h-12 w-full appearance-none rounded-[10px] border bg-white px-3.5 pr-10 text-sm font-medium outline-none transition-shadow focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15',
                  type === '' ? 'text-slate-400' : 'text-slate-900',
                  attempted && type === '' ? 'border-[1.5px] border-red-600' : 'border-slate-300'
                )}
              >
                <option value="">Select a type…</option>
                {REQUEST_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            </div>
            {attempted && type === '' && (
              <span className="text-xs font-medium text-red-700">Please select a request type</span>
            )}
          </div>

          {needsAmount && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="request-amount" className="text-[13px] text-slate-700">Amount</Label>
              <input
                id="request-amount"
                type="number"
                min="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 10"
                className={cn(
                  'h-12 w-full rounded-[10px] border bg-white px-3.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 transition-shadow focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15',
                  attempted && (amount === '' || Number(amount) <= 0)
                    ? 'border-[1.5px] border-red-600'
                    : 'border-slate-300'
                )}
              />
            </div>
          )}

          {needsTime && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="request-time" className="text-[13px] text-slate-700">New service time</Label>
              <input
                id="request-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className={cn(
                  'h-12 w-full rounded-[10px] border bg-white px-3.5 text-sm tabular-nums text-slate-900 outline-none transition-shadow focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15',
                  attempted && time === '' ? 'border-[1.5px] border-red-600' : 'border-slate-300'
                )}
              />
            </div>
          )}

          <Button type="submit" disabled={submitting} className="h-12 rounded-[10px] text-sm font-semibold">
            <Send className="h-4 w-4" />
            {submitting ? 'Sending…' : 'Send request'}
          </Button>
        </form>

        <section className="flex flex-col gap-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
            My requests{requests ? ` · ${requests.length}` : ''}
          </span>

          {listError && (
            <div className="rounded-[14px] border border-red-200 bg-white px-4 py-8 text-center text-[13px] font-medium text-red-700">
              {listError}
            </div>
          )}

          {!requests && !listError && (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="h-14 rounded-[14px] bg-slate-200/50" />
              ))}
            </div>
          )}

          {requests && requests.length === 0 && (
            <div className="flex flex-col items-center gap-1 rounded-[14px] border border-dashed border-slate-300 bg-white px-4 py-12">
              <span className="text-[13px] font-semibold text-slate-700">No requests yet</span>
              <span className="text-xs text-slate-400">Requests you send will show up here with their status.</span>
            </div>
          )}

          {requests && requests.length > 0 && (
            <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white">
              <div className="hidden border-b border-slate-200 px-4 py-2.5 md:grid md:grid-cols-[minmax(0,1fr)_140px_90px_120px] md:px-5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Type</span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Details</span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Date</span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-400">Status</span>
              </div>
              {requests.map((request, index) => (
                <div
                  key={request.id}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 md:grid md:grid-cols-[minmax(0,1fr)_140px_90px_120px] md:px-5 md:py-3.5',
                    index < requests.length - 1 && 'border-b border-slate-100'
                  )}
                >
                  <div className="flex min-w-0 flex-1 flex-col md:flex-none">
                    <span className="truncate text-sm font-semibold text-slate-900">{request.type}</span>
                    <span className="text-xs text-slate-400 md:hidden">
                      {detailLabel(request)} · {dateLabel(request.createdAt)}
                    </span>
                  </div>
                  <span className="hidden text-[13px] text-slate-500 md:block">{detailLabel(request)}</span>
                  <span className="hidden text-[13px] tabular-nums text-slate-500 md:block">{dateLabel(request.createdAt)}</span>
                  <StatusBadge status={request.status} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default function RequestsPage() {
  return (
    <Protected>
      <div className="min-h-screen bg-background">
        <AppNavbar active="Requests" />
        <RequestsScreen />
      </div>
    </Protected>
  );
}
