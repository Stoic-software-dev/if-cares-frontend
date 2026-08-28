# Design system — Regular Year 2.0

The visual system every 2.0 screen is built with (STOIC-2202). It mirrors the
Summer app — same surfaces, cards, typography and layout DNA — with **teal** as
the Regular Year brand hue so the two apps read as one product family while
staying distinguishable at a glance. No screen may be built outside this system.

Living reference: the screens on the `v2-mock` branch (`npm run dev`) and the
approval canvas shared with IF Cares.

## Tokens

Defined as CSS variables in `src/app/globals.css`, consumed through the
Tailwind theme (`tailwind.config.js`). Components never hardcode colors.

| Token | Value | Use |
|---|---|---|
| `--primary` | teal-700 `#0f766e` | Buttons, links, active nav, focus, "today" |
| `--ring` | teal-600 `#0d9488` | Focus rings |
| `--background` | slate-50 `#f8fafc` | Page background |
| `--foreground` | slate-800 | Body text |
| `--border` / `--input` | slate-200 / slate-300 | Card borders / control borders |
| `--muted-foreground` | slate-500 | Secondary text |
| `--success` | emerald | Submitted, active status |
| `--destructive` | red-600 | Errors, missing |
| `--warning` | amber | Corrected |
| `--info` | blue | Holidays, neutral information |
| `--radius-*` | 6 · 8 · 10 · 14 · 18px | xs controls, sm chips, md controls, lg cards, xl sheets |
| `--shadow-1..3` | tinted to the surface hue | e1 rests, e2 lifts, e3 floats (popovers, dialogs) |
| `--ease-out` / `--dur` | `cubic-bezier(.2,.8,.2,1)` / 120-280ms | Every transition in the product |

Each status family carries four values, not one: `--x` (fill), `--x-soft`
(tint), `--x-border` (hairline) and `--x-text` (readable text on the tint). That
is what lets a submitted day, a badge and an alert use the same language while
all of them keep WCAG AA contrast.

**Both themes are real.** Light is the default; dark is defined token for token
in the same file and picked with the navbar control (light / dark / follow the
device), written before first paint so a dark session never flashes white. No
screen may hardcode a color, because that is what breaks in the other theme.

Swapping the brand hue is a one-line token change; nothing else moves.
Typeface: **Inter** (next/font). Numbers in tables, totals and calendars use
`tabular-nums`.

## Component library

shadcn/ui primitives in `src/components/ui/`, restyled onto the tokens above
(button, input, textarea, label, select, checkbox, radio-group, switch, table,
dialog, sheet, drawer, tabs, badge, card, skeleton, alert, separator,
dropdown-menu, popover, calendar, form, sonner, tooltip) plus the pieces this
product added:

- `ui/field` — `Field` (label above, control, hint or error below) and
  `NativeSelect`, so every form block has the same shape.
- `ui/segmented` — segmented control with counts; the active pill slides.
- `ui/search-input` — search field with a clear affordance.
- `ui/states` — `EmptyState`, `ErrorState`, `ListSkeleton`.
- `ui/confirm-dialog` — the three-state confirmation for destructive actions.
- `ui/progress` — determinate and indeterminate bars.
- `common/UnsavedGuard` — browser prompt on reload plus the product's own
  dialog for in-app navigation while work is unsaved.

Shell:

- `shell/AppShell` — the frame every signed-in screen renders inside: sticky
  desktop bar, phone bar, phone tab strip, More sheet, command palette.
- `shell/CommandPalette` — ⌘K jump list over sections and every visible site.
- `shell/SiteSwitcher` — searchable site picker; static label with one site.
- `shell/PageHeader` — back link, title, one line of context, actions.
- `shell/UserMenu` / `shell/ThemeToggle` / `shell/ThemeProvider` — identity and
  the light / dark / system control.
- `shell/BrandMark` — the wordmark, inverted in dark mode.
- `shell/nav.js` — the one source of truth for navigation and active state.

Screens:

- `dashboard/MonthCalendar` + `CalendarLegend` — the month grid and its states.
- `dashboard/MonthPicker` — month and year in one popover.
- `meal-count/RosterRow` + `MarkToggle` — one student, one row, meal toggles
  limited to the meals that day serves.
- `meal-count/SignatureField` — signature pad with real-stroke validation.
- `requests/StatusBadge` — New / In progress / Resolved.

## Rules that keep it consistent

- **Flat, no glows**: no colored box-shadows on buttons or logos; cards use a
  1px `slate-200` border, `shadow` only where elevation means something.
- **Status by tint**: calendar days tint the whole cell (emerald-50 submitted,
  red-50 missing, 2px teal ring today, plain for no service) with the number as
  the protagonist; labels appear from `md` up.
- **Toggles look like toggles**: on = solid teal with a check; off = white with
  a `slate-300` border (never gray fill — gray means disabled); needs-attention
  = dashed red border.
- **Disabled is gray**: `slate-200` background, `slate-400` text. Never a washed
  brand color.
- **Validation pattern** (attacks incomplete submissions): one plain-language
  summary above the submit button, every missing item highlighted in place,
  submit disabled until complete. Errors appear after the first attempt, not
  while typing.
- **Touch-first**: interactive targets ≥ 44px, form text ≥ 16px on phones, no
  horizontal scroll anywhere; wide tables scroll inside their own container.
- **Toasts** follow the system (white card, slate border, emerald check) and
  are pinned light — they never inherit the OS theme.
- **Loading/empty/error**: skeleton placeholders in the final layout (no
  spinners that jump), empty states with one sentence and an action, error
  states with a visible Try again.
- Icons are lucide (stroke), 15–22px. No emoji as UI.

## Patterns from the Summer-parity review

From the 28-Aug-2026 review (`SPECS.md` §11). The ones marked **built** ship in
the redesign; the rest are specified here so the screens that need them are built
inside the system instead of inventing a one-off.

- **Calendar day states — built.** submitted / missing / today / upcoming /
  holiday / no-service. Status is a tint plus a written label, never color
  alone; a no-service day keeps the faintest surface so the grid stays a grid.
  The holiday state renders the holiday name and lights up as soon as the
  holidays endpoint exists.
- **Destructive confirmation — built** (`ui/confirm-dialog`). Confirm (saying
  exactly what the action takes with it) → working → result, with the failure
  returning to the confirm state carrying the reason. Never a bare
  `window.confirm`, never a destructive action one tap away.
- **Unsaved-work guard — built** (`common/UnsavedGuard`). The browser's own
  prompt on reload or tab close, and the product's dialog for in-app navigation,
  where the default action is to stay.
- **Admin list pattern — built.** Search, segmented status filter, native
  selects for secondary filters, counters, pagination: same order and placement
  on Users, Sites, Requests and Reports.
- **Long-job feedback — partially built.** `ui/progress` carries both the
  determinate and indeterminate bars, and the month export drives the first one
  file by file. The server-side job with polling arrives with the reports module.
- **Multi-scope selection — built** for closing days across sites (radio
  all/pick plus a filtered checkbox list); the holiday version reuses it, adding
  the meal scope.
- **Approved badge** (only if the approval flow is confirmed): success pill with
  a check on the day cell and on the count detail; once approved, Correct
  disappears and only Void remains.
- **Public signature screen** (`/sign/[token]`): the one screen with no navbar and
  no session — PDF preview, signature pad, certification text, and a success
  state that shows the signed document. Same tokens; it must still look like the
  app to whoever opens the emailed link.

## Legacy kits

MUI, NextUI, Flowbite, DaisyUI, FontAwesome, Heroicons, Formik and Yup remain
only in the v1 screens and are **prohibited** in 2.0 code (see CODESTYLE.md).
They leave the bundle when the old screens are deleted at cutover.
