'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { monthShortLabel } from '@/lib/calendar';
import { cn } from '@/lib/utils';

// Jumping to "March last year" takes one tap instead of twelve presses on the
// arrow. Months the site has no data for are visible but disabled, so the
// range of the program is legible at a glance.
export function MonthPicker({ months, value, onChange, label, compact = false }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(value.year);

  const years = useMemo(() => [...new Set(months.map((m) => m.year))].sort(), [months]);
  const enabled = useMemo(
    () => new Set(months.filter((m) => m.year === year).map((m) => m.month)),
    [months, year]
  );

  const yearIndex = years.indexOf(year);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setYear(value.year);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-1.5 rounded-md outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
            compact ? 'h-9 px-2.5' : 'px-2 py-1'
          )}
        >
          <span
            className={cn(
              'font-bold tracking-tight text-foreground',
              compact ? 'text-[15px]' : 'text-[22px] leading-tight md:text-[26px]'
            )}
          >
            {label}
          </span>
          <span
            className={cn(
              'font-medium tabular-nums text-muted-foreground',
              compact ? 'text-[14px]' : 'text-[15px] md:text-base'
            )}
          >
            {value.year}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-[17rem] p-3">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            aria-label="Previous year"
            disabled={yearIndex <= 0}
            onClick={() => setYear(years[yearIndex - 1])}
            className="flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-[13px] font-bold tabular-nums text-foreground">{year}</span>
          <button
            type="button"
            aria-label="Next year"
            disabled={yearIndex >= years.length - 1}
            onClick={() => setYear(years[yearIndex + 1])}
            className="flex h-8 w-8 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
            const isEnabled = enabled.has(month);
            const isCurrent = value.year === year && value.month === month;
            return (
              <button
                key={month}
                type="button"
                disabled={!isEnabled}
                onClick={() => {
                  onChange({ year, month });
                  setOpen(false);
                }}
                className={cn(
                  'h-9 rounded-sm text-[13px] font-semibold outline-none transition-colors',
                  'focus-visible:ring-2 focus-visible:ring-ring',
                  isCurrent
                    ? 'bg-primary text-primary-foreground'
                    : isEnabled
                      ? 'text-foreground hover:bg-accent'
                      : 'text-muted-foreground/40'
                )}
              >
                {monthShortLabel(month)}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
