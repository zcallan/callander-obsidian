# Changelog

All notable changes to Callander, newest first.

Collated from the [GitHub releases](https://github.com/zcallan/callander-obsidian/releases). Versions marked *(tag only)* shipped as a tag without published release notes; their entries are reconstructed from the commits they contain.

## 1.11.0 — 2026-09-30

A review of the whole plugin. Most of what changed is fixes, the ways an edit could be lost first. Alongside them: keyboard access everywhere, dates written the Australian way, and interests that need only one field.

### Everywhere

- **Keyboard access.** Every clickable row, calendar day, chip and section header can be reached with Tab and opened with Enter or Space, with a focus ring to show where you are. A page that refreshes keeps your place rather than sending focus back to the top, and buttons that only showed on hover now show when you tab to them.
- **Dates read the Australian way**: "14 March 2019", day first and no comma, on the Met line, birthdays and event dates, where a dozen screens still said "March 14, 2019".
- A date that can't exist, like 30 February or a year like 0099, now reads as no date rather than as the wrong one.
- A page left open overnight rolls over at midnight, so the dashboard no longer shows yesterday's "Today", and the status bar's birthday countdown keeps up through the day instead of staying as it was at startup.
- A search box keeps what you're typing, and where, when its page refreshes from a sync or an edit in another pane.
- A page keeps refreshing after you change the Callander folder in settings, where it used to go quiet until reopened, and a change you make redraws its page once rather than twice.
- Delete buttons are red before you hover them. The calendar drawer's "Show N more" and the AI tag's × are plain again rather than filled buttons, and buttons that had lost Obsidian's keyboard focus ring have it back.
- Callander's phone layout for its forms no longer reaches Obsidian's own Settings or other plugins' dialogs.
- A form that shakes to say a click outside it was ignored flashes instead when Reduce motion is on.
- An action on a page that fails to save (a birthday's Done, filing an inbox idea, logging a diary entry, a list's sort) says so, instead of nothing happening.
- Commands and ribbon icons bring forward a page that was restored in the background, instead of opening a second copy of it.
- If one of Callander's startup steps fails, the others still run, and a notice names the one that failed.
- The vault's root works as the Callander folder: pages refresh, the year recap is written there, and the first run sets up the folders.
- A fresh install no longer says "People folder not found" over and over. It says it once, and only when the Callander folder exists.
- Callander and another plugin that changes how notes open no longer undo each other's changes when one of them is turned off.

### Dashboard

- The dashboard can no longer draw a section twice when two refreshes overlap, as it could on a slow device or in a large vault.
- An event with a duration but no start time stays in Upcoming for its whole day.
- An event dated only to a month or a year no longer reads "today" or "in 1 day" at the start of that month.
- The Diary section notices entries in a diary folder kept outside the Callander folder.
- A section that has just opened no longer misses a change made a moment before.

### Friends

- **A friend's name** is trimmed, and a blank one is refused. Their note's file takes the name with the characters a file can't hold (`\ / : * ? " < > | # ^ [ ]`) swapped for "-", while the name itself stays as you typed it. Renaming follows the same rule.
- Renaming a friend on their page renames once rather than twice, leaves the note alone when the name hasn't changed, and emptying the box no longer shows "Unnamed Contact".
- A change that syncs into a friend's note while you're typing on their page waits until you stop, instead of being lost. Their page also updates when their plans, groups, fellow members or diary mentions change elsewhere, without reopening it.
- "Log on timeline", after ticking off an idea, logs it for the friend whose idea it was, even if you've moved to someone else's page.
- An event saved with "Show on their timelines?" unticked stays off that friend's own page too.
- Editing a life goal from its view keeps the notes you'd just typed there.
- About shows fields set to 0 or false, and a list field, like nicknames, edits as a list, where it showed an empty box and saved back as text.
- The relationship field offers its suggestions, and remembers new ones, without Add friend having been opened first.
- A note with Windows line endings opens properly, rather than showing "No contact data available".
- A tab restored for a friend whose note has gone says so, rather than staying blank.
- In a popout window, a friend's page no longer redraws in the middle of your typing.
- The Chinese zodiac goes by lunar year. A birthday before 21 January is the previous year's animal, and one up to 20 February, when Lunar New Year can fall either side of it, names both.
- "Met … ago" counts the day when there is one: 30 September to 1 September is 11 months, not a year.
- "Last updated" no longer says "-2 days ago" for a note last saved on a device whose clock runs ahead.
- A link written with an alias, `[[Name|Alias]]`, finds its note and shows the alias.
- A 29 February birthday counts down to the right day in the year before a leap year.
- On 29 February, Glance's "Last 12 months" reaches back to 28 February of the year before, rather than stopping a day short.

### All friends

- The list notices deletes and renames straight away, and no longer flashes blank or jumps back to the top when it refreshes.
- A group filter lets go once its group is renamed or deleted, instead of hiding everyone.
- The B'day Calendar shows a 29 February birthday on 1 March in years without one.

### Plans

- **A plan's drafts no longer slide into its Notes.** Reopening a plan could move its Drafts section inside Notes, where an ordinary edit to the notes would delete the drafts. Drafts now stay above Notes, and a plan already affected has its drafts moved back when it's opened.
- Emptying a draft's text no longer makes later edits land on the next draft. An emptied draft keeps what it last said; Discard is how one goes.
- Discarding, converting or deleting a dated draft acts on that draft, not a neighbour, when an earlier draft has no text.
- "Make idea" on a plan's draft opens the Add form, with the plan's days and people to pick from, where it opened as an edit of an idea that didn't exist yet.
- Saving a plan item keeps its exact time. A time like 9:30 no longer saves as 12:30am, and one between the five-minute steps, like 7:07pm, no longer becomes 7pm.
- A plan longer than 62 days stays in Upcoming until it's over, rather than moving to Past partway through.
- A plan whose end date has no year and crosses New Year, 30 December to 2 January, reads as the right days.
- A plan's days no longer lose their last day in time zones whose clocks change at midnight, on the calendar, in the running order or in shared text.
- A plan item's calendar link lasts its full length across the night the clocks change.
- A plan item dated only to a month no longer gets a day of its own in the running order.
- A plan's date line says "yesterday" rather than "1 days ago".
- A travel leg started from an empty day opens as Add, on the first travel type, with the cursor in its name.
- Editing or deleting a plan's expense or credit acts on that one, even if the plan changed while its form was open. If it has gone, nothing is saved and a notice says so.
- Deleting a friend takes them out of plans where they were written with an alias too.
- Quick ideas list their days in date order, once each.
- In shared plans, an unknown travel type no longer prints "undefined", a name that starts with a flag or keycap emoji doesn't get a second emoji, and a free stay says "Free" in every share. Amounts show their cents: "$12.50", not "$12.5".

### Friends and plans

- A friend or plan page saves only the fields you changed, not its whole copy of the note, so it no longer writes over a change that synced in while the page was open.
- Removing a person's last group or a plan's last idea category now saves. Before, the page looked right but the note kept them. Removing a plan's last stay category no longer leaves an empty list in the note.
- Opening another note in the same tab while a save was still running could write one note's details into the other. It no longer can.
- Notes on a person, group or plan stay in the editor if they can't be saved, rather than closing and taking what you typed with them.
- Every content edit marks the note updated: ticking, resurfacing or deleting an idea, filing a draft as one, and editing a quote or a plan draft, as adding and editing already did.

### Groups

- A group whose page has capitals in its name, like `BJJ.md`, is found again: deleting the group removes its page, and changing its colour no longer fails with "File already exists".
- Renaming or deleting a group only touches the people in it. Before, it rewrote every friend's note and marked them all as updated today.
- Renaming a group to a name another group already has is refused before anything changes, and a new group with an existing group's name says so instead of recolouring that group.
- A group name with a character a file can't hold is refused in the form, rather than saved under a name its page can't be found by.
- A group made from Add friend shows its colour on its chip straight away.
- A group's name is spelt everywhere the way its page spells it ("Run Club", not "Run club").

### Ideas

- Adding an idea to a friend can no longer replace all their ideas with the new one if their note can't be read at that moment.
- Filing an inbox idea onto a friend adds it to them before taking it out of the inbox, so a failed save leaves it in both places rather than neither.

### Interests

- **Any one field is enough.** An interest can be just an artist, with no song in mind — or just an author, a platform, a restaurant or a place — and the form says so under the fields.
- The first field says what goes in it: Music asks for a Song, Food for a Dish, and Other for an Interest.

### Expenses

- Editing, ticking off or deleting a dashboard expense acts on that expense even if the list changed while it was open, from a sync or another window. If it has gone, nothing is saved and a notice says so.
- Editing an expense keeps who has paid and whether it's settled when only its label changes. Changing the amount, the split or the people clears them, and the form says so.
- Deleting an expense from its edit form asks first, like everywhere else, and so does deleting a credit.
- Two quick ticks in an expense no longer lose the first.
- Someone square to the cent shows as $0.00, not "−$0.00".
- Shares written into a note as text, like `"25"`, add up as numbers instead of reading "$2510.00".
- Copy text works in the dashboard's expense view.

### Events

- The move from reminders to events no longer deletes a note of your own called `Reminders.md`, or an empty `Reminders` folder, in your Callander folder.
- Editing a logged diary entry keeps its event off people's timelines if you'd taken it off.
- Reminder notes that sync in from a device still on an older version are sorted into calendar entries and timeline records straight away, rather than at the next launch.
- A stray quote in a CSV import, as in `12" pizza`, no longer merges the rows after it into one event.
- A note in Events whose properties can't be read no longer turns off birthday reminders and the status bar on every start. It's skipped and left as it is.
- Typing in search on the Events or Plans page keeps the Timeline or Calendar tab you're on, rather than swapping in the List.
- Opening an event's note opens it on the Events page whatever tab, filter or search is showing, and no longer pops it open again some later day.
- Plans on the Events page sort by their own dates under Oldest and Last updated, instead of all sinking to the end.
- The Events page shows a friend's new display name without waiting for an event to change.
- `mailto:`, `tel:` and `sms:` links open and share as themselves, not as `https://mailto:…`.
- An event's Google Calendar link lasts its full length across the night the clocks go back.
- Renaming an event category to one that already exists warns that the two will merge, and keeps the existing one's colour.
- Bulk import keeps line breaks inside a quoted cell without stray characters, and stores time zones in their proper form ("Europe/Madrid").
- The birthday calendar export puts 29 February on 1 March in common years rather than writing a date that doesn't exist, and friends whose names use no Latin letters, or look alike, each keep their own entry.
- The year recap links each friend's own note, counts a hangout with three friends once, leaves out cancelled events, and says "1 entry" rather than "1 entries". The calendar export and bulk import count in the singular too ("1 event").

### Calendars

- Month paging no longer skips a month or stalls on the 29th–31st, on the Calendar page, the Events page's Calendar tab and the B'day Calendar.
- On a phone's month view, a plan's last day in the next week's row shows its date range, as a wide screen does.
- At a width right around 620 pixels, the calendar no longer shows its wide and narrow layouts at once.

### Somedays

- Saving a someday keeps people linked with an alias (`[[Name|Alias]]`) or through a group page.
- A double click on a sub-idea's remove button removes one sub-idea, not two.
- Today and Tomorrow check a someday's window, season and date, as This weekend already did. On the last day of autumn, Today offers the autumn somedays and Tomorrow the winter ones.
- Opening a someday's note opens it even when a search or filter hides it.
- A negative estimated cost isn't saved.

### Diary

- The Diary page shows a new entry straight away, and redraws once per save rather than twice.
- Editing a logged diary entry updates its event with the friends it mentions now, read once Obsidian has resolved the entry's links.

### Forms

- Save, Add and Delete can't run twice from a double click or a second Enter, so there are no more duplicate notes, and no second entry deleted along with the first.
- A save that fails says so, and the form stays open with what you entered. Before, most failed silently. Adding a friend under a name that's taken is one case.
- Notes typed into a view (an event, someday, plan item, life goal or draft) that can't be saved as it closes now say so too.
- A stray click outside a form no longer throws away edits made only with chips, pills, steppers or colour swatches.
- Enter pressed to confirm Japanese or Chinese input no longer submits the form half-typed.
- "Additional details" opens from the keyboard.
- A birthday entered as month and day refuses a day its month doesn't have, like 31 February.
- A confirmation that shortens a long name no longer cuts an emoji in half at the end.

### Settings

- On Obsidian 1.13, clearing a number setting keeps its default instead of saving 0, which fell below several settings' minimums.
- On earlier versions of Obsidian, the settings tab has "Friend suggestions shown" too.
- "Your name" is trimmed of stray spaces.

### Internal

- About 500 lines of code nothing used any more are gone, among them a plan calendar export with no button, two fields worked out for every friend on every read and then never shown, and a second copy of the emoji splitter. So are 720 lines of stylesheet rules that no element could match.
- Comments that had drifted from the code, or sat on the wrong function, are corrected or moved to the one they describe.
- Tests, lint and a build run on every push and pull request, and a release now waits for them to pass.
- The contact page, the dashboard and the plugin's startup are split into modules, every page refreshes the same way, and the tests grew from about 2,070 to 2,670.
- The released `styles.css` is minified, so it has no comments. The commented source is `src/styles/base.css` in the repository, for anyone writing a CSS snippet against it.
- Icon names are checked against the installed Obsidian before a release.
- Pages let go of what they rendered each time they redraw, where some held on to it until they were closed.

## 1.10.6 — 2026-09-27

### Dashboard

- An event with a start time and a duration leaves Upcoming once it's over, instead of staying until midnight. A 3:30pm game running 3h 15m is gone by 6:45pm. Without a duration, an event still stays until the end of its day, and a task that runs past its duration moves to Overdue rather than disappearing.

### Docs

- **A new `docs/` folder**, one page per feature — Dashboard, Friends, Ideas, Quick notes, Groups, Events, Calendar, Plans, Expenses, Somedays, Diary, Settings and Your data — each with tips that aren't obvious from the plugin itself and its own version history. The index lists every command.
- FEATURES.md and the README no longer say a plain-text name links a diary entry to a friend (it takes a `[[link]]`), or that accommodation has a decide-by date.

## 1.10.5 — 2026-09-26

- Dropped a CSS property from an interest's note tooltip that only some Obsidian versions fully support — no visible change, it was redundant anyway.
- Internal: mobile screenshots for the dashboard, events, calendar, friend and plan pages, and the tooling that captures them.

## 1.10.4 — 2026-09-26

### Dashboard

- A birthday due today now shows a bold "Today!" and a filled Done button in place of the countdown. Done marks it wished for this year, so it drops off today and won't reappear in Missed birthdays tomorrow, but still shows again next year.

### Docs

- README.md and FEATURES.md now cover the Calendar page — events, plans and birthdays together, a month or a week at a time — with new screenshots.

## 1.10.3 — 2026-09-26

### Interests

- The eye button is now a pencil, labelled Edit. A note gets its own purple icon beside it, showing the note straight away on hover instead of after the usual second-long wait.
- Chips are a touch more compact, and their two round buttons are a shade lighter so they read against the chip rather than blending into it, with hover and focus states of their own. Icons sit centred in the button on a phone as well as on desktop.
- Subheadings are now plural — Drinks, Books, Places — matching how Ideas already reads.
- A bit more air between the last chip and "Add interest".

### Events and calendars

- Turning on Edit beside a category's "+ Add" is now a round pencil, the same height as "+ Add", rather than text.

### Dashboard

- A draft's View person, Make idea and Add event buttons get an icon — person, lightbulb, calendar — alongside their label. On a phone the label drops and they shrink to icon-only, so four buttons still fit a row without crowding the draft's text.
- Add friend's placeholders are clearer about what each field is for: the name field, what you usually call them, and the short name used in lists.

### Fixes

- Editing an idea no longer autofocuses its text field and pulls up the keyboard — only adding a new one does, matching every other edit modal.

## 1.10.2 — 2026-09-26

### Plans

- **A Plans page.** Every plan, past and future, with search, Upcoming, Past or All, Timeline or List, and filters for status and who's going. Opened from the dashboard's Plans section or the "Open plans" command.
- Drafts on a plan work like the dashboard's: Make idea, Make event, Edit and Done. Undated ones are kept in a `## Drafts` checklist in the plan's note, and a draft given a day now leads that day in the running order instead of trailing it.

### Events and calendars

- **Categories have colours.** Each shows as a dot on its chip and colours its events on both calendars. Turn on Edit beside "+ Add" to rename, recolour or delete a category; deleting takes the label off every event and leaves the events alone. The colour can also be set when adding one, and the colour picker has a Reset.
- **Timezones.** An event's time can belong to a zone, and it's shown converted to yours, with the original alongside where it matters. A new **Plugin timezone** setting pins every time to one zone; while it differs from your device's, a banner on the dashboard, Events and Calendar pages says so, and can be snoozed.
- Times can be **Anytime** or **TBD** instead of a clock time.
- On a phone, tapping an event on the calendar opens it and selects its day, so closing it leaves that day's list showing. "Emojis on mobile" now starts off.
- The calendar drawers fold a long category list after the first few, behind "Show N more".
- Category sits above Notes in the event form.
- Overdue events stay in Upcoming until they're dealt with, instead of dropping off after a week.
- The edit form's "Copy to…" button is gone; add people in the People field instead.
- Bulk import's instructions are clearer about timezones, and say the example row can be left in.

### Interests

- **Fields that fit the type.** A book asks for its author, music for its artist and genre, food for the restaurant, a place for where it is. Song and Music Genre are now one Music type, and there's a new Place type.
- **Notes on what they like about it**, kept behind the eye button on each chip: hover to read, click to edit or delete. The lightbulb beside it turns an interest into an idea, filed under a matching category.

### Dashboard and friends

- Quick notes and drafts now live in a `## Drafts` checklist in the dashboard note, with a link to the person they're about, and Done ticks them rather than deleting them. Older drafts move there on their own.
- A draft's Edit can change who it's about. Done sits at the right of each draft, Edit beside Add event.
- How many friends are suggested under the search bar is a setting.
- A new group can be made from the Add friend form, and groups get a custom colour option.

### Modals

- The main button (Save, Add, Create) stays in view at the bottom of a long form, and a field beside it can still be tapped. With the keyboard up on a phone it goes back to its place at the end of the form.
- The colour picker's hex field can be typed into from inside a form, and on a phone the picker moves up clear of the keyboard.

### Fixes

- Deleting a friend now takes them off every plan's Who's in, instead of leaving their name there with nothing behind it.
- A friend whose display name was cleared shows their name again instead of a blank chip.

## 1.10.1 — 2026-09-21 *(tag only)*

- Internal: cleared the review bot's CSS and Obsidian-API lint warnings. Hovering a calendar cell no longer re-tests every cell on the board on each pointer move, and an unneeded `!important` is gone. No visible change.

## 1.10.0 — 2026-09-21

### Calendar

- **A full Calendar page.** Events, plans and birthdays together in one month or week view, with a drawer for Display and filter options and its own colour settings.
- **Colour, layered.** Color by category, Color by type and Color by group are each their own toggle, checked by default and applied in that order — the first one that matches an event wins, and anything left over falls back to the purple accent. Every layer opens a modal with a real colour picker (a saturation square and hue strip, not the browser's native input) and a hex field, with a reset back to the default.
- **Color backgrounds** fills the whole event, plan or birthday with its colour instead of just a left border, and picks black or white text automatically so it stays readable.
- **Fade past events** dims anything from yesterday back to 65% opacity, as its own Display setting.
- Event categories: a free-form label set on an event under Additional details, each with its own colour, filterable from the drawer and shown as a pill on the event's view.
- Bulk event import, with an AI-prompt generator to produce the input, duplicate detection, and category assignment on the way in.
- The week view lays out as rows rather than columns, closer to the mobile layout: events get a sensible max width and wrap onto new lines rather than stretching full width.
- Hovering an event or a multi-day plan's bar highlights every row it spans, with a ring in the event's own colour on top of the usual background lift.
- Month/Week and Today shorten to M/W and T on mobile; the week view's day headers spell out the full day name on desktop, and stay sticky at the top of the grid while scrolling on mobile.
- "Emojis on mobile" replaces "Show names on mobile" (default on) — mobile chips lead with the type's emoji instead of a name.
- The Events page's own calendar gets the same drawer, category filters and colour settings as the Calendar page; its Week toggle is hidden (the view itself is still there) now that the Calendar page covers it.
- Plans now show on the Events page's list, timeline and calendar, each visible independently of whether it shows on the dashboard's Upcoming; a plan spanning several days draws as a single bar across the days it covers.
- An event's view modal can grow a plan around it: Make plan seeds a new plan's name, date, people and place from the event, landing it as the first item on the plan's timeline.

### Dashboard

- **A Getting started section** walks through the plugin's core features with a checklist, replacing the single seeded "Example Friend."
- **Upcoming gets its own settings modal**, laid out like Getting started: which calendars to include (Events, Plans), and filters for event type and category.
- Drafts drops the "unfiled" label and gains View person, Make idea and Add event actions per row, with Edit and Done icons in place of a plain delete.
- Upcoming rows drop their "This"/"Next" date prefix, and the section gains a "View all upcoming events" link and a little more breathing room at the page's edges.

### Notes

- Notes move out of frontmatter into a `## Notes` section in the note body, with a small formatting toolbar (bold, italic, highlight, link) and an "Edit markdown" handoff to a real editor.
- An experimental setting switches that editor to Obsidian's own native one for a closer-to-native feel.

### Ideas

- A person's ideas can now be edited in place, not just toggled or deleted — the same capture modal reopens prefilled, with Delete moved beside Save.
- An idea Claude generated carries a small removable tag until it's edited or dismissed.

### Fixes

- A group or person's name containing a bracket (`Sci-Fi [Book Club]`) or similar punctuation no longer breaks its wikilink — it silently failed to resolve, so adding that group to a plan could make it not show up at all. The same fix covers Parents, Siblings, Children, Friends and Related links.

## 1.9.2 — 2026-09-15

### Plans

- **Longer sections fold away.** Ideas, Timeline, Accommodation, What to bring and Cost breakdown each take a chevron, and what you've folded stays folded across every plan. Who's in, Notes and Links & details are short enough to stay put.
- **Copy text, for costs, stays and ideas.** The timeline's share sheet now has siblings: the whole Cost breakdown, a single expense, and a single person's ledger; Accommodation; and Ideas. Each offers only the toggles that change something for it, and the copied text has no overview or emoji, so it pastes cleanly into a chat.
- Costs copy as a chase-up by default: your own share and anything already settled are left out, so what's left is what's still owed. A person's ledger keeps their settled lines, because those explain why their total is smaller than they expected. Credits read as `+$20.00` in with the expenses.
- Stays copy with the nights they cover ("Friday+Saturday night (2 nights)"), their address and notes, and "Need to book" on any that aren't booked yet.
- Ideas copy grouped under their categories, each with its dates and time.
- **Accommodation reads in check-in order**, on screen and in the copy, with undated stays last.
- **Accommodation takes a Category**, like quick ideas do, for a trip with stays in several towns. The two share one chip picker but keep separate lists of categories.
- The timeline's Copy text sits at the foot of its section, apart from the two add buttons. The Accommodation and Ideas buttons no longer sit flush against the last row.

### Events

- **Past reads newest first**, under This week, Last week, Earlier this month, then month and year. Undated events still lead.
- **Calendar chips give the name a line of its own**, so a busy week no longer truncates every chip to the same few characters. An emoji the event's name starts with stands in for its type icon.
- **On a phone, the month grid shows each event's emoji** instead of a dot: three per day, or two and a "+N" count on a busy day. The week view stacks into readable day sections with larger type, and long names wrap instead of overflowing.
- Picking a day on a phone no longer scrolls you back to the top, and changing month clears the day you'd picked. A narrow week view no longer pretends its days can be selected.
- The calendar bar abbreviates long month names on a narrow pane rather than wrapping onto a second row.
- Rows name up to three people, then "+N more", the same as on the dashboard. Search still matches every name.
- The page's subtitle only shows while there are no events.

### Dashboard

- **Plans appear in Upcoming**, alongside events and in date order. Tapping one opens an overview of the trip with a link to the full plan. **"Hide from this list"** removes a single plan from Upcoming, and **Show in Upcoming** on its row in Plans brings it back. A setting turns plans in Upcoming off altogether.
- Rows name up to three people, then "+N more", and plan rows no longer show a doubled bullet.
- The Expenses empty state is one sentence shorter.

### All friends

- The B'day Calendar reads "Turns 32" rather than a bare number, which could have been read as their current age.

### Settings

- **Weeks can start on Sunday.** Monday is still the default. The setting drives both calendars, the "This week" and "Last week" headings, and the dashboard's two-week window.

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

### Docs

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

### Fixes

- **New dates were recorded on the UTC day, not yours.** From an evening in the US that stamped tomorrow; from a morning in Australia, yesterday. It reached a new diary entry's date (which also names its file), the prefilled date on a group event, the date stamped when an idea is logged as an event, and the once-a-day guard on the birthday digest. Birthdays and "met" dates were never affected — they're plain text, parsed without going through a timezone.

## 1.7.1 — 2026-08-20

### Fixes

- **Groups could silently vanish from an event.** Opening and saving an event that named a group (rather than a person) dropped the group — it wasn't recognised as a valid participant, so it disappeared from the event on save, taking the event off that group's timeline for good, even after re-creating it. Events already affected by this need to be recreated once from the group's page; new ones are unaffected going forward.
- Editing an event from a person's page no longer lets you accidentally remove that person from it — the same protection Add already had.
- Groups render with the correct colour and capitalisation everywhere they're shown — the About section chip, group filters, and group pickers — instead of occasionally showing raw `[[brackets]]` or a mis-cased name for a multi-word group.

## 1.7.0 — 2026-08-19

### Fixes

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

### Fixes

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

### Fixes

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
