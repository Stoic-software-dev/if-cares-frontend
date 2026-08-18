'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import SignatureCanvas from 'react-signature-canvas';
import { AlertCircle, Check } from 'lucide-react';
import { toast } from 'sonner';
import { assignedSiteNames, isAdmin, useAuth } from '@/components/auth/AuthProvider';
import Protected from '@/components/auth/Protected';
import AppNavbar from '@/components/shell/AppNavbar';
import MobileHeader from '@/components/shell/MobileHeader';
import PageHeader from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { apiGet, apiPost } from '@/lib/api-client';
import { todayYmd } from '@/lib/calendar';
import { cn } from '@/lib/utils';

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
        'flex h-11 flex-1 items-center justify-center gap-1 rounded-[9px] text-xs transition-[background-color,border-color,transform] active:scale-95',
        active && 'bg-primary font-semibold text-primary-foreground hover:bg-teal-800',
        !active && !attention && 'border border-slate-300 bg-white font-medium text-slate-500 hover:border-slate-400 hover:text-slate-700',
        !active && attention && 'border-[1.5px] border-dashed border-red-400 bg-white font-semibold text-red-700 hover:border-red-500'
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
  const { user } = useAuth();
  const iso = searchParams.get('date') ?? todayYmd();
  const site = searchParams.get('site') ?? assignedSiteNames(user)?.[0] ?? '';
  // Admin correction of an already-submitted count (STOIC-2201): the rows come
  // from the submitted entries, prefilled, and saving records a correction.
  const correcting = searchParams.get('correct') === '1' && isAdmin(user);

  const [roster, setRoster] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [marks, setMarks] = useState(new Map());
  const [timeIn, setTimeIn] = useState('15:30');
  const [timeOut, setTimeOut] = useState('');
  const [note, setNote] = useState('');
  const [signed, setSigned] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const sigPad = useRef(null);
  const sigWrap = useRef(null);
  const [sigWidth, setSigWidth] = useState(0);

  const loadRoster = () => {
    setLoadError('');
    setRoster(null);
    if (correcting) {
      apiGet(`/api/meal-counts/detail?site=${encodeURIComponent(site)}&date=${iso}`)
        .then(({ data }) => {
          const rows = data.entries.map((entry, index) => ({
            id: `entry-${index}`,
            number: entry.number,
            name: entry.name,
            age: entry.age ?? '',
          }));
          setRoster(rows);
          setMarks(
            new Map(
              data.entries.map((entry, index) => [
                `entry-${index}`,
                {
                  att: entry.attendance,
                  brk: entry.breakfast,
                  lun: entry.lunch,
                  snk: entry.snack,
                  sup: entry.supper,
                },
              ])
            )
          );
          setTimeIn(data.timeIn ? data.timeIn.slice(0, 5) : '');
          setTimeOut(data.timeOut ? data.timeOut.slice(0, 5) : '');
        })
        .catch((err) => setLoadError(err.message));
      return;
    }
    apiGet(`/api/students/roster?site=${encodeURIComponent(site)}`)
      .then((rows) => {
        setRoster(rows);
        setMarks(new Map(rows.map((s) => [s.id, { ...EMPTY_MARKS }])));
      })
      .catch((err) => setLoadError(err.message));
  };

  useEffect(loadRoster, [site, correcting]);

  useEffect(() => {
    // The canvas element needs real width/height attributes; sizing it with
    // CSS alone offsets every stroke from the pen.
    const measure = () => setSigWidth(sigWrap.current?.clientWidth ?? 0);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [roster]);

  const toggle = (studentId, meal) => {
    setMarks((prev) => {
      const next = new Map(prev);
      const current = next.get(studentId);
      next.set(studentId, { ...current, [meal]: !current[meal] });
      return next;
    });
  };

  const markedCount = useMemo(
    () => (roster ?? []).filter((s) => marks.get(s.id)?.att).length,
    [roster, marks]
  );

  const missing = [];
  if (!timeIn) missing.push('time in');
  if (!timeOut) missing.push('time out');
  if (markedCount === 0) missing.push('attendance');
  if (!signed && !correcting) missing.push('signature');
  const canSubmit = missing.length === 0 && !submitting;

  const clearSignature = () => {
    sigPad.current?.clear();
    setSigned(false);
  };

  const submit = async () => {
    if (missing.length > 0) {
      setAttempted(true);
      return;
    }
    setSubmitting(true);
    const rows = roster.map((s) => {
      const m = marks.get(s.id);
      return [s.number, s.name, s.age, m.att, m.brk, m.lun, m.snk, m.sup];
    });
    try {
      if (correcting) {
        await apiPost('/api/meal-counts/correct', {
          site,
          date: iso,
          timeIn,
          timeOut,
          note: note.trim(),
          data: rows,
        });
        toast.success(`Correction saved for ${dateLabel(iso)}`);
        router.push(`/counts/${iso}?site=${encodeURIComponent(site)}`);
        return;
      }
      await apiPost('/api/meal-counts', {
        actionType: 'mealCount',
        values: {
          site,
          // Noon UTC resolves to the intended calendar day in the program
          // timezone regardless of the device's own timezone.
          date: `${iso}T12:00:00.000Z`,
          timeIn,
          timeOut,
          signature: sigPad.current.toDataURL('image/png'),
          data: rows,
        },
      });
      toast.success(`Meal count submitted for ${dateLabel(iso)}`);
      router.push('/dashboard');
    } catch (err) {
      toast.error(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="hidden md:block">
        <AppNavbar active="Dashboard" />
      </div>
      <div className="md:hidden">
        <MobileHeader title={correcting ? `Correcting - ${dateLabel(iso)}` : dateLabel(iso)} subtitle={site} />
      </div>

      <main className="mx-auto flex max-w-md flex-col gap-5 px-4 pb-8 pt-4 md:max-w-5xl md:px-8 md:pt-7">
        <PageHeader title={correcting ? `Correcting - ${dateLabel(iso)}` : dateLabel(iso)} subtitle={site} />
        {correcting && (
          <div className="rounded-[10px] bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-800 md:text-[13px]">
            You are editing a submitted count. The original values stay on record as a correction history.
          </div>
        )}

        <section className="flex flex-col gap-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Service time</span>
          <div className="grid grid-cols-2 gap-2.5 md:max-w-md">
            <label className="flex h-14 flex-col justify-center gap-0.5 rounded-[10px] border border-slate-300 bg-white px-3.5 transition-shadow focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-600/15">
              <span className="text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-400">In</span>
              <input
                type="time"
                value={timeIn}
                onChange={(e) => setTimeIn(e.target.value)}
                className="w-full bg-transparent text-[15px] font-semibold tabular-nums text-slate-900 outline-none"
              />
            </label>
            <label
              className={cn(
                'flex h-14 flex-col justify-center gap-0.5 rounded-[10px] border bg-white px-3.5 transition-shadow focus-within:border-teal-600 focus-within:ring-2 focus-within:ring-teal-600/15',
                !timeOut && attempted ? 'border-[1.5px] border-red-600' : 'border-slate-300'
              )}
            >
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
                className="w-full bg-transparent text-[15px] font-semibold tabular-nums text-slate-900 outline-none"
              />
            </label>
          </div>
        </section>

        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">Roster</span>
            {roster && (
              <span className="text-xs font-semibold tabular-nums text-slate-700">
                {markedCount} of {roster.length} marked
              </span>
            )}
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-1 bg-primary transition-all"
              style={{ width: roster?.length ? `${(markedCount / roster.length) * 100}%` : 0 }}
            />
          </div>

          {loadError && (
            <div className="flex flex-col items-center gap-2 rounded-[14px] border border-red-200 bg-white px-4 py-10">
              <AlertCircle className="h-6 w-6 text-red-600" />
              <span className="text-[13px] font-semibold text-red-700">Couldn&apos;t load the roster</span>
              <span className="text-xs text-slate-500">{loadError}</span>
              <Button variant="outline" onClick={loadRoster} className="mt-1 h-9 rounded-lg border-slate-300 px-4 text-xs font-semibold text-slate-700">
                Try again
              </Button>
            </div>
          )}

          {!roster && !loadError && (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-[76px] rounded-[14px] bg-slate-200/50" />
              ))}
            </div>
          )}

          {roster && (
            <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white">
              {roster.map((student, index) => {
                const m = marks.get(student.id) ?? EMPTY_MARKS;
                const attention = attempted && !m.att;
                return (
                  <div
                    key={student.id}
                    className={cn(
                      'flex flex-col gap-2 px-3.5 py-3 md:flex-row md:items-center md:gap-6 md:px-5',
                      index < roster.length - 1 && 'border-b border-slate-100',
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
          )}
        </section>

        {!correcting && (
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
                !signed && attempted ? 'border-red-400' : 'border-slate-300'
              )}
              ref={sigWrap}
            >
              {sigWidth > 0 && (
                <SignatureCanvas
                  ref={sigPad}
                  penColor="#1e293b"
                  onEnd={() => {
                    // An accidental tap leaves a dot; only ink with real length counts.
                    const length = sigPad.current.toData().reduce((total, stroke) => {
                      for (let i = 1; i < stroke.length; i++) {
                        total += Math.hypot(stroke[i].x - stroke[i - 1].x, stroke[i].y - stroke[i - 1].y);
                      }
                      return total;
                    }, 0);
                    setSigned(length >= 30);
                  }}
                  clearOnResize={false}
                  canvasProps={{ width: sigWidth, height: 120, style: { display: 'block' } }}
                />
              )}
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              I certify that the information on this form is true and correct to the best of my knowledge, and that
              meal counts were taken at the point of service.
            </p>
          </div>
        </section>
        )}

        {correcting && (
          <section className="flex flex-col gap-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              Correction note - optional
            </span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why is this count being corrected?"
              maxLength={500}
              className="h-12 w-full rounded-[10px] border border-slate-300 bg-white px-3.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 transition-shadow focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15"
            />
          </section>
        )}

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
            disabled={submitting}
            className={cn(
              'h-[52px] rounded-xl text-[15px] font-semibold md:w-72',
              !canSubmit && 'cursor-not-allowed bg-slate-200 text-slate-400 hover:bg-slate-200'
            )}
          >
            {submitting ? 'Saving…' : correcting ? 'Save correction' : 'Submit meal count'}
          </Button>
        </section>
      </main>
    </div>
  );
}

export default function MealCountPage() {
  return (
    <Protected>
      <Suspense>
        <MealCountScreen />
      </Suspense>
    </Protected>
  );
}
