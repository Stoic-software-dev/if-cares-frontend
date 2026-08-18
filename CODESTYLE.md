# Code Style — IF Cares Regular Year App

Rules for all code in this repo. They exist so the codebase stays production-ready:
readable by anyone on the team, debuggable at 8 AM during a service day, and safe to
change. System-level conventions (dates, API shapes, data model) live in [SPECS.md](SPECS.md) —
this file is about how we write code, not what the system does.

---

## 1. English, everywhere

- All code is in **English**: identifiers, functions, files, comments, log lines,
  error messages, commit messages, Prisma models and fields.
- UI copy is English too — the users (site staff, admins) are English speakers.
- Team docs may be in Spanish; anything that ships or lives inside the code is not.

## 2. Debuggable by default

Code must fail loudly and leave a trail. When something breaks in production we get
one report from the field, usually vague — the code has to tell us the rest.

- **Never swallow errors.** A `catch` either handles the error meaningfully or
  rethrows with added context. An empty catch block is a bug.
- **No silent fallbacks.** Don't default to an empty array/`null` when a fetch or
  query fails — surface the failure to the caller and the UI (retry + visible error).
  The 2026 incidents were silent failures; we don't write those anymore.
- **Log with context**: route, actor email/id, site, entity id — enough to reproduce.
  Writes also go to `AuditLog`. No leftover `console.log` debugging in committed code.
- **Error messages name the problem**: `"Site not found: <name>"`, not `"error"`.
  API writes always return `{result, message}` plus a real HTTP status.
- **Validate at the boundary** with zod, so a bad payload fails at the field that's
  wrong, not three layers deeper.
- **No magic values.** Named constants for roles, statuses, limits. If a number needs
  explaining, it needs a name.
- Prefer boring, explicit code over clever one-liners. Optimize for the person
  reading a stack trace, not the person writing the line.

## 3. Comments: few, technical, necessary

- A comment states a **constraint or invariant the code can't express**: a legacy
  compatibility requirement, a gotcha, a non-obvious "why". Example of a good one:
  `// Legacy clients send text/plain; do not assume JSON content-type.`
- Never narrate what the next line does, never explain syntax, never leave notes to
  a reviewer in the code.
- **No commented-out code.** Delete it — git remembers.
- `TODO` only with a ticket: `// TODO(STOIC-1234): ...`. A TODO without a ticket is
  a decision nobody will ever make.

## 4. Always formatted

- **Prettier is the single authority** on formatting. No manual styles, no debates,
  no mixed conventions. If it's not Prettier-clean, it doesn't get committed.
- ESLint must pass with zero errors. Warnings get fixed or explicitly disabled with
  a one-line reason — never accumulated.
- `npm run build` must succeed before every push. A broken build on `dev` blocks
  everyone.
- Import order: external packages → internal `@/` modules → relative. No unused imports.

## 5. Structure: production-ready

- **Thin route handlers.** Files under `src/app/api/` parse/validate the request and
  call functions in `src/lib/`; business logic never lives in a handler.
- **One responsibility per file.** If a file needs a scroll map, split it.
- Components: shadcn primitives in `src/components/ui/` (don't hand-edit their
  internals casually), feature components grouped by feature. Screens compose
  components; they don't own business logic.
- **No new UI kit libraries.** The design system is Tailwind + shadcn + the approved
  headless list (see SPECS.md §3). Adding a styled component library is a design
  regression, not a shortcut.
- **Database access only through the Prisma client** in `src/lib/`. No raw SQL in
  routes; schema changes only via versioned migrations, and an applied migration is
  never edited.
- **Config via environment variables**, validated at startup. No hardcoded URLs,
  keys, or emails in code. Secrets never touch git — and `migration-data/` (PII)
  never does either.
- **Dead code gets deleted**, not kept "just in case": unused components, old flags,
  the v1 leftovers we replace. Same for dependencies — removing a library means
  removing it from `package.json`.
- Names: `PascalCase` components, `camelCase` functions/variables, `SCREAMING_SNAKE`
  constants, route segments lowercase. File name matches its main export.

## 6. Commits and branches

- Commit summary: `STOIC-####: imperative description in English` — one logical
  change per commit.
- Work on `dev` (or a feature branch), merge to `main` only for deploys. Railway
  deploys `main`; treat every merge to `main` as a production release.
- Never commit with failing build, lint errors, or unformatted files.

## 7. The bar

Every merge should leave the codebase in a state where a new developer could join
tomorrow, read the code without a guided tour, reproduce a bug from its log line,
and deploy `main` without fear. That's what "production ready" means here — it's a
property of the codebase, not of the launch date.
