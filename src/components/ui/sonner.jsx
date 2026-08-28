'use client';

import { Toaster as Sonner } from 'sonner';
import { useTheme } from '@/components/shell/ThemeProvider';

// Toasts follow the app's theme, never the OS theme on its own, and sit above
// the phone's bottom navigation.
const Toaster = ({ ...props }) => {
  const { resolved } = useTheme();

  return (
    <Sonner
      theme={resolved}
      position="top-center"
      offset={12}
      toastOptions={{
        duration: 5000,
        classNames: {
          toast:
            'group toast group-[.toaster]:rounded-lg group-[.toaster]:border-border group-[.toaster]:bg-popover group-[.toaster]:text-popover-foreground group-[.toaster]:shadow-e2',
          title: 'group-[.toast]:text-[13px] group-[.toast]:font-semibold',
          description: 'group-[.toast]:text-[12.5px] group-[.toast]:text-muted-foreground',
          success: '[&_[data-icon]]:text-success',
          error: '[&_[data-icon]]:text-destructive',
          warning: '[&_[data-icon]]:text-warning',
          info: '[&_[data-icon]]:text-info',
          actionButton:
            'group-[.toast]:rounded-sm group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:font-semibold',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
