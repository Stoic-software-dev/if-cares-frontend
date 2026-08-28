'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// The one confirmation used by every destructive or irreversible action.
// Three states: confirm (says what the action takes with it) -> working ->
// result. A failure returns to the confirm state with the reason in place,
// so the user never loses the dialog they were in.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  consequences = [],
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  successTitle,
  successDescription,
  onConfirm,
  children,
}) {
  const [state, setState] = useState('confirm');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setState('confirm');
      setError('');
    }
  }, [open]);

  const run = async () => {
    setState('working');
    setError('');
    try {
      await onConfirm();
      if (successTitle) setState('done');
      else onOpenChange(false);
    } catch (err) {
      setError(err?.message || 'The action could not be completed.');
      setState('confirm');
    }
  };

  const danger = tone === 'danger';

  return (
    <Dialog open={open} onOpenChange={(value) => state !== 'working' && onOpenChange(value)}>
      <DialogContent className="sm:max-w-md" hideClose={state === 'working'}>
        {state === 'done' ? (
          <>
            <div className="flex flex-col items-center gap-3 pt-2 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success-soft text-success">
                <Check className="h-6 w-6" strokeWidth={2.5} />
              </span>
              <DialogHeader className="items-center pr-0 text-center">
                <DialogTitle>{successTitle}</DialogTitle>
                {successDescription && <DialogDescription>{successDescription}</DialogDescription>}
              </DialogHeader>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="flex gap-3.5">
              <span
                className={cn(
                  'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                  danger ? 'bg-destructive-soft text-destructive' : 'bg-warning-soft text-warning'
                )}
              >
                <AlertTriangle className="h-5 w-5" />
              </span>
              <DialogHeader className="pr-0">
                <DialogTitle>{title}</DialogTitle>
                {description && <DialogDescription>{description}</DialogDescription>}
              </DialogHeader>
            </div>

            {consequences.length > 0 && (
              <ul className="flex flex-col gap-1.5 rounded-md bg-muted p-3 text-[12.5px] text-muted-foreground">
                {consequences.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span aria-hidden="true" className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" />
                    <span className="leading-relaxed">{line}</span>
                  </li>
                ))}
              </ul>
            )}

            {children}

            {error && (
              <p role="alert" className="rounded-md bg-destructive-soft px-3 py-2 text-[12.5px] font-medium text-destructive-text">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={state === 'working'}>
                {cancelLabel}
              </Button>
              <Button
                variant={danger ? 'destructive' : 'default'}
                onClick={run}
                loading={state === 'working'}
              >
                {state === 'working' ? 'Working…' : confirmLabel}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
