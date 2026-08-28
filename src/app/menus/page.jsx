'use client';

import { useMemo, useState } from 'react';
import { Download, Eye, FileText, UtensilsCrossed } from 'lucide-react';
import Protected from '@/components/auth/Protected';
import AppShell from '@/components/shell/AppShell';
import PageHeader from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { MENUS_PATH, useCachedGet } from '@/lib/data-cache';
import { cn } from '@/lib/utils';

const fileName = (file) => file.name ?? file.fileName ?? 'Menu.pdf';
const fileId = (file) => file.id ?? file.fileId ?? '';

// "September 2026 Menu.pdf" reads better as a title without its extension, and
// the extension says more as a chip on the sheet.
function titleOf(file) {
  return fileName(file).replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim();
}

function extensionOf(file) {
  const match = fileName(file).match(/\.([a-z0-9]+)$/i);
  return (match?.[1] ?? 'PDF').toUpperCase();
}

// A menu whose name carries a month reads as "the menu for that month", whether
// the office wrote it as a word ("September 2026") or as digits ("8 8 2025").
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function periodOf(file) {
  const name = fileName(file);
  const byWord = MONTHS.findIndex((month) => name.toLowerCase().includes(month.toLowerCase()));
  const year = name.match(/\b(20\d{2})\b/)?.[1];
  if (byWord !== -1) return [MONTHS[byWord], year].filter(Boolean).join(' ');

  const numeric = name.match(/\b(\d{1,2})[ ._-](\d{1,2})[ ._-](20\d{2})\b/);
  if (numeric) {
    const month = Number(numeric[1]);
    if (month >= 1 && month <= 12) return `${MONTHS[month - 1]} ${numeric[3]}`;
  }
  return null;
}

const urlFor = (file, { attachment } = {}) =>
  `/api/reports/files/download?fileId=${encodeURIComponent(fileId(file))}${attachment ? '&download=1' : ''}`;

function MenusScreen() {
  const [query, setQuery] = useState('');

  // The listing is a Drive call, so it is cached for the session: coming back
  // to Menus is instant and the list refreshes in the background.
  const listing = useCachedGet(MENUS_PATH, { maxAge: 5 * 60 * 1000 });
  const { data, error, refresh: load } = listing;
  const files = useMemo(() => {
    if (data === undefined) return null;
    return Array.isArray(data) ? data : [];
  }, [data]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = files ?? [];
    const filtered = q ? list.filter((file) => fileName(file).toLowerCase().includes(q)) : list;
    return [...filtered].sort((a, b) => fileName(a).localeCompare(fileName(b)));
  }, [files, query]);

  return (
    <AppShell width="wide">
      <div className="flex flex-col gap-5">
        <PageHeader
          title="Menus"
          subtitle={
            files
              ? `${files.length} ${files.length === 1 ? 'document' : 'documents'} published by the office`
              : 'Loading the menus'
          }
          actions={
            files && files.length > 3 ? (
              <SearchInput value={query} onChange={setQuery} placeholder="Find a menu" className="w-full sm:w-72" />
            ) : null
          }
        />

        {error && <ErrorState title="Couldn't load the menus" message={error} onRetry={load} />}

        {!files && !error && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-[232px] rounded-lg" />
            ))}
          </div>
        )}

        {files && visible.length === 0 && (
          <div className="rounded-lg border border-dashed border-border-strong bg-card">
            <EmptyState
              icon={UtensilsCrossed}
              title={query ? 'No menu matches' : 'No menus published yet'}
              description={
                query
                  ? `Nothing here matches “${query.trim()}”.`
                  : 'New menus show up here as soon as the office publishes them.'
              }
              action={
                query ? (
                  <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                    Clear search
                  </Button>
                ) : null
              }
            />
          </div>
        )}

        {visible.length > 0 && (
          <div
            className="stagger grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-4"
            style={{ '--stagger-step': '35ms' }}
          >
            {visible.map((file, index) => {
              const period = periodOf(file);
              return (
                <article
                  key={fileId(file) || fileName(file)}
                  style={{ '--stagger-i': Math.min(index, 12) }}
                  className={cn(
                    'group flex flex-col overflow-hidden rounded-lg border border-border bg-card',
                    'transition-[border-color,transform] duration-fast hover:border-border-strong'
                  )}
                >
                  {/* The sheet: a document standing on a tinted surface. */}
                  <div className="relative flex h-32 items-end justify-center overflow-hidden bg-surface-sunken pt-6">
                    <span className="absolute right-3 top-3 rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-bold tracking-wide text-muted-foreground">
                      {extensionOf(file)}
                    </span>
                    <div
                      aria-hidden="true"
                      className="flex h-24 w-[74px] translate-y-2 flex-col gap-1.5 rounded-t-sm border border-b-0 border-border bg-card p-2.5 shadow-e1 transition-transform duration-slow ease-out group-hover:-translate-y-0.5"
                    >
                      <FileText className="h-4 w-4 text-primary" strokeWidth={1.8} />
                      <span className="h-1 w-full rounded-full bg-border" />
                      <span className="h-1 w-4/5 rounded-full bg-border" />
                      <span className="h-1 w-full rounded-full bg-border" />
                      <span className="h-1 w-2/3 rounded-full bg-border" />
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col gap-1 border-t border-border p-4">
                    <h2 className="text-[14.5px] font-semibold leading-snug text-foreground">{titleOf(file)}</h2>
                    <p className="text-[12px] text-muted-foreground">{period ?? 'Program menu'}</p>

                    <div className="mt-3 flex gap-2">
                      <Button asChild variant="outline" size="sm" className="flex-1">
                        <a href={urlFor(file)} target="_blank" rel="noreferrer">
                          <Eye />
                          View
                        </a>
                      </Button>
                      <Button asChild size="sm" className="flex-1">
                        <a href={urlFor(file, { attachment: true })} download={fileName(file)}>
                          <Download />
                          Download
                        </a>
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function MenusPage() {
  return (
    <Protected>
      <MenusScreen />
    </Protected>
  );
}
