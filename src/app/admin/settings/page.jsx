'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, BellRing, Eye, Save } from 'lucide-react';
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
import { apiGet, apiPatch, apiPost } from '@/lib/api-client';

function hourLabel(hour) {
  const period = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 === 0 ? 12 : hour % 12}:00 ${period}`;
}

function RemindersScreen() {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [copyTo, setCopyTo] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  const load = () => {
    setError('');
    apiGet('/api/reminders')
      .then((res) => {
        setSettings(res.data);
        setCopyTo((res.data.copyTo ?? []).join(', '));
      })
      .catch((err) => setError(err.message));
  };

  useEffect(load, []);

  const save = async (patch) => {
    setSaving(true);
    try {
      const res = await apiPatch('/api/reminders', patch);
      setSettings({ ...res.data, mailReady: settings.mailReady });
      setCopyTo((res.data.copyTo ?? []).join(', '));
      toast.success('Reminders saved');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const runPreview = async () => {
    setPreviewing(true);
    try {
      const res = await apiPost('/api/reminders?preview=1', {});
      setPreview(res.data);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <AppShell>
      <div className="flex flex-col gap-5">
        <PageHeader
          title="Settings"
          subtitle="The daily nudge for counts that were not filed. Changing any of this takes effect immediately."
        />

        {error && <ErrorState title="Couldn't load the settings" message={error} onRetry={load} />}

        {!settings && !error && <Skeleton className="h-64 w-full rounded-lg" />}

        {settings && (
          <>
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

              <Field
                label="Always copy"
                htmlFor="reminder-copy"
                hint="Comma separated. These addresses are copied on every reminder."
              >
                <div className="flex gap-2">
                  <Input
                    id="reminder-copy"
                    value={copyTo}
                    onChange={(event) => setCopyTo(event.target.value)}
                    placeholder="name@ifcares.org, other@ifcares.org"
                  />
                  <Button variant="outline" onClick={() => save({ copyTo })} loading={saving} className="shrink-0">
                    {!saving && <Save />}
                    Save
                  </Button>
                </div>
              </Field>
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-col gap-0.5">
                  <span className="text-[14px] font-semibold text-foreground">See who would be written to</span>
                  <span className="text-[12.5px] text-muted-foreground">
                    Runs the same search the reminder does, without sending anything.
                  </span>
                </span>
                <Button variant="outline" onClick={runPreview} loading={previewing}>
                  {!previewing && <Eye />}
                  Preview
                </Button>
              </div>

              {preview && (
                <div className="flex flex-col gap-2 rounded-md bg-surface-sunken p-3.5">
                  <span className="text-[13px] font-medium text-foreground">
                    {preview.overdueDays} overdue {preview.overdueDays === 1 ? 'day' : 'days'} since{' '}
                    {preview.since}, {preview.recipients}{' '}
                    {preview.recipients === 1 ? 'person' : 'people'} would be written to.
                  </span>
                  {preview.sample?.length > 0 && (
                    <ul className="flex flex-col gap-1">
                      {preview.sample.map((item, index) => (
                        <li key={index} className="text-[12.5px] text-muted-foreground">
                          {item.to}, {item.site}, {item.date}
                        </li>
                      ))}
                    </ul>
                  )}
                  {preview.overdueDays === 0 && (
                    <span className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                      <BellRing className="h-3.5 w-3.5" />
                      Nothing is overdue right now.
                    </span>
                  )}
                </div>
              )}
            </div>

            <p className="text-[12px] leading-relaxed text-muted-foreground">
              The hour is enforced by the scheduler that calls the app, not by the app itself. It runs with a
              shared secret, so the reminder cannot be triggered from outside.
            </p>
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
