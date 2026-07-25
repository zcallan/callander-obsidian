# Callander — Plan

A private secondary memory for your friendships, as an Obsidian plugin.
Source brief: "Callander — Product Overview" (2026-07-22).

## Guiding principles (apply to everything)

1. **Never creepy** — no fields for opinions, ratings, or sensitive details. Data = intentions toward people. No contact-frequency scoring or "relationship health" mechanics, ever.
2. **Honest imprecision** — dates at year / year-month / exact-day (or month-day) precision. Never display more precision than was recorded.
3. **Ten-second capture** — adding a thought must be near-frictionless from anywhere.
4. **Completely private** — everything is markdown + frontmatter in the user's vault. No sync, no network.

## Status: v2.0.0 (2026-07-22) — original brief fully implemented

Shipped: five-category Ideas with grouped display + global quick-capture command ·
Events/Timeline with flexible dates and met-origin · check-off-idea → log-event ·
FlexDate everywhere (met, events, birthdays at three precisions) · belated birthday
window · once-daily startup birthday digest · Diary (about-dates, edit/delete,
native-editor editing, "New diary entry" command) · table columns (Ideas count, Met,
toggleable) · Callander rebrand (visible layer) · README rewrite.

Verified by test pass: 32/32 date-logic unit tests (mocked `obsidian`); real-vault
scan clean; production build passes. Test harness lives in the session scratchpad —
rebuild it from PLAN history if needed.

### Standing decisions & precedents

- **Prefer native Obsidian primitives over rebuilding editor UI in plugin views**
  (decided via diary A/B spike; diary bodies are edited as normal notes).
- **Choosing a coarser date precision truncates the stored value immediately** —
  "I only know the year" is a statement.
- **Legacy keys** (`giftIdeas`, `interactions`) are read forever and lazily migrated
  to (`ideas`, `events`) on next save. All schema changes stay additive.
- **Friend creation is minimal** (name, birthday, relationship) — everything else is
  added on the page when it matters.

### Still pending from v2

- **Plugin id migration** (`friend-tracker` → `callander`): manifest id + repo folder
  + vault symlink + `community-plugins.json` entry + `data.json` move, in one
  coordinated step in a dedicated session. Everything works under the old id until then.
- Event modal: clearing the date silently blocks saving (no feedback). Minor.
- Mobile ergonomics pass across the new views.

---

# Roadmap

**Phases 7–10 implemented 2026-07-22** (same-day sweep). Details below kept as the
design record; deltas from plan: `displayName` (used everywhere when set) instead of
`nickname`; group pages open in the regular contact view (no dedicated member list
yet); year recap and merge are commands. Not yet hand-tested in the UI.

## Phase 7 — Friend groups
**Fleshed out 2026-07-22 (round 2):** group pages in `Groups/` are the source of truth
and carry a `color` (9-swatch palette); dashboard Groups section (dot · name · member
count, ⚙ manage modal with rename/delete propagation, New group); friend page groups
edit as toggle chips + new-group input, view mode as colored chips; group pages show
a Members section (add via fuzzy picker, ✕ remove); color dots beside names in the
friends table.

Named groups ("Family", "Basketball", …) that friends can belong to, with group-level
ideas.

- **Data**: `groups: ["family", "basketball"]` list in friend frontmatter (multi-group
  from day one; a group is a label, not a folder). Group names normalized lowercase,
  displayed capitalized.
- **Group pages**: one note per group in `<contactsFolder>/Groups/`, mirroring the
  contact pattern — so groups get their own `ideas` (🥾 "go bowling sometime",
  🎁 "board game for game night") and later a timeline if wanted. Group page lists
  members (derived by scanning friends' `groups`).
- **Overview table**: filter chips / dropdown by group; optional Groups column.
- **Quick capture**: the fuzzy picker offers groups alongside friends ("Basketball
  (group)") so group ideas are ten-second capturable too.
- **Never-creepy check**: groups are organizational, not evaluative. Fine.

## Phase 8 — Dashboard

A proper home view in the main pane (like Diary), replacing the right-sidebar table
as the front door. The sidebar table remains as the "All friends" detail view.

- **Upcoming birthdays**: next N days (and belated window), with day counts — the
  startup digest, but persistent and glanceable.
- **Quick actions**: Add friend · Add idea (quick capture) · New diary entry.
- **Friend search**: input that filters/jumps to a friend page; "View all friends"
  button opens the table view.
- **Open ideas surface**: friends you're seeing soon (birthday ≤ N days) with open
  gift-idea counts — "Tom's birthday in 6 days, 2 gift ideas saved".
- Ribbon icon points here; table stays one click away.

## Phase 9 — Richer friend fields (still minimal by default)

- **Nickname**: optional; shown in header ("Daniel 'Danny'"), matched by quick-capture
  fuzzy search, optional table display preference (nickname vs full name).
- **Birthplace** and **Location** (current city/state/country as one free-text field
  unless a need for structure emerges): optional standard fields, shown when set.
  Location pairs well with a future "friends in the city I'm visiting" lookup.
- **Name structure — decision: keep single `name` + optional `nickname`; do NOT
  split first/last.** Rationale: the brief's soul is "sometimes it's just Sam from
  the gym" — structure adds capture friction; filenames key off the single name;
  "Mum" has no meaningful surname; last-name sorting has no value at personal scale.
  Revisit only if the roster grows enough that surname sorting/disambiguation
  actually hurts. If it does, add optional `lastName` rather than splitting `name`.

## Phase 11 — Drafts (DONE 2026-07-23)

Zero-structure capture: "Quick note" command → text + optional friend (datalist),
Enter. Attached drafts live on the friend's `drafts:` frontmatter; unattached in the
Idea Inbox file. Triage on the dashboard ("✏️ Drafts", kept high) and in a strip atop
the person page: Make idea (prefilled category modal, target picker for unfiled) or
discard. Drafts are pre-categorization, not a seventh category.

## Phase 12 — Plans (DONE 2026-07-23)

Temporary containers with a lifecycle: one note per plan in `FriendTracker/Plans/`
(`name`, flex `date`, `status`, `members` as wikilinks, `items` with buckets 🎯
Must-do / 🤔 Maybe / ⏳ If there's time / 🧳 Travel & stay + optional cost).
No checklist — a plan is a menu, not a to-do list. Dashboard "🗺️ Plans" shows
active plans soonest-first with date/people/items/~cost (+ "passed — mark it
done?" nudge). Plan page: meta line, members, bucketed items, notes/links in the
body. "Mark as done" logs a 🤝 event to every member's timeline and archives.
Quick capture targets plans with a bucket modal. Cost-splitting deliberately
excluded (ledger-keeping between friends ≈ creepy line).

## Phase 13 — Richer plans + cost splitting (DONE 2026-07-23)

Plan page restructured into sections: 💡 Ideas (category 🥾 Activity / 🍴 Food / 📸
Sightseeing × priority 🎯 Must-do / 🤔 Maybe) · ✈️ Travel · 🏠 Accommodation ·
🎒 What to bring (checklist) · 💵 Cost breakdown · Notes · Links. Cost breakdown:
per-item shared expenses, split "even" or "by shares" (integer weights → proportional,
generic units), participants = members + your name, live per-person owed preview +
summary. Legacy `bucket` items migrate on load (logistics→travel, must/maybe→ideas).
Also this batch: ✈️ Trip event type; birthday-trivia setting toggles (+ Chinese zodiac,
off by default); copy-event-to-others; friend-list Glance button + shortened months.

## Phase 10 — Candidate ideas (unscoped, pick what resonates)

- **Resurfacing dates on ideas** — optional "resurface around <flex date>" on an idea
  ("show me this in November, before her birthday"). Dashboard surfaces due ideas.
  This is the brief's "resurfaces them when they matter", made literal — and it's
  intention-based, so it passes never-creepy.
- **Met-anniversary notices** — "10 years since you met Crista" in the startup digest,
  at recorded precision (year-precision met → year-level anniversary).
- **Diary ↔ friends linking** — `[[Wikilinks]]` in diary entries already work; show
  "mentioned in diary" on a friend's timeline via backlinks. Obsidian-native, zero
  new data.
- **Idea inbox** — capture an idea with *no* friend attached ("someone would love
  this") into an inbox; file it to a friend later from the dashboard.
- **Group events** — log one event to several friends at once ("bowling with the
  basketball group"); writes to each member's timeline. Pairs with Phase 7.
- **Pre-hangout glance command** — "Before seeing <friend>": one compact panel with
  open conversation threads, activities, places, and their recent events.
- **Global idea search** — command to search all ideas across friends ("where did I
  write that mug idea?").
- **Status-bar birthday chip** — subtle "🎂 Daniel in 4d" in the status bar.
- **Year in friendships** — a private yearly recap generated from events + diary
  (counts and highlights, no scores).
- **Duplicate-friend merge tool** — housekeeping for when "Dan" and "Daniel" turn out
  to be the same person.

## Dev environment (since 2026-07-22 vault move)

Vault migrated to iCloud: `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Nortbork`
(vault reorganized by user; contacts folder still `FriendTracker`). Dev builds go
directly into the vault plugin folder via `.vault-plugin-path` (gitignored) — a real
folder, not a symlink, so iCloud syncs the plugin to iOS. The old Google Drive vault
(`…/My Drive/Obsidian/Callan`) is retired but intact as a fallback.

## Migration & safety

- Full vault backup at `~/backups/obsidian-callan-vault-full-2026-07-22.tar.gz`
  (+ `.obsidian` and `data.json` backups from the same date).
- All schema changes additive; legacy keys read forever.
- Real notes only touched when a page is actively edited.
