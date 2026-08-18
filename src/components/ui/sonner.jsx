'use client';
import { Toaster as Sonner } from 'sonner';

// The app ships light-only; never inherit the OS theme here.
const Toaster = ({ ...props }) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:rounded-xl group-[.toaster]:border-slate-200 group-[.toaster]:bg-white group-[.toaster]:text-slate-900 group-[.toaster]:shadow-md',
          title: 'group-[.toast]:text-[13px] group-[.toast]:font-semibold',
          description: 'group-[.toast]:text-slate-500',
          success: '[&_[data-icon]]:text-emerald-600',
          error: '[&_[data-icon]]:text-red-600',
          warning: '[&_[data-icon]]:text-amber-600',
          info: '[&_[data-icon]]:text-primary',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-slate-100 group-[.toast]:text-slate-500',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
