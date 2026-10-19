'use client';

import { useEffect, useMemo, useState } from 'react';
import { FileUp, MoreVertical, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import RosterImportDialog from '@/components/sites/RosterImportDialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/states';
import { NO_CONNECTION, apiPatch, apiPost } from '@/lib/api-client';

async function apiDelete(path) {
  const res = await fetch(path, { method: 'DELETE' }).catch(() => {
    throw new Error(NO_CONNECTION);
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.result === 'error') {
    throw new Error(body?.message || `Request failed (${res.status})`);
  }
  return body;
}

function StudentDialog({ open, mode, initial, site, onClose, onSaved }) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setAge(initial?.age === null || initial?.age === undefined ? '' : String(initial.age));
    setAttempted(false);
  }, [open, initial]);

  const nameValid = name.trim().length > 1;
  // Age is not optional in practice: the API needs an age or a birthdate, and
  // this dialog never collects a birthdate. Saying "Optional" and then refusing
  // to save was the worst of both.
  const ageValid = age !== '' && Number(age) >= 0 && Number(age) <= 120;

  const save = async () => {
    if (!nameValid || !ageValid) {
      setAttempted(true);
      return;
    }
    setSaving(true);
    try {
      if (mode === 'create') {
        await apiPost('/api/students', { name: name.trim(), age: age === '' ? undefined : Number(age), site });
        toast.success(`${name.trim()} added to the roster`);
      } else {
        await apiPatch(`/api/students/${initial.id}`, {
          name: name.trim(),
          age: age === '' ? undefined : Number(age),
          site,
        });
        toast.success('Student updated');
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Add student' : 'Edit student'}</DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'The roster renumbers itself alphabetically, the same way the current app does.'
              : 'Counts already submitted keep the name they were submitted with.'}
          </DialogDescription>
        </DialogHeader>

        <Field
          label="Full name"
          htmlFor="student-name"
          error={attempted && !nameValid ? 'Enter the full name.' : undefined}
        >
          <Input
            id="student-name"
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Last, First"
            aria-invalid={attempted && !nameValid}
          />
        </Field>

        <Field
          label="Age"
          htmlFor="student-age"
          hint="Used to group the roster by age."
          error={attempted && !ageValid ? 'Use an age between 0 and 120.' : undefined}
        >
          <Input
            id="student-age"
            type="number"
            min="0"
            max="120"
            inputMode="numeric"
            value={age}
            onChange={(event) => setAge(event.target.value)}
            aria-invalid={attempted && !ageValid}
          />
        </Field>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            {mode === 'create' ? 'Add to roster' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// One site's roster, with everything that changes it: search, add, edit,
// remove and import. The administrator reaches it from a site's page and the
// site's own staff from Roster in the navigation, so both keep the same rules.
export default function RosterManager({ site, roster, onChanged }) {
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState(null);
  const [importing, setImporting] = useState(false);
  const [removing, setRemoving] = useState(null);

  // A search typed for one site means nothing on the next.
  useEffect(() => setQuery(''), [site]);

  const visibleRoster = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!roster) return [];
    if (!q) return roster;
    return roster.filter((student) => student.name.toLowerCase().includes(q) || String(student.number) === q);
  }, [roster, query]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Find a student" className="sm:w-80" />
        <Button variant="outline" className="sm:ml-auto" onClick={() => setImporting(true)}>
          <FileUp strokeWidth={2.2} />
          Import roster
        </Button>
        <Button onClick={() => setDialog({ mode: 'create' })}>
          <Plus strokeWidth={2.4} />
          Add student
        </Button>
      </div>

      {!roster && (
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-12 rounded-md" />
          ))}
        </div>
      )}

      {roster && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="divide-y divide-border">
            {visibleRoster.map((student) => (
              <div
                key={student.id}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/30"
              >
                <span className="w-7 shrink-0 text-[12px] font-semibold tabular-nums text-muted-foreground">
                  {student.number}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-foreground">
                  {student.name}
                </span>
                {student.age !== '' && (
                  <Badge size="sm" variant="neutral">
                    Age {student.age}
                  </Badge>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${student.name}`}>
                      <MoreVertical />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onClick={() => setDialog({ mode: 'edit', initial: student })}>
                      <Pencil />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem destructive onClick={() => setRemoving(student)}>
                      <Trash2 />
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>

          {visibleRoster.length === 0 && (
            <EmptyState
              icon={Users}
              title={roster.length === 0 ? 'The roster is empty' : 'No student matches'}
              description={
                roster.length === 0
                  ? 'Add students one by one, or import the whole list at once.'
                  : `Nothing matches “${query.trim()}”.`
              }
              action={
                roster.length === 0 ? (
                  <Button size="sm" onClick={() => setDialog({ mode: 'create' })}>
                    <Plus />
                    Add the first student
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                    Clear search
                  </Button>
                )
              }
            />
          )}
        </div>
      )}

      <StudentDialog
        open={Boolean(dialog)}
        mode={dialog?.mode}
        initial={dialog?.initial}
        site={site}
        onClose={() => setDialog(null)}
        onSaved={onChanged}
      />

      <RosterImportDialog
        open={importing}
        site={site}
        onClose={() => setImporting(false)}
        onImported={onChanged}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove ${removing?.name ?? ''} from the roster?`}
        description="This deletes the student. There is no undo, and no list of removed students to restore from."
        consequences={[
          'Counts already submitted keep this student exactly as they were filed.',
          'The roster renumbers itself alphabetically afterwards.',
          'Adding them back later means typing them in again, as a new student.',
        ]}
        confirmLabel="Remove student"
        onConfirm={async () => {
          await apiDelete(`/api/students/${removing.id}`);
          await onChanged();
          toast.success(`${removing.name} removed`);
          setRemoving(null);
        }}
      />
    </div>
  );
}
