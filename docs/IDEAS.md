# Ideas

What you've noticed about someone that's worth remembering — a gift, a place to take them, a book to lend. Split into two related things: **ideas** (something to eventually do) and **interests** (something they already are into).

**Contents**

- [At a glance](#at-a-glance)
- [Ideas](#ideas)
- [Resurfacing](#resurfacing)
- [The idea inbox](#the-idea-inbox)
- [Interests](#interests)
- [On disk](#on-disk)
- [Tips & hidden details](#tips--hidden-details)
- [Version history](#version-history)

**See also**

- [Friends](FRIENDS.md): where ideas and interests live on a friend's page
- [Quick notes](QUICK-NOTES.md): capturing a thought before deciding what it is
- [Groups](GROUPS.md): an idea can belong to a whole group instead of one person

## At a glance

- Ideas are grouped by kind — Gift, Conversation, Activity, Place, Movie, Book, Show, Music, Recommendation, Other.
- Put a resurface date on one and it comes back to you on the dashboard when that day arrives.
- An idea captured with no friend picked yet waits in the **Idea inbox** until you file it.
- Interests ask for what actually fits the type — an author, an artist and genre, a restaurant — never a rating.
- A note on an interest sits behind a hover icon, and a lightbulb turns it straight into an idea.

## Ideas

### Categories

🎁 Gift · 💬 Conversation · 🥾 Activity · 📍 Place · 🎬 Movie · 📚 Book · 📺 Show · 🎵 Music · ⭐ Recommendation · ✨ Other

### Adding and editing

Add from a friend's page, a group's page, or the dashboard's **Add idea** button (the **Add idea for a friend** command), which asks who it's for. Editing reopens the same capture form, prefilled, with **Delete** beside **Save**; editing an existing idea doesn't jump focus into the text box, so changing just its category is one tap.

### Finding one again

**Search all ideas** (a command) fuzzy-searches every idea across every friend and jumps to the person it belongs to — for "where did I write that mug idea?"

### Marking one done

Ticking an idea's checkbox marks it done — and if it's the kind of thing that just *happened* (you gave the gift, had the conversation), Callander offers to log it as an event on the timeline with one click, rather than making you re-enter it.

## Resurfacing

Any idea can carry a resurface date, set from the ⏰ button on its row. It defaults to month precision ("March 2027"), or give a full day if you know one. Once that date arrives, it appears in the dashboard's **⏰ Resurfacing now** section until you deal with it. This is how "get him something for the garden" survives the eight months between thinking of it and actually needing it.

## The idea inbox

Adding an idea without picking a friend first — from the dashboard's **Add idea** button when you're not on anyone's page — files it in the **📥 Idea inbox** instead of losing it. Each inbox row offers **File to friend…**, which moves it onto their page the moment you know who it's for.

## Interests

Short, factual things a person is already into — not a rating, not a recommendation *to* them, just what's true. Each type asks only for the fields that fit it, and any one of them is enough: an artist on their own, with no song in mind, is fine, and the form says so under the fields of every type that has more than one.

| Type | Fields | Filed as |
| --- | --- | --- |
| Hobby | Hobby | Activity |
| Book | Book · Author | Book |
| Music | Song · Artist · Genre | Music |
| Movie | Movie | Movie |
| TV Show | TV Show | Show |
| Game | Game · Platform | Gift |
| Sport | Sport | Activity |
| Team | Team · Sport/league | Gift |
| Food | Dish · Restaurant | Place |
| Drink | Drink | Gift |
| Place | Place · Location | Place |
| Other | Interest | Gift |

Every type also has its own Notes placeholder, written as what *they* like about it — a book's is "Loves the setting and time period, but hates Cathy Ames," a drink's is "Shaken, not stirred."

Each interest shows as a chip with two round buttons:

- **✏️ Edit** — opens it to change or delete.
- **💡 Make idea** — turns it straight into an idea, already filed under the matching category above (a Team becomes a Gift idea, a Place becomes a Place idea).

A purple 📄 note icon appears only when there's a note — hover it to read the note immediately, with no click needed.

## On disk

Ideas are stored as markdown in the note body, grouped under a `## Ideas` heading by category, in the same fixed order the page renders them — so the file reads the way the page looks:

```
## Ideas

### 🎁 Gift

- [ ] Ricer for mashed potatoes
- [x] Cookbook ⏳ 2026-03

### 📍 Place

- [ ] Saltie Girl in Back Bay
```

`⏳` is the resurface date, in the same Tasks-plugin-compatible style [Quick notes](QUICK-NOTES.md#on-disk) uses for `➕`/`✅`.

## Tips & hidden details

- **A resurface date can be just a month** ("2026-03"), not a full date — useful for "sometime this spring" without pretending to a precision you don't have.
- **Ticking an idea done offers to log it as an event in one click** — worth using for anything that just happened, rather than separately adding an event afterwards.
- **The idea inbox is the only place an idea can sit with no friend attached** — everywhere else, an idea belongs to a specific person or group from the moment it's created.
- **A Team or Game interest defaults to a Gift idea**, and a Food or Place interest defaults to a Place idea, when you hit Make idea — matching how you'd actually act on that interest, not just its category name.
- **Ideas are plain markdown, not frontmatter** — open the note directly and a checklist under a category heading is all there is to read.

## Version history

Derived from the [changelog](../CHANGELOG.md), newest first.

**1.10.7** · unreleased
- Any one field is enough for an interest (an artist with no song, say), and the form says so under the fields.
- An interest's first field says what goes in it: Music asks for a Song, Food for a Dish, and Other for an Interest.
- Adding an idea can no longer replace all of a friend's ideas when their note can't be read at that moment.
- Filing an inbox idea adds it to the friend before taking it out of the inbox, so a failed save leaves it in both places rather than neither.

**1.10.3** · 2026-09-26
- The eye button becomes a pencil, labelled Edit; a note gets its own purple hover icon showing it instantly instead of after a delay.
- Chips are more compact, with lighter, hover/focus-aware buttons; subheadings become plural (Drinks, Books).

**1.10.2** · 2026-09-26
- Interest fields fit the type — a book's author, music's artist and genre, a restaurant, a location. Song and Music Genre merge into one Music type; a new Place type is added.
- Notes on an interest sit behind the eye button (now pencil): hover to read, click to edit or delete.

**1.3.0** · 2026-08-03
- Quotes and ideas move from frontmatter into plain, readable markdown in the note body.
