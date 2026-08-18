'use client';

import { Download, FileText } from 'lucide-react';
import { toast } from 'sonner';
import AppNavbar from '@/components/shell/AppNavbar';
import { STAFF_NAV } from '@/components/shell/nav';
import { Button } from '@/components/ui/button';
import { MOCK_MENUS, MOCK_SITE, MOCK_USER } from '@/lib/mock-data';

export default function MenusPage() {
  const download = (menu) => toast.success(`Downloading ${menu.name}`);

  return (
    <div className="min-h-screen bg-background">
      <AppNavbar items={STAFF_NAV} active="Menus" user={MOCK_USER} />

      <main className="mx-auto flex max-w-md flex-col gap-5 px-4 pb-8 pt-5 md:max-w-screen-xl md:px-8 md:pt-7">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Menus</h1>
          <p className="text-[13px] text-slate-500">Program menus for {MOCK_SITE.name}, ready to download.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
          {MOCK_MENUS.map((menu) => (
            <div
              key={menu.id}
              className="flex items-center gap-4 rounded-[14px] border border-slate-200 bg-white p-4 md:p-5"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-primary md:h-14 md:w-14">
                <FileText className="h-5 w-5 md:h-7 md:w-7" strokeWidth={1.6} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col md:gap-0.5">
                <span className="truncate text-sm font-semibold text-slate-900 md:text-[15px]">{menu.name}</span>
                <span className="text-xs text-slate-400 md:text-[13px]">
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
