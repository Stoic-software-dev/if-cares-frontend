'use client';

import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

// One header for every screen: optional back link, title, one line of context,
// and the screen's actions on the right (stacked under the title on phones).
export default function PageHeader({ title, subtitle, actions, backHref, backLabel = 'Back', className }) {
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {backHref && (
        <Link
          href={backHref}
          // `-my-2 py-2` gives the tap target the height a thumb needs without
          // moving the text: this was 20px tall on a screen meant for tablets.
          className="-my-2 inline-flex min-h-11 w-fit items-center gap-1 rounded-sm py-2 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-[22px] font-bold leading-tight tracking-tight text-foreground md:text-[28px]">
            {title}
          </h1>
          {subtitle && <p className="text-[13px] leading-relaxed text-muted-foreground">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
