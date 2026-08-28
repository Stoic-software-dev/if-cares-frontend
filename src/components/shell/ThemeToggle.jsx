'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/shell/ThemeProvider';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

// Three-state control rather than a binary flip: "follow the device" is a real
// choice, and sites that hand a tablet between shifts rely on it.
export function ThemeToggle({ className }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className={cn('inline-flex items-center gap-0.5 rounded-md border border-border bg-muted p-0.5', className)}
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={option.label}
            title={option.label}
            onClick={() => setTheme(option.value)}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-xs outline-none transition-colors duration-fast',
              'focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-card text-foreground shadow-e1'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-[15px] w-[15px]" />
          </button>
        );
      })}
    </div>
  );
}
