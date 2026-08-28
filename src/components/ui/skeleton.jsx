import { cn } from '@/lib/utils';

// Placeholders take the shape of the content that replaces them, and shimmer
// rather than pulse so a slow network reads as "loading", not as "empty".
function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn('relative overflow-hidden rounded-md bg-muted', className)}
      aria-hidden="true"
      {...props}
    >
      <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-foreground/[0.06] to-transparent" />
    </div>
  );
}

export { Skeleton };
