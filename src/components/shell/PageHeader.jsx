'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

// One header for every screen: optional back link, title, one line of context,
// and the screen's actions.
//
// On a desk the actions sit on the right of the title. On a phone they used to
// wrap into a ragged column - four buttons of four different widths, each as
// loud as the next - so a phone gets `mobileActions` instead: one control beside
// the title, and the rest inside the sheet behind it.
export default function PageHeader({
  title,
  subtitle,
  actions,
  mobileActions,
  backHref,
  backLabel = 'Back',
  className,
}) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {backHref && (
        <Link
          href={backHref}
          // `-my-2 py-2` gives the tap target the height a thumb needs without
          // moving the text: this was 20px tall on a screen meant for tablets.
          className="-my-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-sm py-2 text-[13px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="h-4 w-4" />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6">
        <div className="flex min-w-0 flex-1 items-start gap-3 md:block">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-foreground md:text-[28px]">
              {title}
            </h1>
            {subtitle && <p className="text-[13px] leading-relaxed text-muted-foreground">{subtitle}</p>}
          </div>
          {mobileActions && (
            <div className="flex shrink-0 items-center gap-2 pt-0.5 md:hidden">{mobileActions}</div>
          )}
        </div>
        {actions && (
          <div
            className={cn(
              'flex min-w-0 flex-wrap items-center gap-2 md:max-w-[55%] md:justify-end lg:max-w-none',
              // A phone that has been given its own control does not also get
              // the desktop rack of buttons underneath it.
              mobileActions && 'hidden md:flex'
            )}
          >
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
