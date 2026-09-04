'use client';

import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
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
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { apiPut } from '@/lib/api-client';
import { SITE_STATES_PATH, invalidate } from '@/lib/data-cache';

// The states a site can be filed under, edited in place.
//
// It is a short list that changes once a year at most, so it is a dialog on the
// screen that uses it rather than a settings page of its own: an administrator
// finds it while looking at the field it fills.
export default function StatesDialog({ open, onOpenChange, states, onSaved }) {
  const [draft, setDraft] = useState([]);
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);

  // Reopening starts from what is actually on file, not from an abandoned edit.
  useEffect(() => {
    if (open) {
      setDraft(states ?? []);
      setCode('');
    }
  }, [open, states]);

  const add = () => {
    const next = code.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(next)) {
      toast.error('A state is a two letter code, like TX.');
      return;
    }
    if (draft.includes(next)) {
      toast.error(`${next} is already on the list.`);
      return;
    }
    setDraft([...draft, next].sort());
    setCode('');
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiPut(SITE_STATES_PATH, { states: draft });
      invalidate(SITE_STATES_PATH);
      onSaved?.(res.data.states);
      toast.success('States saved');
      onOpenChange(false);
    } catch (err) {
      // The refusal that matters is "still in use", and it names the sites, so
      // it is worth reading rather than replacing with something generic.
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>States</DialogTitle>
          <DialogDescription>
            A claim is filed per state, so this list is what the site form offers. A state that sites
            are still filed under cannot be removed.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {draft.length === 0 && (
              <span className="text-[13px] text-muted-foreground">No states on the list yet.</span>
            )}
            {draft.map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-muted px-2 py-1 text-[13px] font-semibold text-foreground"
              >
                {item}
                <button
                  type="button"
                  aria-label={`Remove ${item}`}
                  onClick={() => setDraft(draft.filter((entry) => entry !== item))}
                  className="rounded-sm text-muted-foreground outline-none transition-colors hover:text-destructive-text focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>

          <Field label="Add a state" htmlFor="state-code" hint="Two letters, like TX.">
            <div className="flex gap-2">
              <Input
                id="state-code"
                value={code}
                maxLength={2}
                autoComplete="off"
                placeholder="TX"
                onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, 2))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    add();
                  }
                }}
              />
              <Button variant="outline" onClick={add} className="shrink-0">
                <Plus />
                Add
              </Button>
            </div>
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            Save states
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
