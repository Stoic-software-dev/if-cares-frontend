'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, FileUp, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiPost } from '@/lib/api-client';
import { parseRosterText } from '@/lib/roster-file';
import { cn } from '@/lib/utils';

const ACCEPT = '.csv,.tsv,.txt';

/**
 * STOIC-2200: loading a roster in one go.
 *
 * It always previews before it writes. A bulk insert into a live roster is the
 * kind of thing someone does once, quickly, from a file they did not make - so
 * the screen shows exactly what is about to happen, including which lines are
 * being left out and why, and only then offers the button that commits it.
 */
export default function RosterImportDialog({ open, site, onClose, onImported }) {
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const reset = () => {
    setRows(null);
    setFileName('');
    setPreview(null);
  };

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const ingest = async (text, name) => {
    const parsed = parseRosterText(text);
    if (!parsed.rows.length) {
      toast.error('That file has no rows.');
      return;
    }
    setRows(parsed.rows);
    setFileName(name);
    setBusy(true);
    try {
      // Dry run first: nothing is written until the admin has seen this.
      const res = await apiPost('/api/students/import', { site, rows: parsed.rows, dryRun: true });
      setPreview(res.data);
    } catch (err) {
      toast.error(err.message);
      reset();
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file) => {
    if (!file) return;
    await ingest(await file.text(), file.name);
  };

  const commit = async () => {
    setBusy(true);
    try {
      const res = await apiPost('/api/students/import', { site, rows, dryRun: false });
      const { added, revived, skipped } = res.data;
      const parts = [];
      if (added) parts.push(`${added} added`);
      if (revived) parts.push(`${revived} brought back`);
      if (skipped.length) parts.push(`${skipped.length} skipped`);
      toast.success(parts.join(', ') || 'Nothing to import');
      await onImported();
      reset();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const willWrite = (preview?.toAdd ?? 0) + (preview?.toRevive ?? 0);

  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import a roster</DialogTitle>
          <DialogDescription>
            A CSV or a block pasted out of a spreadsheet. Name, age, and birthdate if you have it —
            a header row is used when there is one. Nothing is written until you confirm.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto pr-1">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(event) => onFile(event.target.files?.[0])}
          />

          {!preview && (
            <>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border-strong px-4 py-7',
                  'text-center transition-colors hover:border-primary hover:bg-surface-sunken'
                )}
              >
                <FileUp className="h-5 w-5 text-muted-foreground" />
                <span className="text-[13px] font-semibold text-foreground">Choose a file</span>
                <span className="text-[12px] text-muted-foreground">CSV, TSV or a plain text list</span>
              </button>

              <div className="flex flex-col gap-1.5">
                <span className="text-[12px] font-medium text-foreground">…or paste the rows</span>
                <textarea
                  rows={5}
                  placeholder={'Ana Perez, 9\nLuis Gomez, 10'}
                  onPaste={(event) => {
                    const text = event.clipboardData.getData('text');
                    if (text.trim()) {
                      event.preventDefault();
                      ingest(text, 'pasted rows');
                    }
                  }}
                  className={cn(
                    'w-full rounded-md border border-input bg-card px-3 py-2 text-[13px] text-foreground',
                    'outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring'
                  )}
                />
              </div>
            </>
          )}

          {preview && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5 rounded-md bg-surface-sunken px-3 py-2.5">
                <span className="truncate text-[12.5px] font-medium text-foreground">{fileName}</span>
                <span className="ml-auto shrink-0 text-[12px] text-muted-foreground">
                  {preview.total} {preview.total === 1 ? 'row' : 'rows'} read
                </span>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <Summary label="To add" value={preview.toAdd} tone="good" />
                <Summary label="Coming back" value={preview.toRevive} tone={preview.toRevive ? 'good' : 'plain'} />
                <Summary label="Skipped" value={preview.skipped.length} tone={preview.skipped.length ? 'warn' : 'plain'} />
              </div>

              {preview.toRevive > 0 && (
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  “Coming back” are students who were removed before. They keep the counts already filed
                  under their name instead of arriving as new people.
                </p>
              )}

              {preview.skipped.length > 0 && (
                <div className="flex flex-col gap-1.5 rounded-lg border border-warning-border bg-warning-soft p-3">
                  <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-warning-text">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    These lines are being left out
                  </span>
                  <ul className="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
                    {preview.skipped.map((s) => (
                      <li key={s.line} className="text-[12px] leading-relaxed text-warning-text/90">
                        <span className="font-mono">line {s.line}</span>
                        {s.name ? ` · ${s.name}` : ''} — {s.reason}
                      </li>
                    ))}
                  </ul>
                  <span className="text-[11.5px] text-warning-text/80">
                    The rest still imports. Fix these and run it again if you need them.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy}>
            Cancel
          </Button>
          {preview && (
            <Button variant="outline" onClick={reset} disabled={busy}>
              Choose another
            </Button>
          )}
          <Button onClick={commit} loading={busy} disabled={!preview || willWrite === 0}>
            {!busy && <Upload />}
            {willWrite > 0 ? `Import ${willWrite}` : 'Nothing to import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Summary({ label, value, tone }) {
  return (
    <div
      className={cn(
        'flex flex-col gap-0.5 rounded-lg border p-3',
        tone === 'good' && 'border-success-border bg-success-soft',
        tone === 'warn' && 'border-warning-border bg-warning-soft',
        tone === 'plain' && 'border-border bg-card'
      )}
    >
      <span
        className={cn(
          'text-[20px] font-bold tabular-nums leading-none',
          tone === 'good' && 'text-success-text',
          tone === 'warn' && 'text-warning-text',
          tone === 'plain' && 'text-muted-foreground'
        )}
      >
        {value}
      </span>
      <span
        className={cn(
          'text-[11.5px] font-medium',
          tone === 'good' && 'text-success-text',
          tone === 'warn' && 'text-warning-text',
          tone === 'plain' && 'text-muted-foreground'
        )}
      >
        {label}
      </span>
    </div>
  );
}
