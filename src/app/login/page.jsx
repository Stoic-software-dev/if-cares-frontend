'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import BrandMark from '@/components/shell/BrandMark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiPost } from '@/lib/api-client';

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, setUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [loading, user, router]);

  const signIn = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await apiPost('/api/auth/login', { email: email.trim(), password });
      setUser(res.data);
      router.push('/dashboard');
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-8">
      <div className="flex w-full max-w-sm flex-col gap-5 md:max-w-md md:rounded-2xl md:border md:border-slate-200 md:bg-white md:p-10">
        <BrandMark size="lg" withProgram />

        <div className="mt-2 flex flex-col gap-1.5">
          <h1 className="text-[26px] font-bold tracking-tight text-slate-900">Sign in</h1>
          <p className="text-sm text-slate-500">Same email and password as always.</p>
        </div>

        <form onSubmit={signIn} className="mt-1 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" className="text-[13px] text-slate-700">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.org"
              autoComplete="email"
              className="h-12 rounded-[10px] border-slate-300 text-base"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password" className="text-[13px] text-slate-700">Password</Label>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
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
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => setForgotOpen(true)}
              className="flex items-center px-2 py-3 text-sm font-medium text-primary"
            >
              Forgot your password?
            </button>
          </div>
        </form>

        <div className="mt-2 border-t border-slate-200 pt-4">
          <p className="text-xs text-slate-400">Trouble signing in? Contact your administrator.</p>
        </div>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>
              Ask your administrator for a password link — they can send you one from the Users screen,
              and it lets you set a new password right away.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </main>
  );
}
