'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const DAY_STYLES = {
  submitted: 'bg-emerald-50 text-emerald-700 font-semibold hover:bg-emerald-100',
  missing: 'bg-red-50 text-red-700 font-bold hover:bg-red-100',
  today: 'border-2 border-primary text-primary font-bold hover:bg-teal-50',
  upcoming: 'text-slate-600 font-medium',
  none: 'text-slate-300 font-medium',
};

const DAY_LABELS = {
  submitted: { text: 'Submitted', className: 'text-emerald-600' },
  missing: { text: 'Missing', className: 'text-red-600' },
  today: { text: 'Today', className: 'text-primary' },
};

// A tap on a submitted day opens its count; a missing day or today opens the
// form. Other days do not navigate. Phones show the tinted number cell alone;
// from md up the cells grow and carry a status label.
export default function MonthCalendar({ month, site }) {
  const router = useRouter();

  const openDay = (day, status) => {
    const iso = `${month.year}-${String(month.monthNumber).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const siteQuery = `site=${encodeURIComponent(site ?? '')}`;
    if (status === 'submitted') router.push(`/counts/${iso}?${siteQuery}`);
    if (status === 'missing' || status === 'today') router.push(`/meal-count?date=${iso}&${siteQuery}`);
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
      <div className="grid grid-cols-7 gap-1 p-1.5 tabular-nums md:gap-1.5 md:p-2">
        {cells.map((day, index) => {
          if (day === null) return <div key={`blank-${index}`} className="h-12 md:h-[104px]" />;
          const status = month.days[day] ?? 'none';
          const label = DAY_LABELS[status];
          const clickable = status === 'submitted' || status === 'missing' || status === 'today';
          return (
            <button
              key={day}
              type="button"
              disabled={!clickable}
              onClick={() => openDay(day, status)}
              className={cn(
                'flex h-12 items-center justify-center rounded-lg text-sm',
                'md:h-[104px] md:flex-col md:items-start md:justify-between md:p-2 md:text-[15px]',
                DAY_STYLES[status],
                clickable && 'cursor-pointer transition-[background-color,transform] active:scale-[0.97]'
              )}
            >
              <span>{day}</span>
              {label && (
                <span className={cn('hidden text-[10px] font-medium md:block', label.className)}>{label.text}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
