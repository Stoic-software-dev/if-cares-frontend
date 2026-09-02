# Data review before the migration. Decisions needed

Draft to send to IF Cares (Kenya). Context: as part of moving the Regular Year app
from spreadsheets to a database, we reviewed all the current data. Before we cut over,
we need a decision on each item below. We include our recommendation in each case, so
approving the list as is works too.

The exact student lists will be shared separately in a private file, since they contain
personal information. They are intentionally not included here.

> **Keep this file honest by regenerating it.** `npm run db:anomalies` reads the live
> database and the import snapshots and prints every item below with current numbers.
> The first draft of this letter went out of date within weeks — two of its seven items
> had already been resolved and one had grown — so check the report before sending.
>
> Last checked against live data: **2 September 2026**.

---

Hi Kenya,

While preparing the migration we did a full review of the data in the current
spreadsheets. Almost everything is in great shape. We found a small number of items
that need a decision from your side before we move over for good. Our suggestion is
included for each one, so if you agree with everything you can simply reply "approved".

**1. About 70 students whose name starts with "ZZ" are still active.**
We understand this prefix is how withdrawn students are marked today. Right now they
still show up in the daily roster that site staff work with, which makes the list longer
than it needs to be.
Our suggestion: mark them inactive under their clean name. Their history stays exactly
as it is, and they stop appearing when staff file a count. Nothing is deleted.

**2. Five accounts look like the same person twice.**

- `kenya@ifcares.com` and `kenya@ifcares.org`
- `jsperoni@itba.edu.arr` and `jsperoni@itba.edu.ar` — the first one has a typo in the
  domain, so any email sent there has never arrived
- `julio@setandforget.io` and `julio@julio.com`
- two more where the same person appears under two addresses

Our suggestion: tell us which address is the real one in each case and we keep only
that account. All notifications will go there.

**3. Two active accounts have never set a password.**
`brenda@ifcares.org` and one test address.
Our suggestion: we send Brenda her setup link, and we remove the test one.

**4. Four leftover site sheets named "Copy of ...".**
Duplicates from previous school years. They are already inactive, so they do not appear
anywhere in the app and no claim can include them.
Our suggestion: leave them as they are. Nothing to do unless you would rather we
delete them outright.

**5. Five days where a spreadsheet's own totals row does not match its own students.**

| Site | Date |
|---|---|
| BGC Cooke | 24 March 2025 |
| BGC Cooke | 12 August 2025 |
| Drexel Academy Pre-K | 10 March 2025 |
| PTNT Christ's Foundry | 9 December 2024 |
| Reed Foundation | 2 May 2025 |

On these days, adding up the individual students gives a different number than the
totals row at the bottom of that sheet. We imported the per-student rows, because that
is the actual record of who ate what.
Our suggestion: no change unless you want to revisit those five days. We are flagging
them so nobody is surprised later.

**6. One site with no state assigned: "Training Only".**
State drives which consolidated claim a site belongs to, so a site without one cannot
appear in a TX or OK claim.
Our suggestion: if this is a training site rather than a real one, leave it. If it is
real, tell us whether it is TX or OK.

None of this blocks the daily operation of the current app. Once we have your answers
we can close this part of the migration.

Thanks!

---

## Resolved since the first draft

Kept for the record, so nobody re-raises them:

- **Six students appearing twice in the same site** — no longer present, 0 today.
- **Two students with a birthdate in 2027** — no longer present, 0 today.
- **"About 134 ZZ students"** — the real number today is 72, of which 70 are active.
  Item 1 above is the current version of this one.
