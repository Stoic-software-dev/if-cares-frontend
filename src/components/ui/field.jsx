'use client';

import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

// One shape for every form control: label above, control, hint or error below.
// Errors replace the hint so the block never changes height twice.
export function Field({ label, hint, error, required, htmlFor, className, children, ...props }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)} {...props}>
      {label && (
        <Label htmlFor={htmlFor} className="flex items-center gap-1.5">
          {label}
          {required && <span className="text-destructive-text">*</span>}
        </Label>
      )}
      {children}
      {error ? (
        <span className="flex items-start gap-1.5 text-xs font-medium text-destructive-text">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" />
          {error}
        </span>
      ) : hint ? (
        <span className="text-xs leading-relaxed text-muted-foreground">{hint}</span>
      ) : null}
    </div>
  );
}

// Radix reserves the empty string to mean "nothing is chosen", so an option
// that legitimately means "none" - Every state, No state, Select a type - needs
// a value of its own. It is swapped back to '' before the caller ever sees it.
const EMPTY_OPTION = '__empty__';
const toItemValue = (value) => (value === '' ? EMPTY_OPTION : value);
const fromItemValue = (value) => (value === EMPTY_OPTION ? '' : value);

/** Every <option> in the tree, in order, flattened out of maps and fragments. */
function collectOptions(children) {
  const options = [];
  const walk = (nodes) => {
    React.Children.forEach(nodes, (child) => {
      if (!React.isValidElement(child)) return;
      if (child.type === 'option') {
        options.push({ value: String(child.props.value ?? ''), label: child.props.children });
        return;
      }
      if (child.props?.children) walk(child.props.children);
    });
  };
  walk(children);
  return options;
}

/**
 * A select that looks like the rest of the app.
 *
 * This was a real <select>, on the grounds that the OS picker is faster on a
 * touch device. What that also means is that the list is drawn by the operating
 * system and nothing here can touch it: on the reminder screen it came up white
 * over a dark interface, wider than the field it belonged to and overlapping the
 * card behind it. That is every select in the app, not one of them - the state
 * and sort filters on Sites, the role and site filters on Users, the inbox
 * filters, the month, year and state of a claim, and the two on the request
 * form.
 *
 * So it renders the app's own Select now, in one place rather than at sixteen
 * call sites. It keeps taking plain <option> children, because that is the
 * shape every screen already passes and the least surprising thing to read, and
 * it keeps reporting changes as `{ target: { value } }` so callers that do
 * `Number(event.target.value)` carry on working.
 */
export const SelectField = React.forwardRef(
  ({ className, children, value, onChange, id, disabled, ...props }, ref) => {
    const options = collectOptions(children);
    const current = toItemValue(String(value ?? ''));

    return (
      <Select
        value={current}
        onValueChange={(next) => onChange?.({ target: { value: fromItemValue(next) } })}
        disabled={disabled}
      >
        <SelectTrigger ref={ref} id={id} className={className} {...props}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={toItemValue(option.value)}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
);
SelectField.displayName = 'SelectField';
