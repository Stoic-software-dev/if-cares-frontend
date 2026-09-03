'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, CircleCheck } from 'lucide-react';
import BrandMark from '@/components/shell/BrandMark';
import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { apiGet, apiPost } from '@/lib/api-client';
import { cn } from '@/lib/utils';

function ResetPasswordScreen() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  // null while asking. A dead link used to render the whole form and only admit
  // it after somebody had chosen a password and typed it twice.
  const [usable, setUsable] = useState(null);

  useEffect(() => {
    let alive = true;
    apiGet(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then((res) => alive && setUsable(res.data.usable))
      // If the check itself cannot run, show the form rather than a dead end:
      // saving still answers truthfully.
      .catch(() => alive && setUsable(true));
    return () => {
      alive = false;
    };
  }, [token]);

  const longEnough = password.length >= 8;
  const matches = confirm.length > 0 && password === confirm;

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!longEnough) {
      setError('The password needs at least 8 characters.');
      return;
    }
    if (!matches) {
      setError('The passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await apiPost('/api/auth/reset-password', { token, newPassword: password });
      setDone(true);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-[100dvh] items-center justify-center px-6 py-10">
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>

      <div className="flex w-full max-w-[22rem] flex-col gap-6">
        <BrandMark size="lg" className="self-center" />

        {usable === null ? (
          <p className="text-center text-[13px] text-muted-foreground">Checking this link…</p>
        ) : usable === false ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-5">
            <AlertCircle className="h-7 w-7 text-destructive" />
            <h1 className="text-[22px] font-bold tracking-tight text-foreground">This link cannot be used</h1>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              It has already been used, or it has expired. Ask for a new one from the sign in screen.
            </p>
            <Button onClick={() => router.push('/login')} size="touch" className="mt-2">
              Go to sign in
            </Button>
          </div>
        ) : done ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-success-border bg-success-soft p-5">
            <CircleCheck className="h-7 w-7 text-success" />
            <h1 className="text-[22px] font-bold tracking-tight text-success-text">Password updated</h1>
            <p className="text-[13px] leading-relaxed text-success-text/90">
              You can sign in with your new password now.
            </p>
            <Button onClick={() => router.push('/login')} size="touch" className="mt-2">
              Go to sign in
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <h1 className="text-[26px] font-bold tracking-tight text-foreground">Set a new password</h1>
              <p className="text-[13px] text-muted-foreground">Choose the password you will sign in with.</p>
            </div>

            <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
              <Field
                label="New password"
                htmlFor="new-password"
                hint="At least 8 characters."
              >
                <Input
                  id="new-password"
                  type="password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  className="h-12"
                />
              </Field>

              <Field
                label="Confirm password"
                htmlFor="confirm-password"
                error={confirm.length > 0 && !matches ? 'The passwords do not match.' : undefined}
              >
                <Input
                  id="confirm-password"
                  type="password"
                  required
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  autoComplete="new-password"
                  aria-invalid={confirm.length > 0 && !matches}
                  className="h-12"
                />
              </Field>

              <ul className="flex flex-col gap-1.5">
                <Requirement met={longEnough}>8 characters or more</Requirement>
                <Requirement met={matches}>Both fields match</Requirement>
              </ul>

              {error && (
                <p role="alert" className="flex items-start gap-2 rounded-md bg-destructive-soft px-3 py-2.5">
                  <AlertCircle className="mt-px h-4 w-4 shrink-0 text-destructive" />
                  <span className="text-[13px] font-medium leading-snug text-destructive-text">{error}</span>
                </p>
              )}

              <Button type="submit" loading={submitting} size="touch" className="mt-1">
                {submitting ? 'Saving' : 'Save password'}
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

function Requirement({ met, children }) {
  return (
    <li
      className={cn(
        'flex items-center gap-2 text-[12.5px] transition-colors',
        met ? 'text-success-text' : 'text-muted-foreground'
      )}
    >
      <CircleCheck className={cn('h-3.5 w-3.5', met ? 'text-success' : 'text-muted-foreground/50')} />
      {children}
    </li>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordScreen />
    </Suspense>
  );
}
