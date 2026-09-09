# Changelog

All notable changes to Callander, newest first.

Collated from the [GitHub releases](https://github.com/zcallan/callander-obsidian/releases). Versions marked *(tag only)* shipped as a tag without published release notes; their entries are reconstructed from the commits they contain.

## 1.9.1 — 2026-09-09

### Plans

- **Tapping a person opens their ledger** — every cost they're charged for, how each was split, the credits coming off, and the total left to pay. It replaces the read-only breakdown that used to sit behind a per-row button.
- **Settling happens there now.** Tick a line as somebody hands that share over, or mark the lot settled in one go. The figure moves as you go, so a person who's square reads $0.00.
- That replaces the checkbox on the "who owes what" row, which set a plan-level "done" flag that never touched the arithmetic — a person marked paid stayed struck through while still showing what they used to owe. The flag is still read, so anyone ticked off under the old scheme keeps showing as settled, but nothing writes it any more. The box is an indicator, and the whole row opens the ledger.
- **Who owes what is no longer behind a disclosure.** Its summary line existed to carry the outstanding total while the list was hidden; the heading carries it now.
- **Expenses and credits each get their own heading.** A credit was rendering in the same list as the costs, which made money coming off look like one more cost going on.
- Rows in "who owes what" are larger and easier to read, and your own row is marked as what it is — a slashed box and a struck-through figure, since you can't owe yourself.
- A credit with no note written on it says so rather than leaving the line blank, and the same figure no longer renders with a hyphen in one place and a true minus in another.

### Events

- **A 🏀 Sports event type**, between Activity and the generic Event.

### Settings

- **A Quick action turned off no longer comes back.** Hiding a ribbon icon removed its element but left Obsidian's own ribbon entry pointing at it, and the ribbon rebuilds itself from those entries on every change — so turning one action off and another on brought the first one back. Icons are now hidden rather than detached, and an action left off since install is never registered at all, which keeps it out of the ribbon popup on phones too.

### Documentation

- The README leads with what the plugin holds rather than five paragraphs of preamble, and gains a **How to Get Started** section.
- **FEATURES gains a Plugin settings section**, and its Expenses and Plans sections are rewritten around the ledger.
- Screenshot captions are centred under their images, and every shot is retaken — including two of the settings tab, which the docs referenced but nobody had ever captured.

## 1.9.0 — 2026-09-08

### Events

- **A Calendar tab** — a month or week grid with events in the squares. Clicking an empty day starts a new event already dated; clicking one that's there opens it. Week is seven day columns rather than an hour grid, because Callander's events carry a flexible date, most have no time, and "Anytime" is a real value — a wall of empty hour rows would claim a precision the notes don't have.
- Month draws only the weeks it touches, so most months don't carry a wholly empty row.
- Narrow panes drop to dots with the selected day listed underneath. It responds to the width of the *pane*, not the window, so a sidebar on a wide monitor behaves like the narrow thing it is.
- Filters moved onto the Upcoming / Past / All line, gained a label, and **now work on the Timeline as well as the List**.

### All friends

- **A B'day Calendar tab** — the year as a month grid, one square per day, with the age each person is turning. Names get a line of their own so you can see who it is at a glance, and clicking anyone opens their briefing rather than navigating away.
- Both new tabs are named **B'day Timeline** and **B'day Calendar**, so they don't read as the same thing as the Events page's.

### People

- **A Pronouns field**, free text, so whatever someone uses goes in as they write it. It sits with the naming fields rather than among the details.

### Dashboard

- **Sections can be reordered** by dragging them in settings, on Obsidian 1.13 and later. A section added by a future update slots in where it ships rather than at the bottom.
- Expenses moves above Groups.
- **Upcoming reaches this week and next**, grouped under headings that say when. Whole weeks rather than a rolling count of days: on a Friday, "the next 14 days" quietly means most of the week after next. The Upcoming window setting retires with it.
- Plan rows drop the estimated total. The Plan page's own cost breakdown is unchanged.

### Everywhere

- **Every page is kept to one reading column**, and the width is the same on all of them — the Diary used to sit narrower than everything else, and the Person, Plan and Group pages weren't capped at all. A button in the top corner widens the page you're on for as long as you're on it, and a setting turns the whole thing off.

## 1.8.0 — 2026-09-07

### All friends

- **A B'day Timeline tab**, alongside List and a stubbed B'day Calendar. A year of birthdays in whole calendar months, so the month you're in is shown complete — on the 20th, a birthday on the 10th is still there, above today, rather than eleven months down the page. Every month gets a heading, quiet ones included, and dots take each friend's first group colour.
- **A birthday recorded to only its month now counts.** It's placed in that month, sorted as the 1st, and reads "Unknown day" rather than printing a date nobody entered. The birthday sort in the List tab uses the same rule, so those people sort with their month instead of falling to the bottom.
- Friends the timeline can't place — no birthday, or only a year — get their own **Unknown birthdays** section under a divider, rather than being summarised as a count. They're friends, not an error message.
- Two more sorts: **Birthday (Jan-Dec)** and **Birthday (Dec-Jan)**, for where in the year a birthday falls rather than how soon it is. The existing sort is renamed **Next birthday** now that the difference is worth naming.
- Glance is on timeline rows too, search and sort share a line, and the page keeps its reading column.

### Events

- **A Timeline tab**, now the default, grouped by how soon rather than by date: This week, Next week, Later this month, then months. Only groups holding something are drawn.
- Looking at **Past** or **All**, every month heading carries its year — a bare "August" beside "August 2025" reads as two different kinds of thing when both are simply months that have been.
- Filters moved onto the Upcoming / Past / All line, gained a label, and **now work on the Timeline as well as the List**.

### Dashboard

- **Upcoming is a timeline**, reaching this week and next. Whole weeks rather than a rolling count of days: on a Friday, "the next 14 days" quietly means most of the week after next.
- The **Upcoming window** setting is gone with it — there's no longer a number to tune.
- Plan rows drop the estimated total; the Plan page's own cost breakdown is unchanged.

### People

- A **Children** field below Siblings, linkable like Parents and Siblings: entries can be `[[Wikilinks]]` with note autocomplete, so they show up in graph view and backlinks.

### Events and plans

- A **🥾 Activity** event type.

### Fixed

- **New dates were recorded on the UTC day, not yours.** From an evening in the US that stamped tomorrow; from a morning in Australia, yesterday. It reached a new diary entry's date (which also names its file), the prefilled date on a group event, the date stamped when an idea is logged as an event, and the once-a-day guard on the birthday digest. Birthdays and "met" dates were never affected — they're plain text, parsed without going through a timezone.

## 1.7.1 — 2026-08-20

### Fixed

- **Groups could silently vanish from an event.** Opening and saving an event that named a group (rather than a person) dropped the group — it wasn't recognised as a valid participant, so it disappeared from the event on save, taking the event off that group's timeline for good, even after re-creating it. Events already affected by this need to be recreated once from the group's page; new ones are unaffected going forward.
- Editing an event from a person's page no longer lets you accidentally remove that person from it — the same protection Add already had.
- Groups render with the correct colour and capitalisation everywhere they're shown — the About section chip, group filters, and group pickers — instead of occasionally showing raw `[[brackets]]` or a mis-cased name for a multi-word group.

## 1.7.0 — 2026-08-19

### Fixed

- **Plugin review blocker resolved.** React DOM 19's bundled preload machinery tripped Obsidian's static scanner ("Found 3 dynamic `<script>` element creations"), even though nothing in Callander reaches that code path. The renderer is now Preact via `preact/compat`, which contains no such code — and the bundle shrinks by roughly 45% as a side effect.

### Person pages

- **Life goals** — a new section under Interests for things a friend wants to do someday ("learn Spanish", "run a marathon"). Add notes, mark one done (it stays listed under "Completed" rather than disappearing), and jump straight to adding an idea or event about it.
- **Parents, Siblings, Friends and Related files** are new fields that accept either a `[[Wikilink]]` to another note or plain text. Linked entries are real, indexed links — graph view and backlinks included — and render as clickable, purple-highlighted links that open in a new tab.
- **Groups are now stored as wikilinks** too, for the same reason: real graph edges and backlinks between a person and their groups. Existing vaults convert automatically the next time each person is saved — no migration step needed.
- Field labels are properly spaced ("Legal name", not "LegalName"), and most fields now have an info button explaining what they're for, with an example — visible only while editing.
- The "About" accordion remembers whether you left it open or closed, across files and restarts.
- Added a **Legal name** field.
- Fixed three fields — Life goals, plus the pre-existing Notes-adjacent extras and Inside jokes — quietly duplicating themselves into the About section despite already having their own place on the page.

### Plans

- Quick idea categories are added through a small dedicated dialog instead of an inline text box, and get proper spacing between groups again.
- Empty days on the Timeline now offer quick-add buttons on hover, prefilled with that day.

### Internal

- **The rest of the Plan and Person pages now render with React**, joining the sections ported in 1.6.0 — Timeline, Cost breakdown, Members, Ideas, Interests, Quotes, and everything else. The view files are substantially smaller as a result, with the day-grouping, row-counting and "who owes what" math extracted into tested, pure functions rather than living inside a render pass.

## 1.6.0 — 2026-08-18

### Plans

- **Quick ideas** — categories are now always-visible toggle chips saved against the plan itself, so one you stop using stays offered for next time. Long-press a category for two seconds to remove it from the plan and every idea carrying it.
- **Possible days** are toggle pills rather than a dropdown, and a run of consecutive days collapses to a range: "Sun 2 Aug - Wed 5 Aug".
- **Duration** is now an hours + minutes pair of dropdowns (5-minute steps) on Travel and on timeline ideas, replacing the free-text field. Existing values like "2h flight" are still read correctly.
- **Accommodation check-in / check-out** — hour pickers under "Additional details", including an explicit "Any time" option distinct from leaving it blank. Rows read "Check in 3pm, 11am out", or "Any time in/out" when that's the answer at both ends.
- **Accommodation rows redesigned** — name and nights on one line, check-in/out and booking status on the other, with only the name truncating. "Need to book" now reads in red. Cost and notes have been dropped from the row summary; both are still in the item's own modal.
- **Timeline rows** show check-in/out on their own line with a 🔑, below the address, and notes are prefixed with 📝.
- The **"Mate's"** accommodation type has been folded into **"Home"**. Existing entries are converted on read — nothing is rewritten until you next save.

### Calendar

- **"Add to calendar"** on events and on plan timeline entries (ideas, travel, accommodation), opening a prefilled Google Calendar entry. Works the same on desktop and phone, with no file to import.
- Event **time** is now hour + minute dropdowns, with an optional **Duration** below it, both feeding the calendar entry's length. Travel and ideas without a duration default to an hour; a stay with no check-in/out becomes an all-day entry across its nights.
- Calendar entries append **"with \<names\>"** to the event name.

### Fixed

- **Views no longer show stale data.** Cancelling an event could leave it on the dashboard until you switched tabs or reloaded — writes reach disk slightly before Obsidian reindexes them, and views were only listening for the write. Every view now also listens for the reindex.

### Internal

- The dashboard's Upcoming and Cost breakdown sections, and the plan's Accommodation section, now render with React 19. Everything else remains as it was; modals are unchanged throughout.
- esbuild 0.17 → 0.28, with component styles moving to CSS Modules.

## 1.5.1 — 2026-08-16

- Added the ability to delete a friend from their "People" page.

## 1.5.0 — 2026-08-16 *(tag only)*

- Delete button on the Person page, with a confirmation step. Published to users as 1.5.1.

## 1.4.1 — 2026-08-13 *(tag only)*

- Rebuilt the example vault and screenshot suite; expanded the README and FEATURES documentation.

## 1.4.0 — 2026-08-10

### Expenses

- Ad-hoc expenses on the Dashboard. Split a one-off cost — dinner, a taxi, groceries — without creating a Plan first.
- Expenses can now be checked off per person, with immediate updates to "Who owes what".
- "Who owes what" hides settled people behind an accordion, showing the remaining balance.
- Expense rows redesigned with improved spacing and layout.

### Events

- The Events page uses filter pills (Upcoming / Past / All) instead of sort options.
- Events can be cancelled as a soft delete, with restoration.
- Dashboard timestamps show relative times like "Today", "Tomorrow", or a countdown.
- Added toggles for adding events to friend timelines or the dashboard.

### Plans

- "Additional details" accordion added to the idea, travel and accommodation modals.
- Short date ranges display as weekday pills instead of dropdowns.
- Time offers "Any time" and "All day" options.
- Quick notes on a Plan can carry a date, and appear on the timeline as purple drafts.
- Accommodation type "Mate's place" renamed to "Mate's", with a new "Other" option.
- "Exact" renamed to "Exactly" in the time precision picker.

### Everything else

- Somedays list rows match Dashboard row sizes.
- People pickers alphabetise by first name.
- Mobile layout fixes for overflow, tap targets and keyboard padding.

## 1.3.0 — 2026-08-03

### Plans

- Accommodation and travel legs can be marked Booked, matching the existing "To book" state.
- Cost breakdown expenses can be marked Settled — settled expenses drop out of "Who owes what".
- Added "By value" and "By receipt" expense-split modes, with secure arithmetic.
- New View modals for plan timeline entries and cost breakdown items.
- Stay summaries read as "3 nights (Thu–Sun)".
- Travel supports Bike, Walking and Running.
- "Add travel" restructured with Name leading and Duration below Time.
- "Copy as text" uses first names only, and never substitutes "Me".

### People pages

- Fun facts are click-to-edit via a modal.
- Quotes and Ideas are stored as plain, readable markdown in the note body instead of frontmatter.
- The Markdown section is a collapsed accordion, with Edit reachable without expanding it.
- Someday view modal restructured, with an auto-saving Notes textarea.
- Notes fields added to Reminder, Person event and plan modals.

### Dashboard

- Upcoming respects a configurable window (default 30 days). Today and tomorrow are highlighted purple; overdue items red.
- Fresh installations seed the folder structure and an example friend on first dashboard open.

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
- **Ideas** — five categories (gift, restaurant, activity, conversation, misc), grouped display, resurfacing dates.
- **Events / Timeline** — flexible-precision dates, met-origin, and checking off an idea logs it as an event.
- **Birthdays** — belated window, daily startup digest, and optional star sign, zodiac and birthstone trivia.
- **Diary** — dated entries, edited natively, linking into friends' timelines.
- **Groups** — multi-group tagging, group-level ideas, member management.
- **Dashboard** — upcoming birthdays, upcoming events and reminders, search, quick actions.
- **Drafts** — zero-friction capture, triaged later into an idea or field.
- **Plans** — trip and hangout containers with ideas, travel, accommodation, packing list and cost splitting.
- **Reminders** — standalone dated reminders shown on the dashboard.
- **Somedays** — a wishlist of ideas that can graduate into a Plan.
- **Quick capture** — a global command to jot a thought against a friend from anywhere.

---

Tags `1.0.2`–`1.0.9` carry 2024 dates and predate Callander's first release; they are leftovers from the plugin template this repository started from and are not Callander versions.
