'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CalendarCheck, ClipboardList, FileText } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import BrandMark from '@/components/shell/BrandMark';
import { ThemeToggle } from '@/components/shell/ThemeToggle';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { apiPost } from '@/lib/api-client';

const HIGHLIGHTS = [
  { icon: CalendarCheck, text: 'Daily meal counts, one screen per service day' },
  { icon: ClipboardList, text: 'Site calendars, rosters and users in one place' },
  { icon: FileText, text: 'Daily, monthly and consolidated reports' },
];

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
    <main className="grid min-h-[100dvh] lg:grid-cols-[1.05fr_1fr]">
      {/* Brand side: what this app is, in three lines. Hidden on phones, where
          the form is the only thing that matters. */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex dark:bg-primary-soft dark:text-foreground">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              'linear-gradient(hsl(0 0% 100% / 0.6) 1px, transparent 1px), linear-gradient(90deg, hsl(0 0% 100% / 0.6) 1px, transparent 1px)',
            backgroundSize: '76px 76px',
          }}
        />
        <div className="relative rounded-lg bg-white/95 px-4 py-3 shadow-e1 w-fit">
          <BrandMark size="md" className="dark:brightness-100 dark:invert-0" />
        </div>

        <div className="relative flex max-w-md flex-col gap-6">
          <h2 className="text-[34px] font-bold leading-[1.15] tracking-tight">
            Every serving day, on the record.
          </h2>
          <ul className="flex flex-col gap-3.5">
            {HIGHLIGHTS.map((item) => (
              <li
                key={item.text}
                className="flex items-start gap-3 text-[14px] leading-relaxed text-primary-foreground/90 dark:text-muted-foreground"
              >
                <span className="mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-white/15 dark:bg-primary/15 dark:text-primary">
                  <item.icon className="h-4 w-4" />
                </span>
                {item.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-[12.5px] text-primary-foreground/70 dark:text-muted-foreground">
          IF Cares, Intrinsic Foundation. Regular Year program.
        </p>
      </aside>

      <div className="relative flex items-center justify-center px-6 py-10">
        <div className="absolute right-5 top-5">
          <ThemeToggle />
        </div>

        <div className="flex w-full max-w-[22rem] flex-col gap-6">
          <BrandMark size="lg" className="self-center lg:hidden" />

          <div className="flex flex-col gap-1.5">
            <h1 className="text-[26px] font-bold tracking-tight text-foreground">Sign in</h1>
            <p className="text-[13px] text-muted-foreground">Same email and password as always.</p>
          </div>

          <form onSubmit={signIn} className="flex flex-col gap-4" noValidate>
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.org"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={Boolean(error)}
                className="h-12"
              />
            </Field>

            <Field label="Password" htmlFor="password">
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
                aria-invalid={Boolean(error)}
                className="h-12"
              />
            </Field>

            {error && (
              <p role="alert" className="flex items-start gap-2 rounded-md bg-destructive-soft px-3 py-2.5">
                <AlertCircle className="mt-px h-4 w-4 shrink-0 text-destructive" />
                <span className="text-[13px] font-medium leading-snug text-destructive-text">{error}</span>
              </p>
            )}

            <Button type="submit" loading={submitting} size="touch" className="mt-1">
              {submitting ? 'Signing in' : 'Sign in'}
            </Button>

            <button
              type="button"
              onClick={() => setForgotOpen(true)}
              className="mx-auto rounded-sm px-2 py-2 text-[13px] font-semibold text-primary outline-none transition-colors hover:text-primary-strong focus-visible:ring-2 focus-visible:ring-ring dark:hover:text-primary/80"
            >
              Forgot your password?
            </button>
          </form>

          <p className="border-t border-border pt-4 text-[12px] text-muted-foreground">
            Trouble signing in? Contact your administrator.
          </p>
        </div>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>
              Ask your administrator for a password link. They can send you one from the Users screen, and it
              lets you set a new password right away.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </main>
  );
}
