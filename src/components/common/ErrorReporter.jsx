'use client';

import { useEffect } from 'react';
import { installGlobalErrorReporting } from '@/lib/monitoring';

// Mounted once at the root. React boundaries only see errors thrown while
// rendering; this is what catches the rest: event handlers, timers and rejected
// promises, which is where most of them actually happen.
export default function ErrorReporter() {
  useEffect(() => {
    installGlobalErrorReporting();
  }, []);
  return null;
}
