'use client';

import * as React from 'react';
import Link from 'next/link';
import { MoreHorizontal, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

// The phone's own vocabulary.
//
// Every screen here was designed for a desk and then allowed to reflow: a
// header of five buttons that wrapped into a ragged stack, four full-width
// selects before the first row of data, a five column table squeezed into
// 390px. None of that is a phone screen, it is a desktop screen that fits.
//
// These are the parts the phone layouts are built from. They all stop at `md`,
// the same line the shell already draws between its bottom tab bar and its
// desktop bar, so nothing here reaches the screen the user likes.

const CloseSheet = React.createContext(() => {});

/**
 * The screen's secondary actions, behind one 44px target.
 *
 * A phone header has room for a title and one control. Everything else -
 * download, email, correct, void - belongs in a list that can be read, with the
 * verb first and a tap target the size of a thumb.
 */
export function ActionSheet({
  title = 'Actions',
  description,
  children,
  ariaLabel = 'More actions',
  className,
}) {
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={ariaLabel}
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-card',
          'text-muted-foreground outline-none transition-colors active:bg-accent',
          'focus-visible:ring-2 focus-visible:ring-ring',
          className
        )}
      >
        <MoreHorizontal className="h-[18px] w-[18px]" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="gap-2 px-3 pt-4">
          <SheetHeader className="px-2">
            <SheetTitle>{title}</SheetTitle>
            {description && <SheetDescription>{description}</SheetDescription>}
          </SheetHeader>
          <div className="flex flex-col">
            <CloseSheet.Provider value={close}>{children}</CloseSheet.Provider>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * One line of an ActionSheet. It closes the sheet on the way out, so an action
 * never runs behind a panel still covering the screen it just changed.
 *
 * `plain` forces a real anchor: an app route goes through the router, but a PDF
 * endpoint is a download and has to leave it.
 */
export function SheetAction({
  icon: Icon,
  children,
  hint,
  onSelect,
  href,
  plain,
  download,
  target,
  destructive,
  disabled,
}) {
  const close = React.useContext(CloseSheet);

  const className = cn(
    'flex min-h-[54px] w-full items-center gap-3 rounded-md px-3 text-left outline-none',
    'transition-colors active:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
    disabled && 'pointer-events-none opacity-40'
  );

  const body = (
    <>
      {Icon && (
        <Icon
          className={cn(
            'h-[18px] w-[18px] shrink-0',
            destructive ? 'text-destructive-text' : 'text-muted-foreground'
          )}
        />
      )}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span
          className={cn(
            'truncate text-[14.5px] font-semibold',
            destructive ? 'text-destructive-text' : 'text-foreground'
          )}
        >
          {children}
        </span>
        {hint && <span className="truncate text-[12px] text-muted-foreground">{hint}</span>}
      </span>
    </>
  );

  if (href && (plain || download || target)) {
    return (
      <a
        href={href}
        download={download}
        target={target}
        rel={target ? 'noreferrer' : undefined}
        onClick={close}
        className={className}
      >
        {body}
      </a>
    );
  }

  if (href) {
    return (
      <Link href={href} onClick={close} className={className}>
        {body}
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        close();
        onSelect?.();
      }}
      className={className}
    >
      {body}
    </button>
  );
}

/**
 * Filters, folded into one button.
 *
 * Stacked full-width selects put two hundred pixels of chrome between the
 * search field and the first result. Here what is set shows on the button as a
 * number, and the controls themselves get the room they need.
 */
export function FilterSheet({ count = 0, onClear, title = 'Filters', children, className }) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={count > 0 ? `Filters, ${count} applied` : 'Filters'}
        className={cn(
          'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-md border bg-card',
          'outline-none transition-colors active:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
          count > 0
            ? 'border-primary-border text-primary-strong dark:text-primary'
            : 'border-input text-muted-foreground',
          className
        )}
      >
        <SlidersHorizontal className="h-[18px] w-[18px]" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold tabular-nums text-primary-foreground">
            {count}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[86dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4">{children}</div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="touch" onClick={onClear} disabled={!count}>
              Clear all
            </Button>
            <Button size="touch" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * The filter that is the list's own navigation - all days, missing, submitted -
 * stays on the screen. It scrolls sideways off both edges rather than shrinking
 * its labels to fit, which is how a phone says there is more this way.
 */
export function ChipRow({ options, value, onChange, ariaLabel, className }) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('no-scrollbar -mx-4 flex snap-x gap-2 overflow-x-auto px-4 py-0.5', className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex h-10 shrink-0 snap-start items-center gap-1.5 whitespace-nowrap rounded-full border px-4',
              'text-[13px] font-semibold outline-none transition-colors duration-fast',
              'focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-muted-foreground active:bg-accent'
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 text-[11px] font-bold tabular-nums',
                  active
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The one thing the screen is for, where the thumb already is.
 *
 * It floats over the list instead of sitting at the top of a page that has been
 * scrolled away from, and it keeps its label: a bare plus asks the reader to
 * remember what this particular screen creates.
 */
export function Fab({ icon: Icon, children, onClick, href, className }) {
  const classes = cn(
    'fixed right-4 z-30 flex h-[52px] items-center gap-2 rounded-full bg-primary pl-4 pr-5',
    'text-[14.5px] font-semibold text-primary-foreground shadow-e3 outline-none',
    'transition-transform duration-fast active:scale-[0.97]',
    'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] md:hidden',
    className
  );

  const body = (
    <>
      {Icon && <Icon className="h-[18px] w-[18px]" strokeWidth={2.4} />}
      {children}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {body}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={classes}>
      {body}
    </button>
  );
}

/**
 * A phone list row: leading mark, two lines of text, trailing state.
 *
 * The desktop tables became a stacked field-per-line block on a phone - five
 * lines to say that one account is active staff with no site assigned. Same
 * information, two lines, one tap target.
 */
export function ListRow({ leading, title, meta, trailing, href, onClick, className, ...props }) {
  const Tag = href ? Link : onClick ? 'button' : 'div';
  return (
    <Tag
      {...(Tag === 'button' ? { type: 'button', onClick } : null)}
      {...(href ? { href } : null)}
      className={cn(
        'flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left outline-none',
        'transition-colors active:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
        className
      )}
      {...props}
    >
      {leading}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 items-center gap-1.5 text-[14px] font-semibold text-foreground">
          {title}
        </span>
        {meta && (
          <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-muted-foreground">
            {meta}
          </span>
        )}
      </span>
      {trailing}
    </Tag>
  );
}
