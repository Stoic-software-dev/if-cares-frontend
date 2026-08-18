# Data review before the migration. Decisions needed

Draft to send to IF Cares (Kenya). Context: as part of moving the Regular Year app
from spreadsheets to a database, we reviewed all the current data. Before we migrate,
we need a decision on each item below. We include our recommendation in each case, so
approving the list as is works too.

The exact student lists for items 2, 3 and 4 will be shared separately in a private
file, since they contain personal information. They are intentionally not included here.

---

Hi Kenya,

While preparing the migration we did a full review of the data in the current
spreadsheets. Almost everything is in great shape. We found a small number of items
that need a decision from your side before we move the data over. Our suggestion is
included for each one, so if you agree with everything you can simply reply "approved".

**1. A duplicated site sheet called "Copy of Drexel Academy 2nd Grade".**
It looks like an accidental copy rather than a real site.
Our suggestion: leave it out of the migration.

**2. Six students that appear twice with the same name in the same site.**
Our suggestion: keep a single record for each of them. We will send you the six
names separately so you can confirm.

**3. Two students whose birthdate is in the year 2027.**
That date is in the future, so it looks like a typo.
Our suggestion: we send you the two names and you confirm the correct birthdates.

**4. About 134 students whose name starts with "ZZ".**
We understand this prefix is how withdrawn students are marked today.
Our suggestion: import them as inactive students with the clean name, so the history
is kept but they no longer appear in the daily roster.

**5. Two accounts for you: kenya@ifcares.com and kenya@ifcares.org.**
Our suggestion: tell us which one is the real one and we keep only that account.
All the notifications will go there.

**6. A few test rows in the users list.**
Accounts that were clearly created for testing.
Our suggestion: leave them out of the migration.

**7. Around 64 sheets named "Copy of ..." in the sites folder.**
Mostly duplicates from previous school years.
Our suggestion: leave the copies out. We will double check that none of them contain
real data that is missing from the current sheets before discarding anything.

None of this blocks the daily operation of the current app. Once we have your answers
we can close this part of the migration.

Thanks!
