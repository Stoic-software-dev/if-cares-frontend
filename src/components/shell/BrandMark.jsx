import Image from 'next/image';
import { cn } from '@/lib/utils';

// The official IF Cares wordmark (public/web-logo.png) plus the program badge
// that tells the Regular Year app apart from Summer.
export default function BrandMark({ size = 'sm', withProgram = false, className }) {
  const logo = size === 'lg' ? 'h-16 w-auto' : 'h-8 w-auto';

  return (
    <div
      className={cn(
        'flex items-center gap-2.5',
        size === 'lg' && 'flex-col items-start gap-2',
        className
      )}
    >
      <Image
        src="/web-logo.png"
        alt="IF Cares — Intrinsic Foundation"
        width={1000}
        height={400}
        priority
        className={logo}
      />
      {withProgram && (
        <span
          className={cn(
            'inline-flex items-center rounded-full bg-teal-50 font-semibold uppercase tracking-[0.07em] text-primary',
            size === 'lg' ? 'px-3 py-1 text-[11px]' : 'px-2 py-0.5 text-[9px]'
          )}
        >
          Regular Year
        </span>
      )}
    </div>
  );
}
