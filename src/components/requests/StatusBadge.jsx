import { cn } from '@/lib/utils';

const STATUS = {
  NEW: { label: 'New', className: 'border-teal-200 bg-teal-50 text-primary' },
  IN_PROGRESS: { label: 'In progress', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  RESOLVED: { label: 'Resolved', className: 'border-slate-200 bg-slate-50 text-slate-500' },
};

export default function StatusBadge({ status }) {
  const s = STATUS[status] ?? STATUS.NEW;
  return (
    <span className={cn('inline-flex w-fit justify-self-start rounded-full border px-2.5 py-0.5 text-[11px] font-semibold', s.className)}>
      {s.label}
    </span>
  );
}
