import { cn } from '@/lib/utils';

export function BowlIcon({ className }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 11h18" />
      <path d="M4 11a8 8 0 0 1 16 0" />
      <path d="M5 11v2a7 7 0 0 0 14 0v-2" />
    </svg>
  );
}

export default function BrandMark({ size = 'sm', withProgram = false, className }) {
  const tile = size === 'lg' ? 'h-11 w-11 rounded-xl' : 'h-[30px] w-[30px] rounded-lg';
  const icon = size === 'lg' ? 'h-6 w-6' : 'h-4 w-4';

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div className={cn('flex items-center justify-center bg-primary text-primary-foreground', tile)}>
        <BowlIcon className={icon} />
      </div>
      <div className="flex flex-col">
        <span className="text-[15px] font-bold tracking-tight text-slate-900 leading-tight">IF Cares</span>
        {withProgram && (
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary leading-tight">
            Regular Year
          </span>
        )}
      </div>
    </div>
  );
}
