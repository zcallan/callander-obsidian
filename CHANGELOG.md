# Changelog

All notable changes to Callander, newest first.

Collated from the [GitHub releases](https://github.com/zcallan/callander-obsidian/releases).
Versions marked *(tag only)* shipped as a tag without published release notes;
their entries are reconstructed from the commits they contain.

## 1.6.0 — 2026-08-18

### Plans

- **Quick ideas** — categories are now always-visible toggle chips saved
  against the plan itself, so one you stop using stays offered for next time.
  Long-press a category for two seconds to remove it from the plan and every
  idea carrying it.
- **Possible days** are toggle pills rather than a dropdown, and a run of
  consecutive days collapses to a range: "Sun 2 Aug - Wed 5 Aug".
- **Duration** is now an hours + minutes pair of dropdowns (5-minute steps) on
  Travel and on timeline ideas, replacing the free-text field. Existing values
  like "2h flight" are still read correctly.
- **Accommodation check-in / check-out** — hour pickers under "Additional
  details", including an explicit "Any time" option distinct from leaving it
  blank. Rows read "Check in 3pm, 11am out", or "Any time in/out" when that's
  the answer at both ends.
- **Accommodation rows redesigned** — name and nights on one line, check-in/out
  and booking status on the other, with only the name truncating. "Need to
  book" now reads in red. Cost and notes have been dropped from the row summary;
  both are still in the item's own modal.
- **Timeline rows** show check-in/out on their own line with a 🔑, below the
  address, and notes are prefixed with 📝.
- The **"Mate's"** accommodation type has been folded into **"Home"**. Existing
  entries are converted on read — nothing is rewritten until you next save.

### Calendar

- **"Add to calendar"** on events and on plan timeline entries (ideas, travel,
  accommodation), opening a prefilled Google Calendar entry. Works the same on
  desktop and phone, with no file to import.
- Event **time** is now hour + minute dropdowns, with an optional **Duration**
  below it, both feeding the calendar entry's length. Travel and ideas without
  a duration default to an hour; a stay with no check-in/out becomes an all-day
  entry across its nights.
- Calendar entries append **"with \<names\>"** to the event name.

### Fixed

- **Views no longer show stale data.** Cancelling an event could leave it on the
  dashboard until you switched tabs or reloaded — writes reach disk slightly
  before Obsidian reindexes them, and views were only listening for the write.
  Every view now also listens for the reindex.

### Internal

- The dashboard's Upcoming and Cost breakdown sections, and the plan's
  Accommodation section, now render with React 19. Everything else remains as
  it was; modals are unchanged throughout.
- esbuild 0.17 → 0.28, with component styles moving to CSS Modules.

## 1.5.1 — 2026-08-16

- Added the ability to delete a friend from their "People" page.

## 1.5.0 — 2026-08-16 *(tag only)*

- Delete button on the Person page, with a confirmation step. Published to
  users as 1.5.1.

## 1.4.1 — 2026-08-13 *(tag only)*

- Rebuilt the example vault and screenshot suite; expanded the README and
  FEATURES documentation.

## 1.4.0 — 2026-08-10

### Expenses

- Ad-hoc expenses on the Dashboard. Split a one-off cost — dinner, a taxi,
  groceries — without creating a Plan first.
- Expenses can now be checked off per person, with immediate updates to "Who
  owes what".
- "Who owes what" hides settled people behind an accordion, showing the
  remaining balance.
- Expense rows redesigned with improved spacing and layout.

### Events

- The Events page uses filter pills (Upcoming / Past / All) instead of sort
  options.
- Events can be cancelled as a soft delete, with restoration.
- Dashboard timestamps show relative times like "Today", "Tomorrow", or a
  countdown.
- Added toggles for adding events to friend timelines or the dashboard.

### Plans

- "Additional details" accordion added to the idea, travel and accommodation
  modals.
- Short date ranges display as weekday pills instead of dropdowns.
- Time offers "Any time" and "All day" options.
- Quick notes on a Plan can carry a date, and appear on the timeline as purple
  drafts.
- Accommodation type "Mate's place" renamed to "Mate's", with a new "Other"
  option.
- "Exact" renamed to "Exactly" in the time precision picker.

### Everything else

- Somedays list rows match Dashboard row sizes.
- People pickers alphabetise by first name.
- Mobile layout fixes for overflow, tap targets and keyboard padding.

## 1.3.0 — 2026-08-03

### Plans

- Accommodation and travel legs can be marked Booked, matching the existing
  "To book" state.
- Cost breakdown expenses can be marked Settled — settled expenses drop out of
  "Who owes what".
- Added "By value" and "By receipt" expense-split modes, with secure arithmetic.
- New View modals for plan timeline entries and cost breakdown items.
- Stay summaries read as "3 nights (Thu–Sun)".
- Travel supports Bike, Walking and Running.
- "Add travel" restructured with Name leading and Duration below Time.
- "Copy as text" uses first names only, and never substitutes "Me".

### People pages

- Fun facts are click-to-edit via a modal.
- Quotes and Ideas are stored as plain, readable markdown in the note body
  instead of frontmatter.
- The Markdown section is a collapsed accordion, with Edit reachable without
  expanding it.
- Someday view modal restructured, with an auto-saving Notes textarea.
- Notes fields added to Reminder, Person event and plan modals.

### Dashboard

- Upcoming respects a configurable window (default 30 days). Today and tomorrow
  are highlighted purple; overdue items red.
- Fresh installations seed the folder structure and an example friend on first
  dashboard open.

### Settings

- Reorganised into Files and folders, Dashboard, Friends, and Cost breakdown.
- Removed the Relationship types editor.

### Fixed

- Idea and Credit deletions persist correctly.
- Belated-birthday and upcoming-window settings apply.
- A newly seeded example friend appears on first dashboard open.

## 1.2.0 — 2026-08-03

- Moved Reminders into separate files.
- UI improvements on the Dashboard, and a new "Dashboard.md" file.
- Fixed modals on iPhone when the keyboard opens.
- Fixed "Copy as text" for Plans, and improved Accommodation for Plans.
- Miscellaneous tweaks.

## 1.1.3 — 2026-07-29

- Fixed the minimum app version.

## 1.1.2 — 2026-07-29

- Version bump. See 1.1.1 for notes.

## 1.1.1 — 2026-07-29

- Updates to the README, plus an example vault and screenshots.

## 1.1.0 — 2026-07-29

- Fixes for the Obsidian plugin review process.

## 1.0.1 — 2026-07-28 — Initial release

- **Friend pages** — name, birthday, relationship, nickname, location.
- **Ideas** — five categories (gift, restaurant, activity, conversation, misc),
  grouped display, resurfacing dates.
- **Events / Timeline** — flexible-precision dates, met-origin, and checking off
  an idea logs it as an event.
- **Birthdays** — belated window, daily startup digest, and optional star sign,
  zodiac and birthstone trivia.
- **Diary** — dated entries, edited natively, linking into friends' timelines.
- **Groups** — multi-group tagging, group-level ideas, member management.
- **Dashboard** — upcoming birthdays, upcoming events and reminders, search,
  quick actions.
- **Drafts** — zero-friction capture, triaged later into an idea or field.
- **Plans** — trip and hangout containers with ideas, travel, accommodation,
  packing list and cost splitting.
- **Reminders** — standalone dated reminders shown on the dashboard.
- **Somedays** — a wishlist of ideas that can graduate into a Plan.
- **Quick capture** — a global command to jot a thought against a friend from
  anywhere.

---

Tags `1.0.2`–`1.0.9` carry 2024 dates and predate Callander's first release;
they are leftovers from the plugin template this repository started from and
are not Callander versions.
