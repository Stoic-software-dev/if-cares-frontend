'use client';

import { Suspense, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import SignatureCanvas from 'react-signature-canvas';
import { AlertCircle, Check, Clock } from 'lucide-react';
import { toast } from 'sonner';
import AppNavbar from '@/components/shell/AppNavbar';
import MobileHeader from '@/components/shell/MobileHeader';
import PageHeader from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MOCK_SITE, MOCK_STUDENTS, MOCK_USER } from '@/lib/mock-data';

const STAFF_NAV = ['Dashboard', 'Menus', 'Requests'];

const MEALS = [
  { key: 'att', label: 'Att' },
  { key: 'brk', label: 'Brk' },
  { key: 'lun', label: 'Lun' },
  { key: 'snk', label: 'Snk' },
  { key: 'sup', label: 'Sup' },
];

const EMPTY_MARKS = { att: false, brk: false, lun: false, snk: false, sup: false };

function dateLabel(iso) {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function MealToggle({ label, active, attention, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex h-11 flex-1 items-center justify-center gap-1 rounded-[9px] text-xs',
        active && 'bg-primary font-semibold text-primary-foreground',
        !active && !attention && 'border border-slate-300 bg-white font-medium text-slate-500',
        !active && attention && 'border-[1.5px] border-dashed border-red-400 bg-white font-semibold text-red-700'
      )}
    >
      {active && <Check className="h-[11px] w-[11px]" strokeWidth={3.5} />}
      {label}
    </button>
  );
}

function MealCountScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const iso = searchParams.get('date') ?? '2026-09-17';

  const [marks, setMarks] = useState(() => new Map(MOCK_STUDENTS.map((s) => [s.id, { ...EMPTY_MARKS }])));
  const [timeIn, setTimeIn] = useState('15:30');
  const [timeOut, setTimeOut] = useState('');
  const [signed, setSigned] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const sigPad = useRef(null);

  const toggle = (studentId, meal) => {
    setMarks((prev) => {
      const next = new Map(prev);
      const current = next.get(studentId);
      next.set(studentId, { ...current, [meal]: !current[meal] });
      return next;
    });
  };

  const markedCount = useMemo(
    () => MOCK_STUDENTS.filter((s) => marks.get(s.id).att).length,
    [marks]
  );

  const missing = [];
  if (!timeIn) missing.push('time in');
  if (!timeOut) missing.push('time out');
  if (markedCount === 0) missing.push('attendance');
  if (!signed) missing.push('signature');
  const canSubmit = missing.length === 0;

  const clearSignature = () => {
    sigPad.current?.clear();
    setSigned(false);
  };

  const submit = () => {
    if (!canSubmit) {
      setAttempted(true);
      return;
    }
    toast.success(`Meal count submitted for ${dateLabel(iso)}`);
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="hidden md:block">
        <AppNavbar items={STAFF_NAV} active="Dashboard" user={MOCK_USER} />
      </div>
      <div className="md:hidden">
        <MobileHeader title={dateLabel(iso)} subtitle={MOCK_SITE.name} />
      </div>

      <main className="mx-auto flex max-w-md flex-col gap-5 px-4 pb-8 pt-4 md:max-w-5xl md:px-8 md:pt-7">
        <PageHeader title={dateLabel(iso)} subtitle={MOCK_SITE.name} />
        <section className="flex flex-col gap-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Service time</span>
          <div className="grid grid-cols-2 gap-2.5 md:max-w-md">
            <label
              className="flex h-12 items-center justify-between rounded-[10px] border border-slate-300 bg-white px-3.5"
            >
              <span className="flex flex-col justify-center">
                <span className="text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-400">In</span>
                <input
                  type="time"
                  value={timeIn}
                  onChange={(e) => setTimeIn(e.target.value)}
                  className="w-24 bg-transparent text-[15px] font-semibold tabular-nums text-slate-900 outline-none"
                />
              </span>
              <Clock className="h-4 w-4 text-slate-400" />
            </label>
            <label
              className={cn(
                'flex h-12 items-center justify-between rounded-[10px] border bg-white px-3.5',
                !timeOut && attempted ? 'border-[1.5px] border-red-600' : 'border-slate-300'
              )}
            >
              <span className="flex flex-col justify-center">
                <span
                  className={cn(
                    'text-[9px] font-semibold uppercase tracking-[0.06em]',
                    !timeOut && attempted ? 'text-red-700' : 'text-slate-400'
                  )}
                >
                  Out · required
                </span>
                <input
                  type="time"
                  value={timeOut}
                  onChange={(e) => setTimeOut(e.target.value)}
                  className="w-24 bg-transparent text-[15px] font-semibold tabular-nums text-slate-900 outline-none"
                />
              </span>
              <Clock className={cn('h-4 w-4', !timeOut && attempted ? 'text-red-600' : 'text-slate-400')} />
            </label>
          </div>
        </section>

        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Roster</span>
            <span className="text-xs font-semibold tabular-nums text-slate-700">
              {markedCount} of {MOCK_STUDENTS.length} marked
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-1 bg-primary transition-all"
              style={{ width: `${(markedCount / MOCK_STUDENTS.length) * 100}%` }}
            />
          </div>

          <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white">
            {MOCK_STUDENTS.map((student, index) => {
              const m = marks.get(student.id);
              const attention = attempted && !m.att;
              return (
                <div
                  key={student.id}
                  className={cn(
                    'flex flex-col gap-2 px-3.5 py-3 md:flex-row md:items-center md:gap-6 md:px-5',
                    index < MOCK_STUDENTS.length - 1 && 'border-b border-slate-100',
                    attention && 'border-l-[3px] border-l-red-600'
                  )}
                >
                  <div className="flex items-baseline gap-2 md:w-80 md:flex-none">
                    <span className="text-xs font-semibold tabular-nums text-slate-400">{student.number}</span>
                    <span className="text-sm font-semibold text-slate-900">{student.name}</span>
                    {attention ? (
                      <span className="ml-auto text-[11px] font-semibold text-red-700">Not marked</span>
                    ) : (
                      <span className="ml-auto text-[11px] text-slate-400">{student.age}</span>
                    )}
                  </div>
                  <div className="flex gap-1.5 md:ml-auto md:max-w-[560px] md:flex-1">
                    {MEALS.map((meal) => (
                      <MealToggle
                        key={meal.key}
                        label={meal.label}
                        active={m[meal.key]}
                        attention={meal.key === 'att' && attention}
                        onToggle={() => toggle(student.id, meal.key)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Certification</span>
            <button type="button" onClick={clearSignature} className="text-xs font-medium text-slate-500">
              Clear
            </button>
          </div>
          <div className="flex flex-col gap-2.5 rounded-[14px] border border-slate-200 bg-white p-3.5">
            <div
              className={cn(
                'overflow-hidden rounded-[10px] border-[1.5px] border-dashed',
                signed ? 'border-slate-300' : attempted ? 'border-red-400' : 'border-slate-300'
              )}
            >
              <SignatureCanvas
                ref={sigPad}
                penColor="#1e293b"
                onEnd={() => setSigned(true)}
                canvasProps={{ className: 'w-full', style: { height: 110, width: '100%' } }}
              />
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              I certify that the information on this form is true and correct to the best of my knowledge, and that
              meal counts were taken at the point of service.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          {missing.length > 0 && attempted ? (
            <div className="flex items-start gap-2 px-0.5">
              <AlertCircle className="mt-0.5 h-[15px] w-[15px] shrink-0 text-red-600" />
              <span className="text-[13px] font-medium leading-snug text-red-700">
                {missing.length} {missing.length === 1 ? 'thing' : 'things'} missing: {missing.join(', ')}
              </span>
            </div>
          ) : (
            <span className="hidden md:block" />
          )}
          <Button
            onClick={submit}
            className={cn(
              'h-[52px] rounded-xl text-[15px] font-semibold md:w-72',
              !canSubmit && 'cursor-not-allowed bg-slate-200 text-slate-400 hover:bg-slate-200'
            )}
          >
            Submit meal count
          </Button>
        </section>
      </main>
    </div>
  );
}

export default function MealCountPage() {
  return (
    <Suspense>
      <MealCountScreen />
    </Suspense>
  );
}
