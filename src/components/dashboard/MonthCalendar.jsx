'use client';

import { useRouter } from 'next/navigation';
import { mealsFor } from '@/lib/calendar';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Status is carried by a tint plus a written label, never by color alone.
const STATUS = {
  submitted: {
    cell: 'border-success-border bg-success-soft text-success-text hover:brightness-[0.98]',
    number: 'text-success-text',
    label: 'Submitted',
  },
  missing: {
    cell: 'border-destructive-border bg-destructive-soft text-destructive-text hover:brightness-[0.98]',
    number: 'text-destructive-text',
    label: 'Missing',
  },
  today: {
    cell: 'border-primary bg-primary-soft text-primary-strong ring-1 ring-primary hover:brightness-[0.98] dark:text-primary',
    number: 'text-primary-strong dark:text-primary',
    label: 'Today',
  },
  upcoming: {
    cell: 'border-border bg-card text-foreground',
    number: 'text-foreground',
    label: '',
  },
  holiday: {
    cell: 'border-info-border bg-info-soft text-info-text',
    number: 'text-info-text',
    label: 'Holiday',
  },
  // Days the site does not serve still belong to the grid, so they carry the
  // faintest surface instead of a hole in the layout.
  none: {
    cell: 'border-transparent bg-surface-sunken/60 text-muted-foreground/50',
    number: 'text-muted-foreground/50',
    label: '',
  },
};

export default function MonthCalendar({ month, site, filter = 'all' }) {
  const router = useRouter();

  const open = (cell) => {
    if (!cell) return;
    const siteQuery = `site=${encodeURIComponent(site ?? '')}`;
    if (cell.status === 'submitted') router.push(`/counts/${cell.ymd}?${siteQuery}`);
    if (cell.status === 'missing' || cell.status === 'today') {
      router.push(`/meal-count?date=${cell.ymd}&${siteQuery}`);
    }
  };

  const cells = [
    ...Array.from({ length: month.leadingBlanks }, () => null),
    ...Array.from({ length: month.daysInMonth }, (_, i) => month.days[i + 1]),
  ];

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid grid-cols-7 border-b border-border bg-surface-sunken">
        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            className="py-2 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
          >
            <span className="md:hidden">{weekday.slice(0, 1)}</span>
            <span className="hidden md:inline">{weekday}</span>
          </div>
        ))}
      </div>

      <div
        key={`${month.year}-${month.monthNumber}`}
        className="stagger grid grid-cols-7 gap-1 p-1.5 md:gap-1.5 md:p-2"
        style={{ '--stagger-step': '8ms' }}
      >
        {cells.map((cell, index) => {
          if (!cell) {
            return <div key={`blank-${index}`} className="h-14 md:h-[104px]" style={{ '--stagger-i': index }} />;
          }

          const style = STATUS[cell.status] ?? STATUS.none;
          const clickable = ['submitted', 'missing', 'today'].includes(cell.status);
          const dimmed = filter !== 'all' && cell.status !== filter;
          const meals = mealsFor(cell.meals);
          const Tag = clickable ? 'button' : 'div';

          return (
            <Tag
              key={cell.ymd}
              {...(clickable
                ? {
                    type: 'button',
                    onClick: () => open(cell),
                    'aria-label': `${style.label || 'Day'} ${cell.day}`,
                  }
                : { 'aria-hidden': cell.status === 'none' ? 'true' : undefined })}
              style={{ '--stagger-i': index }}
              className={cn(
                'group relative flex h-14 flex-col items-center justify-center overflow-hidden rounded-md border text-left outline-none',
                'transition-[filter,opacity,transform] duration-fast ease-out',
                'md:h-[104px] md:items-stretch md:justify-start md:p-2',
                style.cell,
                clickable && 'cursor-pointer active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring',
                dimmed && 'opacity-25'
              )}
            >
              <span className="flex w-full items-center justify-between">
                <span className={cn('text-[13px] font-bold tabular-nums md:text-[15px]', style.number)}>
                  {cell.day}
                </span>
                {cell.status === 'submitted' && (
                  <span className="hidden h-1.5 w-1.5 rounded-full bg-success md:block" aria-hidden="true" />
                )}
                {cell.status === 'missing' && (
                  <span className="hidden h-1.5 w-1.5 rounded-full bg-destructive md:block" aria-hidden="true" />
                )}
              </span>

              {/* Phones: one dot under the number keeps the grid readable at 40px. */}
              {cell.status !== 'none' && cell.status !== 'upcoming' && (
                <span
                  className={cn(
                    'mt-1 h-1 w-1 rounded-full md:hidden',
                    cell.status === 'submitted' && 'bg-success',
                    cell.status === 'missing' && 'bg-destructive',
                    cell.status === 'today' && 'bg-primary',
                    cell.status === 'holiday' && 'bg-info'
                  )}
                  aria-hidden="true"
                />
              )}

              <span className="mt-auto hidden w-full flex-col gap-1 md:flex">
                {cell.holiday ? (
                  <span className="truncate text-[11px] font-semibold">{cell.holiday}</span>
                ) : meals.length > 0 && cell.status !== 'submitted' ? (
                  <span className="flex flex-wrap gap-1">
                    {meals.map((meal) => (
                      <span
                        key={meal}
                        className="rounded-xs bg-foreground/5 px-1 py-px text-[10px] font-semibold text-muted-foreground"
                      >
                        {meal}
                      </span>
                    ))}
                  </span>
                ) : null}
                {style.label && <span className="text-[10.5px] font-semibold">{style.label}</span>}
              </span>
            </Tag>
          );
        })}
      </div>
    </div>
  );
}

export function CalendarLegend({ className }) {
  const items = [
    { label: 'Submitted', className: 'border-success-border bg-success-soft' },
    { label: 'Missing', className: 'border-destructive-border bg-destructive-soft' },
    { label: 'Today', className: 'border-primary bg-primary-soft' },
    { label: 'Holiday', className: 'border-info-border bg-info-soft' },
    { label: 'No service', className: 'border-border bg-surface-sunken' },
  ];
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2', className)}>
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <span className={cn('h-3 w-3 rounded-xs border', item.className)} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
