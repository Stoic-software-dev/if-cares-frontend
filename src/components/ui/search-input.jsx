'use client';

import * as React from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// Search field with a clear affordance. Used by every admin listing so the
// toolbar reads the same everywhere.
export const SearchInput = React.forwardRef(
  ({ value, onChange, placeholder = 'Search', className, ...props }, ref) => (
    <div
      className={cn(
        'group flex h-11 items-center gap-2 rounded-md border border-input bg-card px-3 md:h-10',
        'transition-[border-color,box-shadow] duration-fast ease-out',
        'focus-within:border-primary focus-within:shadow-focus-primary',
        className
      )}
    >
      <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full min-w-0 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/70 [&::-webkit-search-cancel-button]:hidden md:text-[13px]"
        {...props}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
);
SearchInput.displayName = 'SearchInput';
