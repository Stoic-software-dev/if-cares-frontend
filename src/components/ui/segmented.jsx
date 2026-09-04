'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// Segmented control for small, mutually exclusive filters (status, scope).
// The active pill slides between options, which reads as "the same control
// moved" instead of "two different things blinked". Its position and width are
// measured from the real buttons, because options carry counts and are never
// the same width.
export function Segmented({ options, value, onChange, size = 'default', className, ariaLabel }) {
  const listRef = useRef(null);
  const [pill, setPill] = useState(null);

  const measure = useCallback(() => {
    const list = listRef.current;
    const active = list?.querySelector('[data-active="true"]');
    if (!list || !active) return;
    setPill({ left: active.offsetLeft, width: active.offsetWidth });
  }, []);

  useLayoutEffect(measure, [measure, value, options]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'relative inline-flex w-full items-center rounded-md border border-border bg-muted p-1 sm:w-auto',
        className
      )}
    >
      {pill && (
        <span
          aria-hidden="true"
          className="absolute inset-y-1 left-0 rounded-sm bg-card shadow-e1 transition-[transform,width] duration-200 ease-out"
          style={{ width: `${pill.width}px`, transform: `translateX(${pill.left}px)` }}
        />
      )}
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            data-active={active}
            aria-selected={active}
            onClick={() => onChange(option.value)}
            // `min-w-0` is what lets a flex item shrink at all: without it one
            // never goes below its own min-content, so three options carrying
            // count badges overflowed their container and put the requests inbox
            // into a sideways scroll at 320px.
            //
            // `flex-auto` rather than `flex-1` is the other half. `flex-1` is
            // basis-0, which hands every option an equal share whatever its
            // label - so with min-w-0 added, "Missing" and "Submitted" truncated
            // on a 1568px monitor with room to spare. Basis-auto starts each
            // option at its own width and only shrinks it under real pressure.
            className={cn(
              'relative z-10 flex min-w-0 flex-auto items-center justify-center gap-1.5 whitespace-nowrap rounded-sm font-semibold outline-none transition-colors duration-fast',
              'focus-visible:ring-2 focus-visible:ring-ring',
              size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3 text-[13px]',
              active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <span className="truncate">{option.label}</span>
            {option.count !== undefined && (
              <span
                className={cn(
                  'shrink-0 rounded-full px-1.5 py-px text-[10.5px] font-semibold tabular-nums',
                  active ? 'bg-primary-soft text-primary-strong dark:text-primary' : 'bg-border/70 text-muted-foreground'
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
