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
| `--radius` | 10px controls · 14px cards | |

Swapping the brand hue is a one-line token change; nothing else moves.
Typeface: **Inter** (next/font). Numbers in tables, totals and calendars use
`tabular-nums`.

## Component library

shadcn/ui primitives in `src/components/ui/` (button, input, label, select,
checkbox, radio-group, textarea, table, dialog, sheet, drawer, tabs, badge,
card, skeleton, alert, separator, dropdown-menu, popover, calendar, form,
sonner, tooltip, switch) plus app components:

- `shell/AppNavbar` — responsive top nav: brand + menu button on phones; links,
  user chip and log-out menu from `md` up. Section links live in `shell/nav.js`.
- `shell/MobileHeader` — phone header for sub-pages (back + title + subtitle).
- `shell/PageHeader` — desktop sub-page header (back link + 30px title).
- `shell/BrandMark` — logo tile + wordmark.
- `dashboard/MonthCalendar` — the month grid with the five day states.
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

## Legacy kits

MUI, NextUI, Flowbite, DaisyUI, FontAwesome, Heroicons, Formik and Yup remain
only in the v1 screens and are **prohibited** in 2.0 code (see CODESTYLE.md).
They leave the bundle when the old screens are deleted at cutover.
