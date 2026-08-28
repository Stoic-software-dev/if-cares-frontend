import * as React from 'react';
import { cva } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// Status is communicated by tint plus label, never by color alone.
const badgeVariants = cva(
  'inline-flex w-fit items-center gap-1.5 whitespace-nowrap border font-semibold [&_svg]:size-3 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        neutral: 'border-border bg-muted text-muted-foreground',
        brand: 'border-primary-border bg-primary-soft text-primary-strong dark:text-primary',
        success: 'border-success-border bg-success-soft text-success-text',
        warning: 'border-warning-border bg-warning-soft text-warning-text',
        danger: 'border-destructive-border bg-destructive-soft text-destructive-text',
        info: 'border-info-border bg-info-soft text-info-text',
        solid: 'border-transparent bg-primary text-primary-foreground',
        outline: 'border-border-strong bg-transparent text-foreground',
      },
      size: {
        sm: 'rounded-full px-2 py-0.5 text-[10.5px]',
        default: 'rounded-full px-2.5 py-0.5 text-[11px]',
        lg: 'rounded-full px-3 py-1 text-xs',
      },
    },
    defaultVariants: {
      variant: 'neutral',
      size: 'default',
    },
  }
);

function Badge({ className, variant, size, ...props }) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { Badge, badgeVariants };
