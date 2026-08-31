'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Page numbers around the current one, with gaps where the run is long. Always
// the same width, so the control does not jump as pages change.
function pageWindow(page, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  if (page <= 4) return [1, 2, 3, 4, 5, 'gap', pageCount];
  if (page >= pageCount - 3) {
    return [1, 'gap', pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount];
  }
  return [1, 'gap', page - 1, page, page + 1, 'gap', pageCount];
}

/**
 * @param {number} page current page, 1 based
 * @param {number} pageCount total pages
 * @param {number} [total] rows across every page, for the count line
 * @param {number} [pageSize] rows per page, for the count line
 */
export function Pagination({ page, pageCount, onPageChange, total, pageSize, className, label = 'items' }) {
  if (pageCount <= 1) return null;

  const go = (next) => {
    const clamped = Math.min(Math.max(next, 1), pageCount);
    if (clamped === page) return;
    onPageChange(clamped);
  };

  const first = (page - 1) * (pageSize ?? 0) + 1;
  const last = Math.min(page * (pageSize ?? 0), total ?? 0);

  return (
    <nav
      aria-label="Pagination"
      className={cn('flex flex-wrap items-center justify-between gap-3', className)}
    >
      {total != null && pageSize != null ? (
        <span className="text-[12px] tabular-nums text-muted-foreground">
          {first} to {last} of {total} {label}
        </span>
      ) : (
        <span />
      )}

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label="Previous page" disabled={page === 1} onClick={() => go(page - 1)}>
          <ChevronLeft />
        </Button>

        {pageWindow(page, pageCount).map((item, index) =>
          item === 'gap' ? (
            <span key={`gap-${index}`} aria-hidden="true" className="px-1 text-[13px] text-muted-foreground">
              ...
            </span>
          ) : (
            <Button
              key={item}
              variant={item === page ? 'default' : 'ghost'}
              size="icon"
              aria-label={`Page ${item}`}
              aria-current={item === page ? 'page' : undefined}
              className="text-[13px] tabular-nums"
              onClick={() => go(item)}
            >
              {item}
            </Button>
          )
        )}

        <Button
          variant="ghost"
          size="icon"
          aria-label="Next page"
          disabled={page === pageCount}
          onClick={() => go(page + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </nav>
  );
}
