# Your data

Callander has no database of its own. Everything you see in the plugin is read live from ordinary Markdown notes in your vault — this page is about where those notes live and how they're shaped, for backing up, editing by hand, or moving off the plugin entirely.

**Contents**

- [At a glance](#at-a-glance)
- [Folder layout](#folder-layout)
- [Frontmatter vs. the note body](#frontmatter-vs-the-note-body)
- [Wikilinks, not copies](#wikilinks-not-copies)
- [Migrations](#migrations)
- [Tips & hidden details](#tips--hidden-details)

**See also**

- [Quick notes](QUICK-NOTES.md#on-disk): the Drafts checklist format
- [Ideas](IDEAS.md#on-disk): the Ideas markdown format
- [Settings](SETTINGS.md#files-and-folders): choosing your own base folder and diary folder

## At a glance

- No database, no hidden format — every page in the plugin is one Markdown file, or a folder of them.
- No network requests of any kind; the plugin ships with zero runtime dependencies.
- A person, event, plan, group or someday is a note under your base folder (default: `Friends`).
- Structured data (a category, a done flag, a resurface date) is stored as *readable* markdown wherever practical, not buried in frontmatter you'd need the plugin to decode.
- The plugin never deletes data across a version update — a format change either migrates itself automatically, or tells you exactly what to do by hand.

## Folder layout

Everything sits under one base folder (**Files and folders** in [Settings](SETTINGS.md#files-and-folders); `Friends` by default):

| Path | Holds |
| --- | --- |
| `Friends/People/` | One note per person |
| `Friends/Groups/` | One note per group |
| `Friends/Events/` | One note per event |
| `Friends/Plans/` | One note per plan |
| `Friends/Somedays/` | One note per someday |
| `Friends/Diary/` | One note per diary entry (folder name is its own setting) |
| `Friends/Dashboard.md` | The dashboard's own note — inbox ideas and one-off expenses in its properties, the Drafts checklist in its body |
| `Friends/Callander Recap <year>.md` | Written only when you run **Generate year in friendships** |
| `Callander Birthdays.ics` (vault root) | Written only when you run **Export birthday calendar** |

## Frontmatter vs. the note body

Callander splits a note's data across two places, deliberately:

- **Frontmatter** holds simple, single-value facts — a birthday, a status, a date.
- **The note body** holds anything with real structure — a list, a checkbox, something with its own sub-fields. Ideas, Quotes, Fun facts, Drafts and Notes are all plain markdown under their own `##` heading, not encoded into frontmatter, specifically so the file still reads sensibly if you open it outside the plugin, or stop using the plugin altogether.

Two of the checklist formats (Drafts, Ideas) deliberately reuse the community **Tasks** plugin's own markers (`➕` created, `✅` done, `⏳` a due/resurface date) — so a vault running both plugins gets one consistent convention rather than two competing ones.

## Wikilinks, not copies

A person named on an event, a plan, or in another person's family fields is a real `[[wikilink]]`, not a copied name. That means:

- Renaming a friend updates every place that names them, automatically, the same way any Obsidian rename does.
- They show up in Obsidian's own graph view and backlinks pane, not just inside Callander's UI.
- A diary entry is linked to someone the moment it contains a genuine wikilink to them — resolved from Obsidian's link index, never by scanning entry text for a matching name.

## Migrations

Every so often a stored format changes — moving something from frontmatter into the note body, say. When that happens, Callander does one of two things:

1. **Runs the migration for you automatically**, the next time you open the dashboard. Migrations are written to be safe to run repeatedly, so they also catch a file syncing in later from a device that was still on an older plugin version.
2. **Leaves a note explaining how to move your data by hand**, in the section where the change landed, when an automatic migration isn't possible.

**The plugin will never delete your data across a version update.** If a migration ever seems to have gone wrong, [open an issue](https://github.com/zcallan/callander-obsidian/issues) — and back up your vault regularly regardless, the same as you should for any plugin.

## Tips & hidden details

- **Nothing in Callander phones home.** The only network requests it ever makes are ones you trigger yourself — an address opening in Maps, a link you added, "Add to calendar" opening a prefilled Google Calendar entry.
- **A file the plugin doesn't recognise is left alone.** Adding your own `#tags`, extra frontmatter fields, or an unrelated `##` section to any of these notes doesn't confuse Callander — it only ever reads the sections and fields it knows about.
- **You can read (and edit) every one of these files without the plugin installed.** That's the point of keeping structure in plain markdown rather than a proprietary format — worst case, you're left with a folder of ordinary, readable notes.
