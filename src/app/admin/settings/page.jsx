'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Save } from 'lucide-react';
import { toast } from 'sonner';
import Protected from '@/components/auth/Protected';
import AppShell from '@/components/shell/AppShell';
import PageHeader from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { Field, NativeSelect } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { ErrorState } from '@/components/ui/states';
import { apiGet, apiPatch } from '@/lib/api-client';
import { cn } from '@/lib/utils';

function hourLabel(hour) {
  const period = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 === 0 ? 12 : hour % 12}:00 ${period}`;
}

function RemindersScreen() {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [requestTo, setRequestTo] = useState('');
  const [requestCc, setRequestCc] = useState('');

  const load = () => {
    setError('');
    apiGet('/api/reminders')
      .then((res) => {
        setSettings(res.data);
        setRequestTo((res.data.requestNotify?.to ?? []).join(', '));
        setRequestCc((res.data.requestNotify?.cc ?? []).join(', '));
      })
      .catch((err) => setError(err.message));
  };

  useEffect(load, []);

  const save = async (patch) => {
    setSaving(true);
    try {
      const res = await apiPatch('/api/reminders', patch);
      // PATCH answers with the settings only; the two read-only facts on this
      // screen come from GET and would blank out on every save otherwise.
      setSettings({
        ...res.data,
        mailReady: settings.mailReady,
        mailRedirectedTo: settings.mailRedirectedTo,
      });
      setRequestTo((res.data.requestNotify?.to ?? []).join(', '));
      setRequestCc((res.data.requestNotify?.cc ?? []).join(', '));
      toast.success('Saved');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        <PageHeader
          title="Reminder emails"
          subtitle="The daily nudge to sites that have not filed their count. Changes take effect immediately."
        />

        {error && <ErrorState title="Couldn't load the settings" message={error} onRetry={load} />}

        {!settings && !error && <Skeleton className="h-64 w-full rounded-lg" />}

        {settings && (
          <>
            {settings.mailRedirectedTo?.length > 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-warning-border bg-warning-soft p-4">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-semibold text-warning-text">
                    Every email is being redirected
                  </span>
                  <span className="text-[12.5px] leading-relaxed text-warning-text/90">
                    Nothing reaches the person it names. All of it goes to{' '}
                    {settings.mailRedirectedTo.join(', ')} instead, carrying a note saying who it was
                    for. That is deliberate until the app goes live: the database already holds real
                    people, so a test would otherwise write to them. Clearing MAIL_REDIRECT_TO turns
                    it off.
                  </span>
                </div>
              </div>
            )}

            {!settings.mailReady && (
              <div className="flex items-start gap-3 rounded-lg border border-warning-border bg-warning-soft p-4">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-semibold text-warning-text">
                    Email is not configured yet
                  </span>
                  <span className="text-[12.5px] leading-relaxed text-warning-text/90">
                    Reminders can be set up here, but nothing will be sent until the Gmail service account
                    and the sending mailbox are in place. Everything else in the app works without it.
                  </span>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 md:p-5">
              <label className="flex items-center justify-between gap-4">
                <span className="flex flex-col gap-0.5">
                  <span className="text-[14px] font-semibold text-foreground">Send the daily reminder</span>
                  <span className="text-[12.5px] text-muted-foreground">
                    Each site staff member hears only about their own sites.
                  </span>
                </span>
                <Switch
                  checked={settings.enabled}
                  disabled={saving}
                  onCheckedChange={(checked) => save({ enabled: checked })}
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Time of day" htmlFor="reminder-hour" hint="In the program's timezone.">
                  <NativeSelect
                    id="reminder-hour"
                    value={settings.hour}
                    onChange={(event) => save({ hour: Number(event.target.value) })}
                    disabled={saving}
                  >
                    {Array.from({ length: 24 }, (_, hour) => (
                      <option key={hour} value={hour}>
                        {hourLabel(hour)}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>

                <Field
                  label="Look back"
                  htmlFor="reminder-days"
                  hint="How many days of missing counts to chase."
                >
                  <NativeSelect
                    id="reminder-days"
                    value={settings.lookBackDays}
                    onChange={(event) => save({ lookBackDays: Number(event.target.value) })}
                    disabled={saving}
                  >
                    {[1, 2, 3, 5, 7, 14].map((days) => (
                      <option key={days} value={days}>
                        {days === 1 ? 'Yesterday only' : `${days} days`}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
              </div>

            </div>

            {/* 3.9: the notice that goes out when a site asks for something.
                It belongs next to the reminder because both answer the same
                question - who hears from this app without opening it. */}
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 md:p-5">
              <label className="flex items-center justify-between gap-4">
                <span className="flex flex-col gap-0.5">
                  <span className="text-[14px] font-semibold text-foreground">
                    Tell someone when a request comes in
                  </span>
                  <span className="text-[12.5px] text-muted-foreground">
                    The same notice the old app sent, the moment a site asks for something.
                  </span>
                </span>
                <Switch
                  checked={settings.requestNotify?.enabled ?? true}
                  disabled={saving}
                  onCheckedChange={(checked) =>
                    save({ requestNotify: { ...settings.requestNotify, enabled: checked } })
                  }
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="To" htmlFor="request-to" hint="Comma separated.">
                  <div className="flex gap-2">
                    <Input
                      id="request-to"
                      value={requestTo}
                      onChange={(event) => setRequestTo(event.target.value)}
                      placeholder="kenya@ifcares.org"
                    />
                  </div>
                </Field>
                <Field label="Copy to" htmlFor="request-cc" hint="Comma separated.">
                  <div className="flex gap-2">
                    <Input
                      id="request-cc"
                      value={requestCc}
                      onChange={(event) => setRequestCc(event.target.value)}
                      placeholder="marisela@ifcares.org"
                    />
                    <Button
                      variant="outline"
                      className="shrink-0"
                      loading={saving}
                      onClick={() =>
                        save({
                          requestNotify: { ...settings.requestNotify, to: requestTo, cc: requestCc },
                        })
                      }
                    >
                      {!saving && <Save />}
                      Save
                    </Button>
                  </div>
                </Field>
              </div>
            </div>

          </>
        )}
      </div>
    </AppShell>
  );
}

export default function RemindersPage() {
  return (
    <Protected adminOnly>
      <RemindersScreen />
    </Protected>
  );
}
