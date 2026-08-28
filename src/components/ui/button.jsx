import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  [
    'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-fast ease-out',
    'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'active:scale-[0.985] disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-e1 hover:bg-primary-strong',
        destructive: 'bg-destructive text-destructive-foreground shadow-e1 hover:brightness-95',
        outline:
          'border border-input bg-card text-foreground hover:border-border-strong hover:bg-accent',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-accent',
        subtle: 'bg-primary-soft text-primary-strong hover:bg-primary-soft/70 dark:text-primary',
        ghost: 'text-muted-foreground hover:bg-accent hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        xs: 'h-8 px-2.5 text-xs [&_svg]:size-3.5',
        sm: 'h-9 px-3 text-[13px] [&_svg]:size-4',
        default: 'h-10 px-4 text-[13px] [&_svg]:size-4',
        lg: 'h-12 px-5 text-[15px] [&_svg]:size-[18px]',
        // Field screens: the primary action is a full-width thumb target.
        touch: 'h-[52px] w-full px-5 text-[15px] [&_svg]:size-[18px]',
        icon: 'h-10 w-10 [&_svg]:size-[18px]',
        'icon-sm': 'h-9 w-9 [&_svg]:size-4',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const Button = React.forwardRef(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    if (asChild) {
      return (
        <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Comp>
      );
    }
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 className="animate-spin" aria-hidden="true" />}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
