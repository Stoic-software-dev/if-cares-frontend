'use client';

import { useEffect, useState } from 'react';

// Keyboard hints have to match the keyboard in front of the user: the Command
// glyph on a Windows machine is just noise. Resolved after mount so the server
// and the first client render agree.
export function useShortcutLabel(key = 'K') {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    const platform =
      navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '';
    setIsMac(/mac|iphone|ipad/i.test(platform));
  }, []);

  return isMac ? `⌘${key}` : `Ctrl ${key}`;
}
