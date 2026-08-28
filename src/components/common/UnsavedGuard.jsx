'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

// Work in progress is protected two ways:
//   - leaving the tab or reloading raises the browser's own prompt, which is
//     the only thing a browser allows there;
//   - navigating inside the app raises the product's dialog instead of a
//     native confirm, so the warning looks like the rest of the app and can
//     explain what is at stake.
// The click listener runs in the capture phase, before Next's router picks the
// event up, and the navigation is replayed only if the user confirms.
export function UnsavedGuard({
  enabled,
  title = 'Leave without submitting?',
  description = 'The marks on this screen have not been sent yet.',
  consequences = ['Everything marked here is lost.', 'Nothing was submitted, so the day stays open.'],
  confirmLabel = 'Leave anyway',
  cancelLabel = 'Stay on this page',
}) {
  const router = useRouter();
  const enabledRef = useRef(enabled);
  const bypassRef = useRef(false);
  const [pending, setPending] = useState(null);

  enabledRef.current = enabled;

  useEffect(() => {
    const onBeforeUnload = (event) => {
      if (!enabledRef.current || bypassRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  useEffect(() => {
    const onClick = (event) => {
      if (!enabledRef.current || bypassRef.current) return;
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const anchor = event.target.closest?.('a[href]');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('http') || href.startsWith('//') || href.startsWith('#')) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (href.split('?')[0].split('#')[0] === window.location.pathname) return;

      event.preventDefault();
      event.stopPropagation();
      setPending(href);
    };

    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  const leave = useCallback(() => {
    const href = pending;
    bypassRef.current = true;
    setPending(null);
    router.push(href);
    // The guard re-arms for whatever renders next; this screen is unmounting.
    setTimeout(() => {
      bypassRef.current = false;
    }, 1000);
  }, [pending, router]);

  return (
    <ConfirmDialog
      open={Boolean(pending)}
      onOpenChange={(open) => !open && setPending(null)}
      title={title}
      description={description}
      consequences={consequences}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      tone="warning"
      onConfirm={leave}
    />
  );
}
