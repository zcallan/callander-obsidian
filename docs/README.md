# Callander documentation

One file per feature — what it does, how to use it, and everything that isn't obvious from just looking at it. For a shorter narrative tour with screenshots, see [FEATURES.md](../FEATURES.md); for what shipped when across the *whole* plugin, see [CHANGELOG.md](../CHANGELOG.md). Each page here collects only the changelog entries for that one feature.

## Pages

| Page | Covers |
| --- | --- |
| [Dashboard](DASHBOARD.md) | The page you open first — every section, reordering, friend suggestions |
| [Friends](FRIENDS.md) | A friend's page, adding one, and the All friends list/timeline/calendar |
| [Ideas](IDEAS.md) | Ideas, resurfacing, the idea inbox, and interests |
| [Quick notes](QUICK-NOTES.md) | Capturing a thought before deciding what it is |
| [Groups](GROUPS.md) | Circles that assemble themselves from who's tagged into them |
| [Events](EVENTS.md) | Logging anything with a date, event types, bulk import |
| [Calendar](CALENDAR.md) | The full-page calendar, its drawer, and using categories to show/hide/colour/filter |
| [Plans](PLANS.md) | Trips: timeline, accommodation, travel, packing, drafts |
| [Expenses](EXPENSES.md) | Splitting, receipt arithmetic, tax/tip, credits, settling up |
| [Somedays](SOMEDAYS.md) | The undated wishlist, and what actually "fits today" |
| [Diary](DIARY.md) | Writing about a day; automatic linking to people you mention |
| [Settings](SETTINGS.md) | Every setting in the plugin's own tab, and what it changes |
| [Your data](DATA.md) | Folder layout, what's frontmatter vs. body, migrations |

## Commands

Everything below is in Obsidian's command palette, prefixed **Callander:**, and can be given a hotkey.

| Command | Does | See |
| --- | --- | --- |
| Open dashboard | Opens the dashboard | [Dashboard](DASHBOARD.md) |
| Open all friends | Opens the All friends page | [Friends](FRIENDS.md#the-all-friends-page) |
| Add friend | New friend form | [Friends](FRIENDS.md#adding-a-friend) |
| Before seeing a friend (glance) | Pick a friend, see a one-screen briefing | [Friends](FRIENDS.md#before-seeing-someone-the-glance) |
| Add idea for a friend | New idea, asking who it's for | [Ideas](IDEAS.md) |
| Search all ideas | Fuzzy-search every idea, jump to its friend | [Ideas](IDEAS.md#ideas) |
| Quick note (draft) | Jot a thought to sort later | [Quick notes](QUICK-NOTES.md) |
| Open events | Opens the Events page | [Events](EVENTS.md) |
| New event | New event form | [Events](EVENTS.md#logging-an-event) |
| Log a shared event (several friends) | One event onto several friends' timelines | [Events](EVENTS.md#logging-an-event) |
| Open calendar | Opens the Calendar page | [Calendar](CALENDAR.md) |
| Open plans | Opens the Plans page | [Plans](PLANS.md#the-plans-page) |
| Open somedays | Opens the somedays wishlist | [Somedays](SOMEDAYS.md) |
| New someday | New someday form | [Somedays](SOMEDAYS.md#adding-a-someday) |
| Open diary | Opens the diary | [Diary](DIARY.md) |
| New diary entry | New diary entry | [Diary](DIARY.md#writing-an-entry) |
| Log diary entry to friends' timelines | From an open diary entry, add it as an event to every linked friend | [Diary](DIARY.md#logging-an-entry-to-friends-timelines) |
| Export birthday calendar (.ics for Apple Calendar) | Writes everyone's next birthday to an importable calendar file | [Friends](FRIENDS.md#birthday-reminders-and-exports) |
| Generate year in friendships | Writes a recap note for the current year | [Friends](FRIENDS.md#birthday-reminders-and-exports) |

## How each page is laid out

- **Contents**, then **See also** — links to the pages this one leans on or feeds into.
- A screenshot, then **At a glance** — the shortest possible summary.
- The feature itself, broken into short sections rather than long paragraphs, with tables for anything that's really a fixed list (categories, settings, columns).
- **Tips & hidden details** — things that aren't obvious from using the plugin day to day.
- **Screenshots**, when there's more than the one already at the top.
- **Version history** — that feature's own changelog entries, newest first, with the date each version shipped.

## Contributing to these docs

Screenshots come from `examples/screenshots/`, which regenerates against a throwaway seeded vault — see [`tools/screenshots`](../tools/screenshots). Nothing here should describe behaviour without checking it against the actual source first; a claim that turns out to only be half-true is worse than no claim at all.
