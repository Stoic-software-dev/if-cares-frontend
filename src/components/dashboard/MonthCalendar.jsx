'use client';

import { useRouter } from 'next/navigation';
import { BadgeCheck, PencilLine } from 'lucide-react';
import { differsFromPattern, mealsFor } from '@/lib/calendar';
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

export default function MonthCalendar({ month, site, filter = 'all', mealPattern = null }) {
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
            {weekday}
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
            return <div key={`blank-${index}`} className="h-[68px] md:h-[116px] lg:h-[104px]" style={{ '--stagger-i': index }} />;
          }

          const style = STATUS[cell.status] ?? STATUS.none;
          const clickable = ['submitted', 'missing', 'today'].includes(cell.status);
          const dimmed = filter !== 'all' && cell.status !== filter;
          // Only the day that breaks the month's pattern names its meals. When
          // every cell says the same two words, the words stop being read.
          const meals = differsFromPattern(cell.meals, mealPattern) ? mealsFor(cell.meals) : [];
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
                'group relative flex h-[68px] flex-col items-center justify-center overflow-hidden rounded-md border text-left outline-none',
                'transition-[filter,opacity,transform] duration-fast ease-out',
                'md:h-[116px] md:items-stretch md:justify-start md:p-2 lg:h-[104px]',
                style.cell,
                clickable && 'cursor-pointer active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring',
                dimmed && 'opacity-25'
              )}
            >
              <span className="flex w-full items-center justify-between">
                <span className={cn('text-[15px] font-bold tabular-nums md:text-[15px]', style.number)}>
                  {cell.day}
                </span>
                {cell.status === 'submitted' &&
                  (cell.approved ? (
                    // An approved day is still a submitted day. The check is the
                    // difference, not a fifth colour that would read as a state
                    // of its own.
                    <BadgeCheck className="hidden h-3.5 w-3.5 text-success md:block" aria-label="Approved" />
                  ) : (
                    <span className="hidden h-1.5 w-1.5 rounded-full bg-success md:block" aria-hidden="true" />
                  ))}
                {cell.status === 'missing' && (
                  <span className="hidden h-1.5 w-1.5 rounded-full bg-destructive md:block" aria-hidden="true" />
                )}
              </span>

              {/* Phones: one dot under the number keeps the grid readable at 40px. */}
              {cell.status !== 'none' && cell.status !== 'upcoming' && (
                <span
                  className={cn(
                    'mt-1.5 h-1 w-4 rounded-full md:hidden',
                    cell.status === 'submitted' && 'bg-success',
                    cell.status === 'missing' && 'bg-destructive',
                    cell.status === 'today' && 'bg-primary',
                    cell.status === 'holiday' && 'bg-info'
                  )}
                  aria-hidden="true"
                />
              )}

              {/* A corrected day is still a submitted day, so it keeps the
                  colour and gains a mark. STOIC-2201 asks for it to be visible
                  here and not only inside the count: from the month view is
                  where someone notices that a day was touched after the fact. */}
              {cell.corrected && (
                <span
                  className="absolute left-1.5 top-1.5 hidden items-center gap-0.5 rounded-xs bg-warning-soft px-1 py-px text-[9.5px] font-bold uppercase tracking-wide text-warning-text md:inline-flex"
                  title="This count was corrected after it was submitted"
                >
                  <PencilLine className="h-2.5 w-2.5" strokeWidth={2.6} />
                  Corr
                </span>
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

const SWATCHES = {
  submitted: { label: 'Submitted', className: 'border-success-border bg-success-soft' },
  missing: { label: 'Missing', className: 'border-destructive-border bg-destructive-soft' },
  today: { label: 'Today', className: 'border-primary bg-primary-soft' },
  holiday: { label: 'Holiday', className: 'border-info-border bg-info-soft' },
};

/**
 * The key, for the month on screen only.
 *
 * It used to list all seven things a day can be, every month, whether or not
 * any day was one of them. A key to colours that are not there is vocabulary,
 * not help, and it was the widest row on the page.
 */
export function CalendarLegend({ month, className }) {
  const present = new Set();
  let approved = false;
  let corrected = false;
  for (const day of Object.values(month?.days ?? {})) {
    if (SWATCHES[day.status]) present.add(day.status);
    if (day.approved) approved = true;
    if (day.corrected) corrected = true;
  }

  // One colour on screen explains itself.
  if (present.size < 2 && !approved && !corrected) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2', className)}>
      {Object.entries(SWATCHES)
        .filter(([status]) => present.has(status))
        .map(([status, item]) => (
          <span key={status} className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <span className={cn('h-3 w-3 rounded-xs border', item.className)} />
            {item.label}
          </span>
        ))}
      {approved && (
        <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <BadgeCheck className="h-3.5 w-3.5 text-success" />
          Approved
        </span>
      )}
      {corrected && (
        <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <PencilLine className="h-3.5 w-3.5 text-warning-text" />
          Corrected
        </span>
      )}
    </div>
  );
}
