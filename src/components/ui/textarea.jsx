import * as React from 'react';

import { cn } from '@/lib/utils';

const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        'flex min-h-[92px] w-full rounded-md border border-input bg-card px-3 py-2.5 text-base text-foreground',
        'transition-[border-color,box-shadow] duration-fast ease-out',
        'placeholder:text-muted-foreground/70',
        'outline-none focus:border-primary focus:shadow-focus-primary',
        'disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70',
        'aria-[invalid=true]:border-destructive',
        'md:text-[13px]',
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = 'Textarea';

export { Textarea };
