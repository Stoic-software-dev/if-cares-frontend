'use client';

import { cn } from '@/lib/utils';

// Determinate when we know the ratio (roster marked, upload). Indeterminate
// when we genuinely cannot know it (a report job on the server) - the bar
// never invents a percentage.
export function Progress({ value, indeterminate = false, className, barClassName, label }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(pct)}
      aria-label={label}
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-border', className)}
    >
      {indeterminate ? (
        <span className={cn('absolute inset-y-0 left-0 w-full origin-left animate-indeterminate rounded-full bg-primary', barClassName)} />
      ) : (
        <span
          className={cn('block h-full rounded-full bg-primary transition-[width] duration-slow ease-out', barClassName)}
          style={{ width: `${pct}%` }}
        />
      )}
    </div>
  );
}
