'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// Every list, table and panel in the product uses these three states, so a
// slow network, an empty result and a failure always look deliberate.

export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-6 py-14 text-center animate-fade-in',
        className
      )}
    >
      {Icon && (
        <span className="mb-1 flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <p className="text-[14px] font-semibold text-foreground">{title}</p>
      {description && <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorState({ title = 'Something went wrong', message, onRetry, className }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 rounded-lg border border-destructive-border bg-destructive-soft px-6 py-12 text-center animate-fade-in',
        className
      )}
      role="alert"
    >
      <AlertTriangle className="h-6 w-6 text-destructive" />
      <p className="text-[14px] font-semibold text-destructive-text">{title}</p>
      {message && <p className="max-w-md text-[13px] leading-relaxed text-destructive-text/80">{message}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-3">
          <RefreshCw />
          Try again
        </Button>
      )}
    </div>
  );
}

// Rows of the same height as the real list rows, so nothing jumps on load.
export function ListSkeleton({ rows = 6, rowClassName = 'h-14', className }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className={rowClassName} />
      ))}
    </div>
  );
}
