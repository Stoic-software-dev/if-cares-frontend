'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import BrandMark from '@/components/shell/BrandMark';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const signIn = (event) => {
    event.preventDefault();
    setSubmitting(true);
    // Mock build: no credentials are checked.
    router.push('/dashboard');
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 py-8">
      <div className="flex w-full max-w-sm flex-col gap-5">
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
              placeholder="••••••••"
              autoComplete="current-password"
              className="h-12 rounded-[10px] border-slate-300 text-base"
            />
          </div>

          <Button type="submit" disabled={submitting} className="mt-1 h-[50px] rounded-[10px] text-[15px] font-semibold">
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>

          <div className="flex justify-center">
            <a href="#" className="flex items-center px-2 py-3 text-sm font-medium text-primary">
              Forgot your password?
            </a>
          </div>
        </form>

        <div className="mt-2 border-t border-slate-200 pt-4">
          <p className="text-xs text-slate-400">Trouble signing in? Contact your administrator.</p>
        </div>
      </div>
    </main>
  );
}
