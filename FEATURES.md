# Callander

**A private secondary memory for your friendships — living inside an Obsidian vault as plain Markdown.**

Callander remembers the things friendship runs on and your head doesn't hold: whose birthday is coming, what you meant to give them, where you got to in that conversation, who still owes what from the trip. Nothing leaves your vault, and everything you see below is stored as an ordinary note you can open and edit by hand.

Every screenshot here is a real capture of the plugin running against the example vault in `examples/example-vault`, which regenerates from scratch with `npm run seed`. The cast is eight authors standing in for your actual friends — the trivia about them is real, the birthdays and gift ideas are not, and the whole thing is set around Boston and northern New England.

**Jump to:** [Dashboard](#dashboard) · [Friends](#friends) · [Groups](#groups) · [Quick notes](#quick-notes) · [Events](#events) · [Diary](#diary) · [Somedays](#somedays) · [Plans](#plans) · [Expenses](#expenses) · [Suggesting a feature](#suggesting-a-feature)

---

## Dashboard

The dashboard is where you see everything at a glance — upcoming birthdays, the ones you missed, notes you've jotted down, what's coming up, your plans, your wishlist, recent diary entries, your groups, and any money still owed.

Four quick actions sit across the top to add a friend, jot an idea, take a quick note, and open your full list of friends. There's a search bar to find someone fast, with buttons below it for the friends you've looked at most recently. Each of those buttons shows a count of the ideas you've saved for that person, so you can see at a glance who you've got something ready for and who you haven't thought about in a while.

Underneath is anything you've jotted down and not yet filed. The idea is that writing something down should cost you nothing in the moment — you catch the thought, and decide later whether it was a gift idea, a conversation to have, or nothing at all.

Birthdays come next, counting down the next thirty days, and each one tells you whether you actually have a gift idea ready. Below them sit the birthdays you just missed. Those don't quietly disappear once the day has passed — they stay put, with a button to tick off, so the one you forgot stays in front of you until you've done something about it.

The rest of the page runs through what's coming up on the calendar, the bigger trips you're planning, the loose wishlist of things you'd like to do one day, your last few diary entries, your groups, and any one-off costs that still need settling. Everything is read straight from your notes, so nothing on this page can go out of date.

![Callander dashboard showing friends, jotted notes and upcoming birthdays](examples/screenshots/dashboard-1.png) _Quick actions, friend search, and the notes waiting to be filed._

![Upcoming and missed birthdays, and the events coming up](examples/screenshots/dashboard-2.png) _Birthdays with gift ideas flagged, missed ones held for you, and what's on the calendar._

![Plans and the somedays wishlist](examples/screenshots/dashboard-3.png) _Trips in the diary, and the wishlist of things without a date yet._

![Recent diary entries, groups and shared costs](examples/screenshots/dashboard-4.png) _The tail of the page: recent entries, your groups, and money still to settle._

---

## Friends

Each friend gets a page of their own, and it holds the things you'd want in front of you before you saw them.

At the top, Callander works out their exact age and how long until their next birthday, along with their star sign, birthstone and birth flower. Anything you jotted down about them and never filed sits just below, waiting to be sorted.

Then come your ideas for them, grouped by what they are — gifts, conversations you want to pick back up, things to do together, books to lend. You can set a date on any idea and it will come back to you on the dashboard when that day arrives, which is how "get him something for the garden" survives the eight months between thinking it and needing it.

Their timeline is one merged history of the two of you. Anything coming up sits at the top, including any trips they're part of, and below that it becomes a year-by-year record going back to the day you met — which is itself the first entry.

The rest of the page is the character stuff. Interests are short and factual — a hobby, a drink they always order, a team they follow — kept that way so they're actually useful when you're buying a present. Fun facts is the trivia drawer. Inside jokes keep the shared reference next to the story of how it started, which is the half you always forget. Quotes holds the lines worth keeping, and there's a free-text area at the bottom for anything that doesn't fit a box.

Your full list of friends lives on its own page. You can narrow it to a single group, and sort by birthday, name, who you added most recently, who you saw last, or age. Every row has a catch-up button that pulls up a short briefing on that person for when you're about to see them.

Adding someone asks for very little — a first name is enough. Everything else is there for when you need it: what you actually call them, how their name should be shortened in lists, and a birthday you can give as a full date, a month and year, or just a day and month when nobody remembers the year. You can tick them into groups on the way in.

![Full list of friends with group filters and sorting](examples/screenshots/all-friends-1.png) _Everyone in one list, filtered by group and sorted however you like._

![The form for adding a new friend](examples/screenshots/add-friend-1.png) _Only the name is required — the rest is there when you want it._

![A friend's page showing their age, birthday and saved ideas](examples/screenshots/person-1.png) _Age and birthday worked out for you, unfiled notes, and ideas grouped by kind._

![A friend's timeline of shared history](examples/screenshots/person-2.png) _Everything coming up, then a year-by-year record back to the day you met._

![Interests, fun facts, inside jokes and quotes](examples/screenshots/person-3.png) _The character stuff — what they're into, and the things you don't want to forget._

---

## Groups

A group is any circle you want to keep track of — a book club, the people you hike with, family. You don't build the group; you tag the person, and the group assembles itself from whoever's in it.

Each group gets a colour that shows up next to its members everywhere else, and its own page with the same ideas, timeline and notes a person has. That means an idea can belong to a whole circle rather than one individual — a bar to try with everyone, or a trip to float at the next meet-up.

![A group page listing its members](examples/screenshots/group-1.png) _The book club, assembled from whoever's tagged into it._

---

## Quick notes

This is the smallest thing in Callander and possibly the most useful. Type the thought, optionally say who it's about, save.

It lands on the dashboard and on that person's page as something to sort later. The reason it's this bare is that deciding what a thought _is_ — a gift idea? a conversation? — is work, and work at the wrong moment means you don't write it down at all. So Callander lets you skip that decision entirely and come back to it.

![The quick note form](examples/screenshots/quick-note-1.png) _Type it, save it, decide what it was later._

---

## Events

Events are anything with a date on it, past or future — a dinner, a gig, someone's big news, a gift you handed over, or a plain task with nobody attached at all.

The events page shows the lot, and you can flip between what's coming up, what's already happened, or everything together. Each entry shows what kind of thing it was, when, and who was there.

Something you cancelled stays on the list, crossed out and labelled, rather than being deleted. An evening that didn't happen is still part of the story.

When you log one, you pick what sort of event it was from a row of options, and the date can be as vague as you like — a full date, just a month, or only a year, because something you remember as "sometime in 2019" shouldn't need a made-up day attached to it. You add whoever was there, and choose whether it shows up on their pages or stays private to your calendar.

![The events page listing upcoming events](examples/screenshots/events-1.png) _Everything with a date, including the one that got cancelled._

![The form for adding an event](examples/screenshots/add-event-1.png) _Pick the kind of thing it was, and be as vague about the date as you need to be._

---

## Diary

The diary is for writing about a day rather than filing a fact.

Entries are grouped by month and show a preview of what you wrote. If you mention a friend's name in an entry, Callander picks it up automatically — the entry knows they were there, and it shows up on their page too. You don't have to tag anyone or fill in a field.

Each entry is just a note, so you can write it however you like and the diary keeps up.

![The diary, with entries grouped by month](examples/screenshots/diary-1.png) _Write about the day; mentioning someone is enough to link them to it._

---

## Somedays

Somedays are the things you'd like to do but haven't committed to — the exhibition you keep meaning to catch, the trail you've never cycled, the book you'll get to eventually.

They're deliberately lighter than a plan. There's no date to agree, nobody to invite and no money to split; there's just the idea, plus whatever you happen to know about when it would work. That might be a season, a stretch of weeks before the chance disappears, the days of the week that suit it, or nothing at all.

The list can sort itself by what fits best given what you've told it, and there's a surprise-me button for when you'd rather be told than choose. The Today, Tomorrow and This weekend buttons answer the question you actually have, which isn't "what do I want to do one day" but "what could I do right now".

Open one and you'll see everything you've pinned down, along with three buttons that are the whole point: mark it done, turn it into a dated event, or grow it into a full plan with people and a budget. A vague idea becomes a real trip without ever being retyped.

![The somedays list](examples/screenshots/somedays-1.png) _Sorted by what fits, with buttons for what you could do today or this weekend._

![A single someday with its details](examples/screenshots/someday-view-1.png) _What you know so far — and the buttons to turn it into an event or a plan._

![The form for adding a someday](examples/screenshots/add-somedays-1.png) _Say as much or as little as you want; a name on its own is a complete someday._

---

## Plans

A plan is the big one: several days, several people, an itinerary, a packing list and shared money.

Starting one asks almost nothing — a name, and a date as rough as you like, because a plan should get created the moment somebody says "we should do that", not once the details exist. A month is a perfectly good answer.

You add the people going, and anyone who hasn't answered yet sits separately as unconfirmed. They aren't counted in any of the costs until they say yes, so a maybe doesn't quietly change everyone's share.

Everything you add that has a date on it — things to do, journeys, where you're staying — flows into a single running order for the trip, grouped by day and sorted by time. A drive shows its length, its cost and who's in the car. Dinner shows a rough price each. Where you're staying appears on the day you check in and says how long you're there, with the address and the door code right on it. Anything you haven't booked yet is flagged, so the loose ends stand out.

Below the running order, everywhere you might stay is listed together, including the backup you haven't committed to and the date you need to decide by. There's a shared packing list that everyone can tick off, a full cost breakdown, and a free-text area at the bottom for booking confirmations and anything else that doesn't fit a box.

Adding to a plan is quick. Things to do can be given a category, a day, and either an exact time or a rough one — "late afternoon" and "dinner time" are real answers that still sort correctly. Journeys pick how you're travelling, how long it takes and whether it's booked. Places to stay pick what kind of place it is, how many nights, and take an address that opens in Maps.

![Setting up a new plan](examples/screenshots/add-plan-1.png) _A name and a rough date is enough to get started._

![A plan showing who's coming, including unconfirmed](examples/screenshots/plan-1.png) _Who's in, who hasn't answered, and the total cost so far._

![The first day of the trip's running order](examples/screenshots/plan-2.png) _Journeys, meals and where you're staying, all in one running order._

![Later days of the trip, and where you're staying](examples/screenshots/plan-3.png) _Unbooked things are flagged, and every option for where to stay is listed together._

![The packing list and cost breakdown](examples/screenshots/plan-4.png) _A shared packing list, and every shared cost with how it's being split._

![Notes and extra details on a plan](examples/screenshots/plan-5.png) _Room for booking confirmations and anything else that doesn't fit a field._

![Adding something to do on a plan](examples/screenshots/plan-add-idea-1.png) _Only the days of the trip are offered, and the time can be rough._

![Adding a journey to a plan](examples/screenshots/plan-add-travel-1.png) _How you're getting there, how long it takes, and whether it's booked._

![Adding somewhere to stay on a plan](examples/screenshots/plan-add-accommodation-1.png) _What kind of place, how many nights, and an address that opens in Maps._

---

## Expenses

Callander handles the bit that usually ends in a group chat nobody wants to be in. A cost can be split five ways: evenly, by percentage, by shares, by exact amounts, or line by line straight off the receipt.

Evenly is the common case — name who was there and it divides equally. Percentages are for when the split is uneven but proportional, and each row shows both the percentage and what it comes to in money, with a running total telling you whether you've reached 100%. Shares work the same way in whole units instead — three nights to one person and two to another — which is easier to think about when the units are real things.

Off the receipt is the precise one: you type each person's own line from the bill. You can type sums rather than answers, and Callander keeps what you typed, so `38+23` stays readable as how you got to $61 rather than just showing the total. Tax and tip go on as percentages, each showing what they add, and the whole thing totals up so you can check it against the paper receipt before saving.

All of that rolls up into one figure per person. Across a whole trip — different splits, one already settled and taken out, money someone fronted deducted — you get a single number each, and a running total of what's still outstanding. Anything already paid back comes off rather than becoming another line to divide.

And every number opens up. Tap through and you get that person's total broken down line by line: which cost, how it was split, what it came to. Nobody has to take the arithmetic on trust, which is the difference between a tool people use to settle up and a tool people argue with.

![Splitting a cost evenly between three people](examples/screenshots/expense-split-even-1.png) _The common case — name who was there and it divides equally._

![Splitting a cost by percentage](examples/screenshots/expense-split-percent-1.png) _Percentages with the real money alongside, and a total that tells you when it adds up._

![Splitting a cost line by line off the receipt](examples/screenshots/expense-split-receipt-1.png) _Type sums, not answers — `38+23` stays readable as how you got to $61._

![Who owes what across a whole trip](examples/screenshots/plan-who-owes-1.png) _One figure per person across every cost, with what's still outstanding at the top._

![One person's costs broken down line by line](examples/screenshots/plan-breakdown-1.png) _Every number opens up, so nobody has to take the maths on trust._

---

## Suggesting a feature

Callander is shaped around my idea of what would help me remember and plan my friendships in as-detailed or as-little-detailed as I like, which means there are almost certainly things it should do that it doesn't yet. If you've run into one, please let me know by suggesting it below.

**[Suggest a feature →](https://github.com/zcallan/callander-obsidian/issues/new)**

Before you do, it's worth [having a look at what's already been suggested](https://github.com/zcallan/callander-obsidian/issues). Someone may have got there first, and adding a 👍 or a comment to an existing thread says more than a second copy of it does.

Bugs go in the same place. If something has gone wrong, the version you're on and what you did just before it happened will usually be enough to find it.
