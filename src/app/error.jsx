'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { reportError } from '@/lib/monitoring';

// Route-level boundary: the screen failed, the app did not. It says what to do
// next instead of leaving a blank page.
export default function ErrorBoundary({ error, reset }) {
  useEffect(() => {
    console.error(error);
    // A site that hits this screen rarely tells anyone. This is how an
    // administrator finds out.
    reportError(error, 'boundary');
  }, [error]);

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-destructive-soft text-destructive">
        <AlertTriangle className="h-6 w-6" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[22px] font-bold tracking-tight text-foreground">This screen stopped working</h1>
        <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
          Nothing you had already submitted is affected. Try again, and if it keeps happening, tell the
          administrator what you were doing.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>
          <RefreshCw />
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link href="/dashboard">Back to the dashboard</Link>
        </Button>
      </div>
    </main>
  );
}
