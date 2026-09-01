'use client';

import { useState } from 'react';
import { Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, NativeSelect } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { apiPost } from '@/lib/api-client';
import { REQUEST_TYPES, TYPE_WITH_TIME } from '@/lib/requests';
import { shortSiteName } from '@/lib/sites';
import { cn } from '@/lib/utils';

/**
 * The one place a request is composed. Staff see it beside their own list;
 * administrators reach it from the inbox, where the form used to be missing
 * entirely because their navigation goes straight to the inbox.
 */
export default function RequestForm({ sites = [], defaultSite = '', onSent, className, label }) {
  const [site, setSite] = useState(defaultSite || sites[0] || '');
  const [type, setType] = useState('');
  const [amount, setAmount] = useState('');
  const [time, setTime] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const needsTime = type === TYPE_WITH_TIME;
  const needsAmount = type !== '' && !needsTime;
  // The API takes an integer. Letting 2.5 through the client only to have the
  // server reject it with "Invalid input (amount)" helped nobody.
  const amountValid = amount !== '' && Number.isInteger(Number(amount)) && Number(amount) > 0;
  const valid = site !== '' && type !== '' && (needsTime ? time !== '' : amountValid);

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
      toast.success('Request sent to the IF Cares team');
      setType('');
      setAmount('');
      setTime('');
      setAttempted(false);
      onSent?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className={cn('flex flex-col gap-4', className)} noValidate>
      {label && (
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </span>
      )}

      {sites.length === 0 && (
        <p className="rounded-md bg-muted px-3 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
          No site is assigned to your account yet, so there is nothing to request for. An administrator
          assigns them.
        </p>
      )}

      {sites.length > 1 && (
        <Field label="Site" htmlFor="request-site">
          <NativeSelect
            id="request-site"
            value={site}
            onChange={(event) => setSite(event.target.value)}
            className="h-12"
          >
            {sites.map((name) => (
              <option key={name} value={name}>
                {shortSiteName(name)}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}

      <Field
        label="Request type"
        htmlFor="request-type"
        error={attempted && type === '' ? 'Pick what you need.' : undefined}
      >
        <NativeSelect
          id="request-type"
          value={type}
          onChange={(event) => setType(event.target.value)}
          aria-invalid={attempted && type === ''}
          className={cn('h-12', type === '' && 'text-muted-foreground')}
        >
          <option value="">Select a type</option>
          {REQUEST_TYPES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </NativeSelect>
      </Field>

      {needsAmount && (
        <Field
          label="Amount"
          htmlFor="request-amount"
          hint="How many units the site needs."
          error={attempted && !amountValid ? 'Enter a whole number above zero.' : undefined}
        >
          <Input
            id="request-amount"
            type="number"
            min="1"
            inputMode="numeric"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="10"
            aria-invalid={attempted && !amountValid}
            className="h-12"
          />
        </Field>
      )}

      {needsTime && (
        <Field
          label="New service time"
          htmlFor="request-time"
          error={attempted && time === '' ? 'Pick the new time.' : undefined}
        >
          <Input
            id="request-time"
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            aria-invalid={attempted && time === ''}
            className="h-12 tabular-nums"
          />
        </Field>
      )}

      <Button type="submit" loading={submitting} disabled={sites.length === 0} size="touch" className="mt-1">
        {!submitting && <Send />}
        {submitting ? 'Sending' : 'Send request'}
      </Button>
    </form>
  );
}
