'use client';

import { useMemo, useRef, useState } from 'react';
import { Download, Eye, FileText, RefreshCw, Trash2, Upload, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import Protected from '@/components/auth/Protected';
import { isAdmin, useAuth } from '@/components/auth/AuthProvider';
import AppShell from '@/components/shell/AppShell';
import PageHeader from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { apiDelete, apiGet, apiUpload } from '@/lib/api-client';
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

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xls,.xlsx,.csv';

// Publishing a menu is dropping a file into the office's Drive folder. Doing it
// from here means nobody needs Drive access, or to know which folder it was.
function PublishDialog({ open, onClose, onPublished }) {
  const [file, setFile] = useState(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  const pick = (chosen) => {
    setFile(chosen ?? null);
    // The file's own name is almost always the right title, so it is offered
    // rather than demanded.
    setName(chosen ? chosen.name.replace(/\.[a-z0-9]+$/i, '') : '');
  };

  const close = () => {
    if (saving) return;
    pick(null);
    onClose();
  };

  const publish = async () => {
    if (!file) return;
    setSaving(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('name', name.trim());
      const res = await apiUpload(MENUS_PATH, form);
      toast.success(`${res.data.name} published`);
      pick(null);
      onPublished();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Publish a menu</DialogTitle>
          <DialogDescription>
            Everyone with an account sees it here as soon as it is published. A menu published under a
            name that already exists replaces that one.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(event) => pick(event.target.files?.[0] ?? null)}
          />

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={cn(
              'flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border-strong px-4 py-7',
              'text-center transition-colors hover:border-primary hover:bg-surface-sunken'
            )}
          >
            <Upload className="h-5 w-5 text-muted-foreground" />
            <span className="text-[13px] font-semibold text-foreground">
              {file ? file.name : 'Choose a file'}
            </span>
            <span className="text-[12px] text-muted-foreground">
              {file
                ? `${(file.size / 1024 / 1024).toFixed(1)} MB, click to choose another`
                : 'PDF, image, Word, Excel or CSV, up to 15 MB'}
            </span>
          </button>

          {file && (
            <Field label="Name it" htmlFor="menu-name" hint="What people see on the card.">
              <Input
                id="menu-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="September 2026 Menu"
              />
            </Field>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={publish} loading={saving} disabled={!file}>
            {!saving && <Upload />}
            Publish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MenusScreen() {
  const { user } = useAuth();
  const admin = isAdmin(user);
  const [publishing, setPublishing] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  // The listing is a Drive call, so it is cached for the session: coming back
  // to Menus is instant and the list refreshes in the background.
  const listing = useCachedGet(MENUS_PATH, { maxAge: 5 * 60 * 1000 });
  const { data, error, refresh: load } = listing;
  const files = useMemo(() => {
    if (data === undefined) return null;
    return Array.isArray(data) ? data : [];
  }, [data]);

  // The server caches the Drive listing for ten minutes, so a menu removed
  // straight from Drive keeps showing up here. Busting that first is what makes
  // a refresh mean something.
  const hardRefresh = async () => {
    setRefreshing(true);
    try {
      await apiGet(`${MENUS_PATH}?refresh=1`).catch(() => {});
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const remove = async () => {
    await apiDelete(`${MENUS_PATH}?fileId=${encodeURIComponent(fileId(removing))}`);
    toast.success(`${titleOf(removing)} removed`);
    await load();
  };

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
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              {files && files.length > 3 && (
                <SearchInput
                  value={query}
                  onChange={setQuery}
                  placeholder="Find a menu"
                  className="w-full sm:w-72"
                />
              )}
              {admin && (
                <>
                  <Button
                    variant="outline"
                    onClick={hardRefresh}
                    loading={refreshing}
                    className="shrink-0"
                    title="Re-read the Drive folder now"
                  >
                    {!refreshing && <RefreshCw />}
                    Refresh
                  </Button>
                  <Button onClick={() => setPublishing(true)} className="shrink-0">
                    <Upload />
                    Publish menu
                  </Button>
                </>
              )}
            </div>
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
                  : admin
                    ? 'Publish one and everyone with an account sees it here.'
                    : 'New menus show up here as soon as the office publishes them.'
              }
              action={
                query ? (
                  <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                    Clear search
                  </Button>
                ) : admin ? (
                  <Button size="sm" onClick={() => setPublishing(true)}>
                    <Upload />
                    Publish a menu
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
                    {admin && (
                      <button
                        type="button"
                        onClick={() => setRemoving(file)}
                        aria-label={`Remove ${titleOf(file)}`}
                        className={cn(
                          'absolute left-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-border',
                          'bg-card text-muted-foreground opacity-0 transition-[opacity,color,border-color] duration-fast',
                          'hover:border-destructive-text hover:text-destructive-text focus-visible:opacity-100',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100'
                        )}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
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

      <PublishDialog open={publishing} onClose={() => setPublishing(false)} onPublished={load} />

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing ? titleOf(removing) : ''}?`}
        description="It stops being listed here for everyone."
        consequences={['The file goes to the Drive trash, where it can be restored for 30 days.']}
        confirmLabel="Remove"
        onConfirm={remove}
      />
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
