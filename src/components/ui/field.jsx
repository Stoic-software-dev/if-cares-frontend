'use client';

import * as React from 'react';
import { AlertCircle, ChevronDown } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// One shape for every form control: label above, control, hint or error below.
// Errors replace the hint so the block never changes height twice.
export function Field({ label, hint, error, required, htmlFor, className, children, ...props }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)} {...props}>
      {label && (
        <Label htmlFor={htmlFor} className="flex items-center gap-1.5">
          {label}
          {required && <span className="text-destructive-text">*</span>}
        </Label>
      )}
      {children}
      {error ? (
        <span className="flex items-start gap-1.5 text-xs font-medium text-destructive-text">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
          {error}
        </span>
      ) : hint ? (
        <span className="text-xs leading-relaxed text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  );
}

// Native select styled like the rest of the controls. Used where a Radix
// Select would be overkill (short, fixed option lists on touch devices, where
// the OS picker is faster than a custom listbox).
export const NativeSelect = React.forwardRef(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        'h-11 w-full appearance-none rounded-md border border-input bg-card px-3 pr-9 text-base font-medium text-foreground',
        'transition-[border-color,box-shadow] duration-fast ease-out outline-none',
        'focus:border-primary focus:shadow-focus-primary disabled:cursor-not-allowed disabled:opacity-60',
        'md:h-10 md:text-[13px]',
        className
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      aria-hidden="true"
      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
    />
  </div>
));
NativeSelect.displayName = 'NativeSelect';
