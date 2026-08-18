'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Download, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Protected from '@/components/auth/Protected';
import AppNavbar from '@/components/shell/AppNavbar';
import { Button } from '@/components/ui/button';
import { apiGet } from '@/lib/api-client';

function fileName(file) {
  return file.name ?? file.fileName ?? 'Menu.pdf';
}

function fileId(file) {
  return file.id ?? file.fileId ?? '';
}

function MenusScreen() {
  const [files, setFiles] = useState(null);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState('');

  const load = () => {
    setError('');
    setFiles(null);
    apiGet('/api/reports/files')
      .then((list) => setFiles(Array.isArray(list) ? list : []))
      .catch((err) => setError(err.message));
  };

  useEffect(load, []);

  const download = async (file) => {
    const id = fileId(file);
    setDownloading(id);
    try {
      const payload = await apiGet(`/api/reports/files/download?fileId=${encodeURIComponent(id)}`);
      const bytes = atob(payload.bytes);
      const buffer = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
      const blob = new Blob([buffer], { type: payload.mimeType || 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = payload.fileName || fileName(file);
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDownloading('');
    }
  };

  return (
    <main className="mx-auto flex max-w-md flex-col gap-5 px-4 pb-8 pt-5 md:max-w-screen-xl md:px-8 md:pt-7">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Menus</h1>
        <p className="text-[13px] text-slate-500">Program menus, ready to download.</p>
      </div>

      {error && (
        <div className="flex flex-col items-center gap-2 rounded-[14px] border border-red-200 bg-white px-4 py-12">
          <AlertCircle className="h-6 w-6 text-red-600" />
          <span className="text-[13px] font-semibold text-red-700">Couldn&apos;t load the menus</span>
          <span className="text-xs text-slate-500">{error}</span>
          <Button variant="outline" onClick={load} className="mt-1 h-9 rounded-lg border-slate-300 px-4 text-xs font-semibold text-slate-700">
            Try again
          </Button>
        </div>
      )}

      {!files && !error && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-[88px] rounded-[14px] bg-slate-200/50" />
          ))}
        </div>
      )}

      {files && files.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-[14px] border border-dashed border-slate-300 bg-white px-4 py-14">
          <FileText className="h-7 w-7 text-slate-300" strokeWidth={1.6} />
          <span className="text-[13px] font-semibold text-slate-700">No menus yet</span>
          <span className="text-xs text-slate-400">New menus will show up here as they are published.</span>
        </div>
      )}

      {files && files.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
          {files.map((file) => (
            <div
              key={fileId(file) || fileName(file)}
              className="flex items-center gap-4 rounded-[14px] border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 md:p-5"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-primary md:h-14 md:w-14">
                <FileText className="h-5 w-5 md:h-7 md:w-7" strokeWidth={1.6} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col md:gap-0.5">
                <span className="truncate text-sm font-semibold text-slate-900 md:text-[15px]">{fileName(file)}</span>
              </div>
              <Button
                variant="outline"
                disabled={downloading === fileId(file)}
                onClick={() => download(file)}
                className="h-11 shrink-0 rounded-[10px] border-slate-300 px-3.5 font-semibold text-slate-700 md:px-4"
              >
                {downloading === fileId(file) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                <span className="hidden md:inline">Download</span>
              </Button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

export default function MenusPage() {
  return (
    <Protected>
      <div className="min-h-screen bg-background">
        <AppNavbar active="Menus" />
        <MenusScreen />
      </div>
    </Protected>
  );
}
