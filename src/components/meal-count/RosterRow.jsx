'use client';

import { memo } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

// One student, one row. Attendance is the anchor toggle; the meal toggles that
// follow are only the meals the site actually serves that day, so the row
// never asks for a mark the paper form does not have.
//
// Memoized: a roster runs to 250 rows and every tap rebuilds the marks map.
// Rows whose own marks did not change keep their previous render, which is what
// keeps the screen responsive on the tablets the sites actually use.
function RosterRowBase({ student, marks, meals, attention, onToggle }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2.5 px-3 py-3 transition-colors md:flex-row md:items-center md:gap-4 md:px-4',
        attention && 'bg-destructive-soft/60'
      )}
    >
      <div className="flex min-w-0 items-baseline gap-2 md:w-[22rem] md:shrink-0">
        <span className="w-6 shrink-0 text-[12px] font-semibold tabular-nums text-muted-foreground">
          {student.number}
        </span>
        <span className="truncate text-[14px] font-semibold text-foreground md:text-[13.5px]">
          {student.name}
        </span>
        {attention ? (
          <span className="ml-auto shrink-0 text-[11px] font-semibold text-destructive-text md:ml-3">
            Not marked
          </span>
        ) : (
          student.age !== '' &&
          student.age !== null && (
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground md:w-8 md:text-right">
              {/* The phone has no column header to read it from, so it keeps the
                  word; the table on wider screens gets the number alone, under
                  the heading, lined up with the ones above and below it. */}
              <span className="md:sr-only">Age </span>
              {student.age}
            </span>
          )
        )}
      </div>

      <div className="flex gap-1.5 md:ml-auto md:max-w-[34rem] md:flex-1">
        {meals.map((meal) => (
          <MarkToggle
            key={meal.key}
            label={meal.short}
            title={meal.label}
            // Whose row this is. The button says "Att" and carries aria-pressed,
            // which between them announce a state and not a person: reading down
            // a roster without seeing it gave "Attendance, pressed" seventy-five
            // times with nothing to tell one child from the next.
            ariaLabel={`${meal.label} — ${student.name}`}
            active={Boolean(marks[meal.key])}
            attention={meal.key === 'att' && attention}
            onClick={() => onToggle(student.id, meal.key)}
          />
        ))}
      </div>
    </div>
  );
}

export const RosterRow = memo(RosterRowBase);

export function MarkToggle({ label, title, ariaLabel, active, attention, onClick, className }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={ariaLabel ?? title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex h-11 flex-1 items-center justify-center gap-1 rounded-md text-[12.5px] font-semibold outline-none',
        'transition-[background-color,border-color,color,transform] duration-fast active:scale-[0.96]',
        'focus-visible:ring-2 focus-visible:ring-ring',
        active && 'bg-primary text-primary-foreground hover:bg-primary-strong',
        !active && !attention && 'border border-input bg-card text-muted-foreground hover:border-border-strong hover:text-foreground',
        !active && attention && 'border-[1.5px] border-dashed border-destructive bg-card text-destructive-text',
        className
      )}
    >
      {active && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
      {label}
    </button>
  );
}
