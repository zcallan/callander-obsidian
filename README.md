# Callander

**A private secondary memory for your friendships. Built on Obsidian.**

We all want to be better friends than our memory allows. You forget a birthday. You lose track of a great conversation that got interrupted. You see the perfect gift in a shop window, think "Bob would love this," and by December you've completely forgotten it.

Callander is a quiet, personal space where you jot down the little things that help you show up well for the people you care about — and it resurfaces them when they matter.

You can also add events on the dashboard (upcoming bookings, tasks, anything worth keeping in view — with or without people attached), manage a list of "Somedays" which are loose plans you'd like to do solo or in a group someday soon, and create full plans with as precise or imprecise of a timeline as you like, with a full cost breakdown tool and note taking.

This plugin is not designed to store opinions about people, ratings, or really even intimate details. It stores your _fascinations and excitements toward them_ — things you want to do, say, give, or remember.

My philosophy for this project is: everything you record here should be okay for someone to read about themselves. However, you are more than welcome to use it in any way you like.

![The Callander dashboard](examples/screenshots/dashboard-1.png)

## Features

A short tour of the three pages you'll spend your time on. For the full walkthrough —
groups, events, the diary, quick notes and every way of splitting a bill — see
**[FEATURES.md](FEATURES.md)**.

### 📋 Dashboard

The page you might start opening every day as a matter of habit. Everything on it is read straight from your notes, so it
can't fall out of date.

**Birthdays.** A countdown through the next thirty days, and each one tells you whether
you actually have a gift idea ready — which is the part that usually goes wrong. The ones
you just missed don't quietly disappear either: for two weeks afterwards they stay on the
page saying "8 days ago", with a button to tick off, so a forgotten birthday becomes a
belated message rather than a lost cause.

**Upcoming events.** Everything on the calendar in one list — a dinner, a gig, a booking,
a plain task with nobody attached at all. Each shows what kind of thing it is, who's
coming, and how long you've got.

**Plans.** For the bigger things — a weekend away, several people, real money. Full timeline for ideas, travel, accommodation, and quick notes. Also has a "What to bring" checklist and a handy cost breakdown tool for any expenses.

**Somedays.** The loose wishlist of things you'd like to do but haven't committed to, each
showing whatever you know about when it would work: a season, a stretch of weeks before
the chance disappears, or just the days that suit it.

![Upcoming and missed birthdays, and what's on the calendar](examples/screenshots/dashboard-2.png)
_Birthdays with gift ideas flagged, missed ones held for you, and the events coming up._

![Plans and the somedays wishlist](examples/screenshots/dashboard-3.png)
_Trips you're planning, and the wishlist of things without a date yet._

### 🧑‍🤝‍🧑 Friend page

Everything you'd want in front of you before you saw someone. A first name is all you need
to start, and birthdays and the day you met can be recorded as precisely as you actually
know them — "March 2021" and "sometime in 2019" are perfectly good answers.

**Ideas.** Quick thoughts filed by what they are — gifts, conversations to pick back up,
things to do together, places to go. They show up grouped, so a ten-second glance before
you see someone hands you a present idea and two things to talk about. Put a date on one
and it comes back to you on the dashboard when it's useful, which is how "get him
something for the garden" survives the eight months between thinking it and needing it.

**Timeline.** One merged history of the two of you: anything coming up at the top,
including trips they're part of, then a year-by-year record reaching back to the day you
met — which is itself the first entry.

![A friend's page showing their age, birthday and saved ideas](examples/screenshots/person-1.png)
_Age and birthday worked out for you, and ideas grouped by kind._

![A friend's timeline of shared history](examples/screenshots/person-2.png)
_What's coming up, then the record going back to the day you met._

### 🗺️ Plan page

For the bigger things — a weekend away, several people, real money.

**Timeline.** Everything with a date on it flows into a single running order for the trip:
what you're doing, how you're getting there, where you're staying. A drive shows its
length and who's in the car; where you're staying shows the address and the door code.
Times can be exact or as loose as "late afternoon", and anything you haven't booked yet is
flagged.

**Cost breakdown.** Split each cost evenly, by percentage, by shares, by exact amounts, or
line by line straight off the receipt. It all rolls up to one figure per person — with
anything already settled taken out and money someone fronted deducted — and every number
opens up to show its working, so nobody has to take the maths on trust.

![The running order for a trip](examples/screenshots/plan-2.png)
_Journeys, meals and where you're staying, all in one running order._

![Who owes what across a whole trip](examples/screenshots/plan-who-owes-1.png)
_One figure per person across every cost, with what's still outstanding at the top._

### All features

For the full walkthrough —
groups, events, the diary, quick notes and every way of splitting a bill — see
**[FEATURES.md](FEATURES.md)**.

## Project Principles

1. **Never creepy.** No fields for opinions, assessments, or sensitive personal details. If a feature would feel wrong if the friend saw it, it doesn't belong.
2. **Honest imprecision.** Record vague truths, not false precision.
3. **Ten-second capture.** The core loop is jotting a thought before it evaporates.
4. **Completely private.** Everything lives in your own vault as plain markdown. No sync, no network, no accounts — unless you want to set that up separately yourself.

## Plugin Notes

**No network requests.** Everything runs off local files, and the plugin ships with zero
runtime dependencies — no telemetry, no accounts, nothing phoning home. It works happily
alongside Obsidian Sync, or an external sync like iCloud (which is what I use) or Google
Drive. The only things that reach the internet are links you tap yourself, like an address
opening in Maps for a link you added yourself.

**Custom interfaces are relied on heavily.** Rather than a Markdown-first editing
approach, most features are used through modals, dashboards and listing pages. That makes it
feel less like using Obsidian the way you normally might, and more like an abstraction layer sitting on
top of it — built to make data entry and browsing easier than raw notes allow. The
notes underneath stay plain Markdown with Frontmatter, so nothing is locked in. I'm progressively trying to make more data stored in Markdown markup so it's easier to read outside of plugin interfaces, and improve long-term note keeping if you ever move off Obsidian.

**Why Obsidian?** I like not needing a database. I like using Obsidian day to day. I like free stuff. And I
like not bouncing between seventeen different apps to be sure I haven't forgotten
something or to take a note. Building on Obsidian means I get all of its benefits while leaning on the
simplicity of its notes structure. Maybe someday I'll migrate to a web or desktop application to unlock more than I can do with Obsidian, but for now I'm enjoying this approach.

**How was this built?** I'm a software engineer of over ten years, and spent part of that
teaching university courses. I've leaned on AI tools heavily for this project, both as an
experiment and for the efficiency it buys — but the implementation is sound and thoroughly
reviewed. It's built closely as it would have been by hand.

**I'll occasionally break things.** Every so often I need to move data to a different
storage strategy or format. When that happens I'll always try to do one of two things:
run the migration for you automatically the next time you open the Dashboard, or leave a
note in the section where the change landed, explaining how to move your data across by
hand without losing any of it.

Either way, the plugin will never try to delete data across versions. If you ever have
trouble migrating, [open an issue](https://github.com/zcallan/callander-obsidian/issues)
and I'll help you out as quickly as I can. I strongly recommend frequently backing up your data as good practice in general, including when updating plugin versions.

## Development

```bash
npm install
npm run dev   # esbuild watch mode
```

Put the absolute path of a vault plugin folder (e.g. `<vault>/.obsidian/plugins/callander`) in a `.vault-plugin-path` file at the repo root (gitignored) — dev builds then output `main.js` there and copy `manifest.json`/`styles.css` along, which works with iCloud-synced vaults where symlinks won't sync. Pair with the [Hot Reload](https://github.com/pjeby/hot-reload) plugin for instant reload on rebuild (a `.hotreload` marker is written automatically). Without `.vault-plugin-path`, dev builds land in the repo root like the standard template.

To regenerate the example vault and every screenshot, see [`tools/screenshots`](tools/screenshots).

## Credits

Callander is an idea I've had for years, but the Obsidian plugin approach was inspired by [Friend Tracker](https://github.com/buzzguy/friend-tracker) from buzzguy. The decision to create a separate project was made due to wanting a large core feature overhaul, branching into other areas like Events and Plans, and a self-managed development cycle.

## License

MIT © Callan Delbridge. See [LICENSE](LICENSE) for the full text.
