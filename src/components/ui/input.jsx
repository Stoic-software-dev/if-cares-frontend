import * as React from 'react';

import { cn } from '@/lib/utils';

// 16px text on phones so iOS never zooms the viewport on focus; 13px from md up.
const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        'flex h-11 w-full rounded-md border border-input bg-card px-3 text-base text-foreground',
        'transition-[border-color,box-shadow] duration-fast ease-out',
        'placeholder:text-muted-foreground/70',
        'outline-none focus:border-primary focus:shadow-focus-primary',
        'disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70',
        'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus:shadow-[0_0_0_3px_hsl(var(--destructive)/0.15)]',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
        'md:h-10 md:text-[13px]',
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = 'Input';

export { Input };
