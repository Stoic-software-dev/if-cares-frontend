'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import BrandMark from '@/components/shell/BrandMark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiPost } from '@/lib/api-client';

function ResetPasswordScreen() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('The password needs at least 8 characters.');
      return;
    }
    if (password !== confirm) {
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
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-8">
      <div className="flex w-full max-w-sm flex-col gap-5 md:max-w-md md:rounded-2xl md:border md:border-slate-200 md:bg-white md:p-10">
        <BrandMark size="lg" className="self-center" />

        {done ? (
          <div className="flex flex-col items-start gap-3">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            <h1 className="text-[24px] font-bold tracking-tight text-slate-900">Password updated</h1>
            <p className="text-sm text-slate-500">You can sign in with your new password now.</p>
            <Button onClick={() => router.push('/login')} className="mt-2 h-12 w-full rounded-[10px] text-[15px] font-semibold">
              Go to sign in
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-2 flex flex-col gap-1.5">
              <h1 className="text-[26px] font-bold tracking-tight text-slate-900">Set a new password</h1>
              <p className="text-sm text-slate-500">Choose the password you&apos;ll sign in with.</p>
            </div>

            <form onSubmit={submit} className="mt-1 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-password" className="text-[13px] text-slate-700">New password</Label>
                <Input
                  id="new-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className="h-12 rounded-[10px] border-slate-300 text-base"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm-password" className="text-[13px] text-slate-700">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  className="h-12 rounded-[10px] border-slate-300 text-base"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-[15px] w-[15px] shrink-0 text-red-600" />
                  <span className="text-[13px] font-medium leading-snug text-red-700">{error}</span>
                </div>
              )}

              <Button type="submit" disabled={submitting} className="mt-1 h-[50px] rounded-[10px] text-[15px] font-semibold">
                {submitting ? 'Saving…' : 'Save password'}
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordScreen />
    </Suspense>
  );
}
