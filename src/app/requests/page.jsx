'use client';

import { useState } from 'react';
import { ChevronDown, Send } from 'lucide-react';
import { toast } from 'sonner';
import AppNavbar from '@/components/shell/AppNavbar';
import { STAFF_NAV } from '@/components/shell/nav';
import StatusBadge from '@/components/requests/StatusBadge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { MOCK_MY_REQUESTS, MOCK_USER, REQUEST_TYPES, REQUEST_TYPE_WITH_TIME } from '@/lib/mock-data';

export default function RequestsPage() {
  const [type, setType] = useState('');
  const [amount, setAmount] = useState('');
  const [time, setTime] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [requests, setRequests] = useState(MOCK_MY_REQUESTS);

  const needsTime = type === REQUEST_TYPE_WITH_TIME;
  const needsAmount = type !== '' && !needsTime;
  const valid = type !== '' && (needsTime ? time !== '' : amount !== '' && Number(amount) > 0);

  const submit = (event) => {
    event.preventDefault();
    if (!valid) {
      setAttempted(true);
      return;
    }
    const detail = needsTime
      ? new Date(`2026-01-01T${time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : `${amount} units`;
    setRequests((prev) => [
      { id: `local-${prev.length}`, type, detail, status: 'NEW', date: 'Sep 17' },
      ...prev,
    ]);
    toast.success('Request sent — the IF Cares team was notified');
    setType('');
    setAmount('');
    setTime('');
    setAttempted(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppNavbar items={STAFF_NAV} active="Requests" user={MOCK_USER} />

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
                    attempted && !needsTime && (amount === '' || Number(amount) <= 0)
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

            <Button type="submit" className="h-12 rounded-[10px] text-sm font-semibold">
              <Send className="h-4 w-4" />
              Send request
            </Button>
          </form>

          <section className="flex flex-col gap-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              My requests · {requests.length}
            </span>
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
                    <span className="text-xs text-slate-400 md:hidden">{request.detail} · {request.date}</span>
                  </div>
                  <span className="hidden text-[13px] text-slate-500 md:block">{request.detail}</span>
                  <span className="hidden text-[13px] tabular-nums text-slate-500 md:block">{request.date}</span>
                  <StatusBadge status={request.status} />
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
