'use client';

import { useEffect, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Check, Eraser, PenLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isSigned } from '@/lib/signature';

// The rule lives in @/lib/signature so the public claim-signing page enforces
// exactly the same thing this screen does.

export function SignatureField({ onChange, invalid, className }) {
  const padRef = useRef(null);
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [signed, setSigned] = useState(false);

  // The canvas needs real pixel attributes; sizing it with CSS alone offsets
  // every stroke from the pen.
  useEffect(() => {
    const measure = () => setWidth(wrapRef.current?.clientWidth ?? 0);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const evaluate = () => {
    const valid = isSigned(padRef.current);
    setSigned(valid);
    onChange(valid ? () => padRef.current.toDataURL('image/png') : null);
  };

  const clear = () => {
    padRef.current?.clear();
    setSigned(false);
    onChange(null);
  };

  return (
    <div
      className={cn(
        'grid gap-4 rounded-lg border border-border bg-card p-3.5',
        // The pad takes the width of the screen, with the certification text
        // beside it from md up instead of a half-empty card.
        'md:grid-cols-[minmax(0,1fr)_20rem] md:items-start md:p-4',
        className
      )}
    >
      <div className="flex min-w-0 flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
            {signed ? (
              <>
                <Check className="h-3.5 w-3.5 text-success" strokeWidth={3} />
                <span className="text-success-text">Signed</span>
              </>
            ) : (
              <>
                <PenLine className="h-3.5 w-3.5" />
                Sign inside the box
              </>
            )}
          </span>
          <button
            type="button"
            onClick={clear}
            className="flex items-center gap-1.5 rounded-sm px-2 py-1 text-[12px] font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Eraser className="h-3.5 w-3.5" />
            Clear
          </button>
        </div>

        {/* The pad stays paper-white in both themes: the captured PNG is dark ink
            on transparent and ends up on a printed form. */}
        <div
          ref={wrapRef}
          className={cn(
            'relative overflow-hidden rounded-md border-[1.5px] border-dashed bg-white',
            signed ? 'border-success-border' : invalid ? 'border-destructive' : 'border-border-strong'
          )}
        >
          {width > 0 && (
            <SignatureCanvas
              ref={padRef}
              penColor="#0f172a"
              onEnd={evaluate}
              clearOnResize={false}
              canvasProps={{
                width,
                height: 148,
                className: 'block touch-none',
                'aria-label': 'Signature',
              }}
            />
          )}
          {/* The signing line, so a wide pad still reads as a place to sign. */}
          {!signed && width > 0 && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-dashed border-slate-300"
            />
          )}
        </div>
      </div>

      <div className="flex flex-col justify-center gap-2 rounded-md bg-muted p-3.5 md:p-4">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Certification
        </span>
        <p className="text-[12.5px] leading-relaxed text-foreground">
          I certify that the information on this form is true and correct to the best of my knowledge, and that
          meal counts were taken at the point of service.
        </p>
        <span className="text-[11.5px] text-muted-foreground">
          Sign with a finger on a tablet, or with the mouse on a computer.
        </span>
      </div>
    </div>
  );
}
