'use client';

import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
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
import { apiPost } from '@/lib/api-client';
import { cn } from '@/lib/utils';

/**
 * Sending a daily form or a monthly summary out of the screen that shows it.
 *
 * Deliberately the same shape for both, and the same shape as the claim sender:
 * whoever does this once a month should not have to learn it twice.
 */
export default function EmailPdfDialog({ open, onClose, kind, site, date, year, month, label }) {
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTo('');
    setNote('');
    setAttempted(false);
  }, [open]);

  const recipients = to
    .split(/[,;\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
  const valid = recipients.length > 0 && recipients.every((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
  const error = attempted && !valid ? (recipients.length ? 'One of those is not an email address.' : 'Add at least one recipient.') : undefined;

  const send = async () => {
    if (!valid) {
      setAttempted(true);
      return;
    }
    setSending(true);
    try {
      const res = await apiPost('/api/reports/email', {
        kind,
        site,
        to,
        note: note.trim(),
        ...(kind === 'daily' ? { date } : { year, month }),
      });
      toast.success(`Sent to ${res.data.sent} ${res.data.sent === 1 ? 'address' : 'addresses'}`, {
        description: res.data.fileName,
      });
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && !sending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Email this PDF</DialogTitle>
          <DialogDescription>
            {label} goes out as an attachment, exactly the document this screen shows.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field
            label="To"
            htmlFor="email-to"
            hint="Separate several addresses with commas."
            error={error}
          >
            <Input
              id="email-to"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="name@ifcares.org, other@ifcares.org"
              aria-invalid={Boolean(error)}
            />
          </Field>

          <Field label="Note" htmlFor="email-note" hint="Optional. Shown above the attachment.">
            <textarea
              id="email-note"
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              className={cn(
                'w-full rounded-md border border-input bg-card px-3 py-2 text-[13px] text-foreground',
                'outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring'
              )}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={send} loading={sending}>
            {!sending && <Send />}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
