# Running the program in the new app

A short guide to the office tasks that used to mean opening a spreadsheet. Nothing here
needs a developer any more, and none of it touches a formula.

The short version: **the master spreadsheet is gone, and each thing it held now has a
screen.** Anything you change takes effect immediately, for everyone, with no deploy and
no overnight wait.

---

## Where each spreadsheet task went

| What you used to do | Where it is now |
|---|---|
| Add a site to the `Sites` tab | **Sites** → *New site* |
| Set a site's state (TX or OK) | **Sites** → open the site |
| Add or remove students in a site's `Roster` tab | **Sites** → open the site → the roster is on the page |
| Mark a student as withdrawn with a `ZZ ` prefix | **Sites** → open the site → deactivate the student |
| Wait for the `All Meals` tab to publish tomorrow's dates at 7:45 AM | **Service calendar** → open or close days yourself, months ahead |
| Add a user to the `Users` tab, with their password in a cell | **Users** → *New user*. They get an email and set their own password |
| Change who a site's reminders go to, in the `Reminders` tab | **Users** → assign sites to the person |
| Change the reminder window for a site | **Sites** → open the site |
| Nothing — holidays were not in the system | **Holidays** → add a holiday, for one site or all |
| Build a consolidated claim by hand | **Reports** → *Consolidated claims* |
| Keep the `Reports` tab as the log of what was claimed | **Reports** → every claim you ever built is listed and downloadable |
| Read the request emails and answer them from your inbox | **Requests** → the inbox, with a reply that reaches the site |
| Drag menus into the Drive folder | Unchanged. Keep dragging them into the same folder |

---

## The things worth knowing

### Adding a person

**Users → New user.** You set their name, email, role and which sites they see. You never
set a password: they get a welcome email with a link and choose their own. If the email
does not arrive, open the account and send the link again.

Two roles. An **administrator** sees everything and can correct counts, build claims and
change settings. A **site user** sees only the sites you assigned, and files counts for them.

Someone who leaves gets **deactivated**, not deleted. Their history stays where it is.

### Opening days for a site

**Service calendar.** Pick the site and the month, click the days that have service, and
choose which meals each day serves. Save.

This is the biggest change from the spreadsheets. The old system published one day at a
time, early each morning, so nobody could see next week. Now you set a month, or a term, in
one sitting, and the sites see it.

### Holidays

**Holidays.** A holiday closes a day so it is not counted as missing and nobody is chased
about it. You can close a holiday for every site or for one, and you can close only some
meals if service is partial.

This did not exist before. It matters because of the reminders: a day nobody worked used to
look exactly like a day somebody forgot.

### Correcting a count a site already sent

**Reports** → open the day, or find it from the site's month. Change what is wrong, write a
note saying why, and save.

The original is never overwritten — every correction keeps a snapshot of what the numbers
were before, with who changed them and when. The claim totals follow the corrected numbers,
so a claim built after the fix has the fix in it.

One rule: **an approved count cannot be corrected.** What was approved is what was claimed.
To change it, undo the approval first.

### Claims

**Reports → Consolidated claims.** Pick the month and the state, leave out any site that
should not be in it, and build. It takes a few seconds; the screen shows you where it is.

The claim is saved. You can download it again months later, and if the file is ever missing
from Drive the app rebuilds it from the counts. To have it signed, send the signature link:
whoever signs opens it in their own browser, with no account, and the link works once.

### Requests from the sites

**Requests.** Everything a site asks for arrives here instead of only as an email. You can
filter by status, by site and by date, search across every field, and reply — the site sees
your answer on their screen and gets it by email.

The email you always got still goes out the moment a request arrives, to the same people.
If that ever needs to change, it is a setting now, not a code change.

### Reminders

**Reminder emails.** Turn the daily reminder on or off, pick the hour, choose how many days
back to chase, and add anyone who should be copied on all of them. Each person is only told
about their own sites.

There is a **Preview** button that runs exactly the same search and shows you who would be
written to, without sending anything.

At the bottom of that screen there is a line saying when the scheduler last checked in. If
it says the scheduler has not called in a long time, the reminders are not going out
whatever the settings say — that is worth telling us about.

---

## What has not changed

- **Menus.** Still published by dropping files into the same Drive folder.
- **Counting itself.** The site staff still open the day, mark attendance and meals, sign
  and submit.
- **Your claim paperwork.** Same fields, same foundation ids.
