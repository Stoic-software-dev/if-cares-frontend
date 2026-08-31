'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, FileText, ShieldCheck } from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import BrandMark from '@/components/shell/BrandMark';
import { cn } from '@/lib/utils';

// The one screen in the app that anyone can open. Whoever signs a consolidated
// claim is an authorized representative of the sponsor, not a user of the
// system, so asking them to have an account is asking them to do the wrong
// thing. What stands in for a login is the token in the URL.

function SignScreen() {
  const { token } = useParams();
  const padRef = useRef(null);
  const wrapRef = useRef(null);

  const [claim, setClaim] = useState(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [hasInk, setHasInk] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [width, setWidth] = useState(560);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    fetch(`/api/sign/${token}`, { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok || body?.result === 'error') {
          throw new Error(body?.message || 'This link is not valid.');
        }
        setClaim(body.data);
      })
      .catch((err) => setError(err.message));
  }, [token]);

  // The pad is a canvas, so its drawing surface has to match its box exactly or
  // the ink lands away from the pen.
  useEffect(() => {
    const measure = () => {
      if (wrapRef.current) setWidth(wrapRef.current.clientWidth);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [claim]);

  const submit = async () => {
    const signature = hasInk && !padRef.current?.isEmpty() ? padRef.current.toDataURL('image/png') : '';
    if (!signature || name.trim().length < 2) {
      setAttempted(true);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/sign/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature, signedBy: name.trim(), title: title.trim() }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || body?.result === 'error') {
        throw new Error(body?.message || 'The signature could not be saved.');
      }
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-success-soft text-success">
            <CheckCircle2 className="h-6 w-6" />
          </span>
          <h1 className="text-[22px] font-bold tracking-tight text-foreground">Signed</h1>
          <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
            {claim?.fileName} now carries your signature. IF Cares has the signed copy; you can close this
            page. The link will not open again.
          </p>
        </div>
      </Shell>
    );
  }

  if (error && !claim) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="text-[20px] font-bold tracking-tight text-foreground">This link cannot be opened</h1>
          <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">{error}</p>
          <p className="text-[12.5px] text-muted-foreground">
            Ask IF Cares to send a new signing link.
          </p>
        </div>
      </Shell>
    );
  }

  if (!claim) {
    return (
      <Shell>
        <div className="flex w-full flex-col gap-3">
          <Skeleton className="h-8 w-2/3 rounded-md" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </Shell>
    );
  }

  const nameError = attempted && name.trim().length < 2 ? 'Type the name of whoever is signing.' : undefined;
  const inkError = attempted && !hasInk ? 'Sign inside the box.' : undefined;

  return (
    <Shell wide>
      <div className="flex w-full flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] font-bold tracking-tight text-foreground md:text-[26px]">
            Sign the meals claimed
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {claim.state ? `${claim.state}, ` : ''}
            {claim.period}. Read the claim, then sign it.
          </p>
        </div>

        {/* The document is offered rather than embedded. An inline PDF viewer is
            unreliable on the tablets these sites use, and burying the link
            inside a failed embed is how someone ends up signing something they
            never opened. */}
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
              {claim.fileName}
            </span>
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/sign/${token}?pdf=1`} target="_blank" rel="noreferrer">
                Read the claim
              </a>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPreview((open) => !open)}>
              {preview ? 'Hide preview' : 'Preview here'}
            </Button>
          </div>
          {preview && (
            <object data={`/api/sign/${token}?pdf=1`} type="application/pdf" className="h-[55vh] w-full">
              <div className="p-6 text-[13px] text-muted-foreground">
                This browser cannot show the document inline. Use Read the claim to open it.
              </div>
            </object>
          )}
        </div>

        <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 md:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name" htmlFor="sign-name" error={nameError}>
              <Input
                id="sign-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Full name"
                aria-invalid={Boolean(nameError)}
                className="h-12"
              />
            </Field>
            <Field label="Title" htmlFor="sign-title" hint="Optional.">
              <Input
                id="sign-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Executive Director"
                className="h-12"
              />
            </Field>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Signature
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  padRef.current?.clear();
                  setHasInk(false);
                }}
              >
                Clear
              </Button>
            </div>

            <div
              ref={wrapRef}
              className={cn(
                'relative overflow-hidden rounded-md border bg-white',
                inkError ? 'border-destructive' : 'border-border-strong'
              )}
            >
              <span className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-dashed border-slate-300" />
              <SignatureCanvas
                ref={padRef}
                penColor="#0f172a"
                onEnd={() => setHasInk(true)}
                canvasProps={{ width, height: 160, className: 'block touch-none' }}
              />
            </div>
            {inkError && <span className="text-[12px] text-destructive-text">{inkError}</span>}
          </div>

          <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            By signing you certify that the information in this claim is true and correct to the best of your
            knowledge, and that records are on file to support it.
          </p>

          {error && <p className="text-[13px] text-destructive-text">{error}</p>}

          <Button size="touch" onClick={submit} loading={saving} className="sm:self-start">
            {saving ? 'Saving' : 'Sign this claim'}
          </Button>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children, wide = false }) {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center bg-surface px-4 py-8">
      <div className={cn('flex w-full flex-col items-center gap-6', wide ? 'max-w-3xl' : 'max-w-md')}>
        <BrandMark className="self-center" />
        {children}
      </div>
    </main>
  );
}

export default function SignPage() {
  return <SignScreen />;
}
