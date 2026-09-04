'use client';

import { useMemo, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, NativeSelect } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { WEEKDAY_KEYS } from '@/lib/site-calendar';

const WEEKDAY_LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };
const MEALS = [
  { key: 'brk', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'snk', label: 'Snack' },
  { key: 'sup', label: 'Supper' },
];

const EMPTY = { brk: false, lunch: false, snk: false, sup: false };

export const emptySite = {
  name: '',
  state: '',
  ceName: '',
  ceId: '',
  siteName: '',
  siteNumber: '',
  programStart: '',
  programEnd: '',
  reminderStart: '',
  reminderEnd: '',
  weeklyTemplate: {},
};

// How many days the cycle would produce, shown live: an admin should know they
// are about to create two hundred service days before they press the button.
function countDays({ programStart, programEnd, weeklyTemplate }) {
  if (!programStart || !programEnd || programStart > programEnd) return 0;
  const start = new Date(`${programStart}T00:00:00Z`);
  const end = new Date(`${programEnd}T00:00:00Z`);
  let total = 0;
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const key = WEEKDAY_KEYS[(cursor.getUTCDay() + 6) % 7];
    const meals = weeklyTemplate?.[key];
    if (meals && (meals.brk || meals.lunch || meals.snk || meals.sup)) total += 1;
  }
  return total;
}

/**
 * The one site form. Creating uses every field; editing an existing site keeps
 * the same shape so there is nothing to learn twice.
 */
export default function SiteForm({ value, onChange, attempted, mode = 'create', states = [] }) {
  const [showSchedule, setShowSchedule] = useState(mode === 'create');

  const set = (patch) => onChange({ ...value, ...patch });

  const toggleMeal = (day, meal) => {
    const current = value.weeklyTemplate?.[day] ?? EMPTY;
    const next = { ...current, [meal]: !current[meal] };
    const template = { ...value.weeklyTemplate };
    if (!next.brk && !next.lunch && !next.snk && !next.sup) delete template[day];
    else template[day] = next;
    set({ weeklyTemplate: template });
  };

  const applyToWeekdays = () => {
    // The overwhelmingly common shape: Monday to Friday, same meals.
    const source = WEEKDAY_KEYS.map((key) => value.weeklyTemplate?.[key]).find(
      (meals) => meals && (meals.brk || meals.lunch || meals.snk || meals.sup)
    ) ?? { ...EMPTY, lunch: true };
    const template = {};
    for (const key of ['mon', 'tue', 'wed', 'thu', 'fri']) template[key] = { ...source };
    set({ weeklyTemplate: template });
  };

  const generated = useMemo(() => countDays(value), [value]);
  const nameError = attempted && value.name.trim().length < 3 ? 'The full site name is required.' : undefined;
  // Only enforced on create: a site already missing it can still be edited for
  // everything else without the save being blocked on an unrelated fix, but a
  // new site cannot be born into the exact gap that caused a claim to drop 7
  // real sites without anyone noticing.
  const stateError =
    attempted && mode === 'create' && !(value.state ?? '').trim()
      ? 'Pick the state this site files under.'
      : undefined;
  const rangeError =
    attempted && value.programStart && value.programEnd && value.programStart > value.programEnd
      ? 'The program ends before it starts.'
      : undefined;
  const reminderRangeError =
    attempted && value.reminderStart && value.reminderEnd && value.reminderStart > value.reminderEnd
      ? 'The reminder window ends before it starts.'
      : undefined;

  return (
    <div className="flex flex-col gap-4">
      <Field
        label="Full site name"
        htmlFor="site-name"
        hint="Exactly as it should read everywhere, including the school year prefix."
        error={nameError}
      >
        <Input
          id="site-name"
          value={value.name}
          onChange={(event) => set({ name: event.target.value })}
          placeholder="2025/2026 TX COD EXAMPLE REC CENTER"
          aria-invalid={Boolean(nameError)}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="State" htmlFor="site-state" hint="Drives the consolidated reports." error={stateError}>
          <NativeSelect
            id="site-state"
            value={value.state ?? ''}
            onChange={(event) => set({ state: event.target.value })}
            aria-invalid={Boolean(stateError)}
          >
            <option value="">No state</option>
            {/* A site already filed under a state that has since left the list
                still has to show its own value, or opening it to change
                something else would silently move it to another claim. */}
            {[...new Set([...(states ?? []), value.state].filter(Boolean))].sort().map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Site number" htmlFor="site-number">
          <Input
            id="site-number"
            value={value.siteNumber}
            onChange={(event) => set({ siteNumber: event.target.value })}
            placeholder="Optional"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Short name" htmlFor="site-short" hint="How it reads on screens where space is tight.">
          <Input
            id="site-short"
            value={value.siteName}
            onChange={(event) => set({ siteName: event.target.value })}
            placeholder="Optional"
          />
        </Field>
        <Field label="Sponsor" htmlFor="site-ce">
          <Input
            id="site-ce"
            value={value.ceName}
            onChange={(event) => set({ ceName: event.target.value })}
            placeholder="Optional"
          />
        </Field>
      </div>

      <div className="rounded-lg border border-border bg-surface-sunken p-4">
        <button
          type="button"
          onClick={() => setShowSchedule((open) => !open)}
          className="flex w-full items-center justify-between gap-3 text-left"
          aria-expanded={showSchedule}
        >
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] font-semibold text-foreground">Program cycle and weekly meals</span>
            <span className="text-[12px] text-muted-foreground">
              {generated > 0
                ? `${generated} service ${generated === 1 ? 'day' : 'days'} will be created`
                : 'Set the dates and which meals each weekday serves'}
            </span>
          </span>
          <CalendarRange className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>

        {showSchedule && (
          <div className="mt-4 flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Program starts" htmlFor="site-start">
                <Input
                  id="site-start"
                  type="date"
                  value={value.programStart}
                  onChange={(event) => set({ programStart: event.target.value })}
                />
              </Field>
              <Field label="Program ends" htmlFor="site-end" error={rangeError}>
                <Input
                  id="site-end"
                  type="date"
                  value={value.programEnd}
                  onChange={(event) => set({ programEnd: event.target.value })}
                  aria-invalid={Boolean(rangeError)}
                />
              </Field>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Meals by weekday
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={applyToWeekdays}>
                  Copy to weekdays
                </Button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[26rem] border-separate border-spacing-0 text-[12.5px]">
                  <thead>
                    <tr>
                      <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">Day</th>
                      {MEALS.map((meal) => (
                        <th key={meal.key} className="px-2 py-1.5 text-center font-semibold text-muted-foreground">
                          {meal.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {WEEKDAY_KEYS.map((day) => {
                      const meals = value.weeklyTemplate?.[day] ?? EMPTY;
                      const serves = meals.brk || meals.lunch || meals.snk || meals.sup;
                      return (
                        <tr key={day}>
                          <td
                            className={cn(
                              'px-2 py-1.5 font-medium',
                              serves ? 'text-foreground' : 'text-muted-foreground'
                            )}
                          >
                            {WEEKDAY_LABELS[day]}
                          </td>
                          {MEALS.map((meal) => (
                            <td key={meal.key} className="px-2 py-1.5 text-center">
                              <Checkbox
                                checked={Boolean(meals[meal.key])}
                                onCheckedChange={() => toggleMeal(day, meal.key)}
                                aria-label={`${WEEKDAY_LABELS[day]}, ${meal.label}`}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {mode === 'edit' && (
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  Changing this does not rewrite the calendar on its own. Use Generate missing days to add
                  what the cycle implies; days that already have a count are never touched.
                </p>
              )}
            </div>

            {/* Separate from the program cycle on purpose: a site can serve all
                year and only be chased for part of it. Both empty is the common
                case and means always. */}
            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Reminder window
              </span>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Chase from" htmlFor="site-reminder-start">
                  <Input
                    id="site-reminder-start"
                    type="date"
                    value={value.reminderStart ?? ''}
                    onChange={(event) => set({ reminderStart: event.target.value })}
                  />
                </Field>
                <Field label="Chase until" htmlFor="site-reminder-end" error={reminderRangeError}>
                  <Input
                    id="site-reminder-end"
                    type="date"
                    value={value.reminderEnd ?? ''}
                    onChange={(event) => set({ reminderEnd: event.target.value })}
                    aria-invalid={Boolean(reminderRangeError)}
                  />
                </Field>
              </div>
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                Outside these dates nobody at this site is emailed about a missing count. Leave both
                empty and the site is always chased, which is the safe default: an empty date is too
                quiet a way to switch off the reminders for a site whose meals stop after three
                missed days.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
