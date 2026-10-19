'use client';

import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Offers to install the app on a site user's phone (STOIC-2771). Installed, it
// opens with no signal; on an iPhone it is also what stops Safari from clearing
// what the phone kept after 7 days without use. Android offers its own install
// button; Safari has none, so the steps are written out. Closing it is for good.
const DISMISSED_KEY = 'ifc.installHint.dismissed';

function installed() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIos() {
  const ua = window.navigator.userAgent;
  // iPadOS reports itself as a Mac with a touch screen.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export function InstallHint() {
  const [mode, setMode] = useState(null); // null | 'ios' | 'prompt'
  const [prompt, setPrompt] = useState(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISSED_KEY)) return undefined;
    } catch {
      // Storage blocked: it shows, and closing it lasts this visit.
    }
    if (installed()) return undefined;
    if (isIos()) {
      setMode('ios');
      return undefined;
    }
    const onPrompt = (event) => {
      event.preventDefault();
      setPrompt(event);
      setMode('prompt');
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const dismiss = () => {
    setMode(null);
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Lasts this visit.
    }
  };

  const install = async () => {
    prompt.prompt();
    const choice = await prompt.userChoice.catch(() => null);
    if (choice?.outcome === 'accepted') dismiss();
  };

  if (!mode) return null;

  return (
    <div className="relative flex flex-col gap-2 rounded-lg border border-info-border bg-info-soft p-3.5 pr-11 text-info-text">
      <span className="text-[13.5px] font-semibold">Install the app on this phone</span>
      {mode === 'ios' ? (
        <span className="text-[13px] leading-relaxed">
          It then opens and takes the meal count without signal. Tap{' '}
          <Share className="inline h-3.5 w-3.5 align-[-2px]" aria-label="Share" /> Share, then{' '}
          <span className="font-semibold">Add to Home Screen</span>. Open it from the home screen and sign in once
          there.
        </span>
      ) : (
        <>
          <span className="text-[13px] leading-relaxed">It then opens and takes the meal count without signal.</span>
          <Button size="sm" onClick={install} className="self-start">
            <Download />
            Install
          </Button>
        </>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Close"
        className="absolute right-1.5 top-1.5 flex h-10 w-10 items-center justify-center rounded-md outline-none transition-colors hover:bg-black/5 dark:hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
