'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const DAY_STYLES = {
  submitted: 'bg-emerald-50 text-emerald-700 font-semibold',
  missing: 'bg-red-50 text-red-700 font-bold',
  today: 'border-2 border-primary text-primary font-bold',
  upcoming: 'text-slate-600 font-medium',
  none: 'text-slate-300 font-medium',
};

// A tap on a submitted day opens its count; a missing day or today opens the
// form. Other days do not navigate.
export default function MonthCalendar({ month }) {
  const router = useRouter();

  const openDay = (day, status) => {
    const iso = `${month.year}-09-${String(day).padStart(2, '0')}`;
    if (status === 'submitted') router.push(`/counts/${iso}`);
    if (status === 'missing' || status === 'today') router.push(`/meal-count?date=${iso}`);
  };

  const cells = [
    ...Array.from({ length: month.leadingBlanks }, () => null),
    ...Array.from({ length: month.daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white">
      <div className="grid grid-cols-7 border-b border-slate-200">
        {WEEKDAYS.map((weekday) => (
          <div
            key={weekday}
            className="py-2.5 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400"
          >
            {weekday}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 p-1.5 tabular-nums">
        {cells.map((day, index) => {
          if (day === null) return <div key={`blank-${index}`} className="h-12" />;
          const status = month.days[day] ?? 'none';
          const clickable = status === 'submitted' || status === 'missing' || status === 'today';
          return (
            <button
              key={day}
              type="button"
              disabled={!clickable}
              onClick={() => openDay(day, status)}
              className={cn(
                'flex h-12 items-center justify-center rounded-lg text-sm',
                DAY_STYLES[status],
                clickable && 'cursor-pointer'
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
