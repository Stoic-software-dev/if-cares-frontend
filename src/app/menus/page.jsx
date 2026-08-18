'use client';

import { Download, FileText } from 'lucide-react';
import { toast } from 'sonner';
import AppNavbar from '@/components/shell/AppNavbar';
import { STAFF_NAV } from '@/components/shell/nav';
import { Button } from '@/components/ui/button';
import { MOCK_MENUS, MOCK_USER } from '@/lib/mock-data';

export default function MenusPage() {
  const download = (menu) => toast.success(`Downloading ${menu.name}`);

  return (
    <div className="min-h-screen bg-background">
      <AppNavbar items={STAFF_NAV} active="Menus" user={MOCK_USER} />

      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-8 pt-5 md:max-w-3xl md:px-8 md:pt-7">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Menus</h1>
          <p className="text-[13px] text-slate-500">Program menus for your site, ready to download.</p>
        </div>

        <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white">
          {MOCK_MENUS.map((menu, index) => (
            <div
              key={menu.id}
              className={`flex items-center gap-3 px-4 py-3.5 ${index < MOCK_MENUS.length - 1 ? 'border-b border-slate-100' : ''}`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-teal-50 text-primary">
                <FileText className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-slate-900">{menu.name}</span>
                <span className="text-xs text-slate-400">
                  Updated {menu.updated} · {menu.size}
                </span>
              </div>
              <Button
                variant="outline"
                onClick={() => download(menu)}
                className="h-11 shrink-0 rounded-[10px] border-slate-300 px-3.5 font-semibold text-slate-700 md:px-4"
              >
                <Download className="h-4 w-4" />
                <span className="hidden md:inline">Download</span>
              </Button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
