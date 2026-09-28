import { createSuite } from "./harness.mjs";
import { createTestVault } from "./vault.mjs";

/**
 * The reminders→events merge, end to end against the fake vault: event
 * files with people links, the generated "## Events" person section, the
 * slug naming scheme, diary provenance — and above all the automatic
 * migration, which runs unattended in ~50 strangers' vaults and must
 * never lose a row.
 */
export async function run() {
	const { eq, ok, result } = createSuite("events & migration (fake vault)");

	// ---------- creating ----------
	{
		const t = await createTestVault();
		await t.addPerson("Austin Philleo");
		const file = await t.events.createEvent({
			name: "Concert at the Sinclair",
			date: "2026-08-06",
			type: "concert",
			people: ["[[Austin Philleo]]"],
		});
		eq(
			"slug is date + person • name",
			file.path,
			"Friends/Events/2026-08-06 Austin Philleo • Concert at the Sinclair.md"
		);
		const fm = t.frontmatterOf(file);
		eq("kind stamped", fm.kind, "event");
		eq("people stored as wikilinks", fm.people, ["[[Austin Philleo]]"]);
		ok("created stamped", typeof fm.created === "string");
	}
	{
		// The forms require a date now — an event without one is a someday
		// — but the service deliberately doesn't. Vaults from before that
		// rule hold undated events, and the reminders migration has to be
		// able to carry one across rather than drop it on the floor. So
		// this is the legacy tolerance, pinned on purpose.
		const t = await createTestVault();
		const a = await t.events.createEvent({ name: "Task", date: "" });
		const b = await t.events.createEvent({ name: "Task" });
		eq("undated slug is just the name", a.path, "Friends/Events/Task.md");
		eq("a dupe gets -1 appended", b.path, "Friends/Events/Task-1.md");
		const undated = t.events.getEvents().find((e) => e.file.path === a.path);
		eq("...and it still reads back", undated?.date, "");
		eq("no date key is written at all", "date" in t.frontmatterOf(a), false);
	}
	{
		// The emoji stays in the event's real name; the filename is for
		// the quick switcher and file explorer, so it drops the emoji
		// rather than repeating a symbol that reads fine as text but
		// clutters a path.
		const t = await createTestVault();
		const e = await t.events.createEvent({
			name: "🎉 Birthday Party",
			date: "2026-08-06",
		});
		eq(
			"the filename slug drops the leading emoji",
			e.path,
			"Friends/Events/2026-08-06 Birthday Party.md"
		);
		eq(
			"the frontmatter name keeps it",
			t.frontmatterOf(e).name,
			"🎉 Birthday Party"
		);
	}
	{
		const t = await createTestVault();
		await t.addPerson("Ada");
		await t.addPerson("Bee");
		await t.addPerson("Cal");
		const two = await t.events.createEvent({
			name: "Dinner",
			date: "2026-01-02",
			people: ["[[Ada]]", "[[Bee]]"],
		});
		const three = await t.events.createEvent({
			name: "Dinner",
			date: "2026-01-03",
			people: ["[[Ada]]", "[[Bee]]", "[[Cal]]"],
		});
		eq(
			"two people join the slug",
			two.path,
			"Friends/Events/2026-01-02 Ada & Bee • Dinner.md"
		);
		eq(
			"three or more stay out of it",
			three.path,
			"Friends/Events/2026-01-03 Dinner.md"
		);
	}

	// ---------- deriving timelines ----------
	{
		const t = await createTestVault();
		const ada = await t.addPerson("Ada");
		await t.addPerson("Bee");
		await t.events.createEvent({
			name: "Shared brunch",
			date: "2026-03-01",
			people: ["[[Ada]]", "[[Bee]]"],
		});
		await t.events.createEvent({
			name: "Solo task",
			date: "2026-03-02",
		});
		const adasEvents = t.events.eventsFor(ada);
		eq("a person sees the events linking to them", adasEvents.length, 1);
		eq("...by name", adasEvents[0].name, "Shared brunch");
		const map = t.events.eventsByPersonPath();
		eq("the one-pass index agrees", map.get(ada.path)?.length, 1);
	}

	// ---------- the generated "## Events" section ----------
	{
		const t = await createTestVault();
		const ada = await t.addPerson("Ada");
		await t.events.createEvent({
			name: "Second",
			date: "2026-05-01",
			people: ["[[Ada]]"],
		});
		await t.events.createEvent({
			name: "First",
			date: "2026-01-01",
			people: ["[[Ada]]"],
		});
		const body = t.bodyOf(ada);
		ok("person body gains an Events section", body.includes("## Events"));
		ok(
			"entries are wikilinks",
			body.includes("- [[2026-01-01 Ada • First]]")
		);
		ok(
			"chronological order",
			body.indexOf("First") < body.indexOf("Second")
		);
	}
	{
		const t = await createTestVault();
		const ada = await t.addPerson("Ada");
		const e = await t.events.createEvent({
			name: "Only one",
			date: "2026-05-01",
			people: ["[[Ada]]"],
		});
		await t.events.deleteEvent(e);
		ok(
			"deleting the last event removes the section",
			!t.bodyOf(ada).includes("## Events")
		);
		ok(
			"…and the event's note goes to the trash, not deleted outright",
			t.app.fileManager.trashed.includes(e.path)
		);
	}

	// ---------- editing renames the file ----------
	{
		const t = await createTestVault();
		await t.addPerson("Ada");
		const e = await t.events.createEvent({
			name: "Coffee",
			date: "2026-04-01",
			people: ["[[Ada]]"],
		});
		await t.events.updateEvent(e, {
			name: "Long coffee",
			date: "2026-04-02",
			people: ["[[Ada]]"],
		});
		eq(
			"the slug tracks the content",
			e.path,
			"Friends/Events/2026-04-02 Ada • Long coffee.md"
		);
		eq("the name field is canonical", t.frontmatterOf(e).name, "Long coffee");
	}

	// ---------- diary provenance ----------
	{
		const t = await createTestVault();
		const ada = await t.addPerson("Ada");
		await t.addPerson("Bee");
		await t.events.syncDiaryEvent("Diary/2026-06-01.md", "2026-06-01", "Lake day", [
			"[[Ada]]",
		]);
		let logged = t.events.findBySource("Diary/2026-06-01.md");
		ok("logging a diary entry creates one event", !!logged);
		eq("hangout by default", logged.type, "hangout");

		await t.events.syncDiaryEvent(
			"Diary/2026-06-01.md",
			"2026-06-02",
			"Lake day (edited)",
			["[[Ada]]", "[[Bee]]"]
		);
		logged = t.events.findBySource("Diary/2026-06-01.md");
		eq("re-logging updates, not duplicates", t.events.getEvents().length, 1);
		eq("...with the new people", logged.people.length, 2);

		await t.events.syncDiaryEvent("Diary/2026-06-01.md", "2026-06-02", "x", []);
		eq(
			"no mentions removes the event",
			t.events.findBySource("Diary/2026-06-01.md"),
			undefined
		);
		ok(
			"...and clears the person's section",
			!t.bodyOf(ada).includes("## Events")
		);
	}

	// ---------- a diary event kept off timelines stays off them ----------
	// Editing a logged diary entry re-syncs its event; the sync used to leave
	// out the opt-out, and updateEvent clears whatever it isn't given.
	{
		const t = await createTestVault();
		await t.addPerson("Ada");
		await t.events.syncDiaryEvent("Diary/2026-06-01.md", "2026-06-01", "Lake day", [
			"[[Ada]]",
		]);
		const logged = t.events.findBySource("Diary/2026-06-01.md");
		await t.app.fileManager.processFrontMatter(logged.file, (fm) => {
			fm.showOnTimelines = false;
		});
		await t.events.syncDiaryEvent(
			"Diary/2026-06-01.md",
			"2026-06-01",
			"Lake day (edited)",
			["[[Ada]]"]
		);
		const resynced = t.events.findBySource("Diary/2026-06-01.md");
		eq("the re-sync took the entry's new title", resynced.name, "Lake day (edited)");
		eq("...and kept the event off people's timelines", resynced.showOnTimelines, false);
	}

	// ---------- migration: embedded person events ----------
	{
		const t = await createTestVault();
		const ada = await t.addPerson("Ada", {
			events: [
				{
					date: "2025-12-01",
					text: "Ice skating",
					type: "hangout",
					location: "Frog Pond",
					source: "Diary/old.md",
				},
				{
					date: "2026-02-14",
					text: "Gallery",
					hiddenFromUpcoming: true,
				},
			],
		});
		await t.migration.run();

		const events = t.events.getEvents();
		eq("both embedded events became files", events.length, 2);
		const skate = events.find((e) => e.name === "Ice skating");
		eq("fields carry over", skate.location, "Frog Pond");
		eq("diary source carries over", skate.source, "Diary/old.md");
		eq("the person is linked back", skate.people, ["[[Ada]]"]);
		// These rows lived inside a person's frontmatter, so every one of
		// them is a record of that person — never a calendar entry of
		// yours, whatever the old hidden flag said.
		eq(
			"embedded rows migrate as timeline entries",
			events.map((e) => e.variant),
			["timeline", "timeline"]
		);
		eq(
			"the events key is gone from the person",
			"events" in t.frontmatterOf(ada),
			false
		);
		ok(
			"the person's body lists them",
			t.bodyOf(ada).includes("## Events")
		);

		await t.migration.run();
		eq("re-running migrates nothing twice", t.events.getEvents().length, 2);
	}

	// ---------- migration: legacy interactions key ----------
	{
		const t = await createTestVault();
		const ada = await t.addPerson("Ada", {
			interactions: [{ date: "2024-01-01", text: "Met up" }],
		});
		await t.migration.run();
		eq(
			"interactions rows migrate too",
			t.events.getEvents().map((e) => e.name),
			["Met up"]
		);
		eq(
			"...and the key is dropped",
			"interactions" in t.frontmatterOf(ada),
			false
		);
	}

	// ---------- migration: reminder files ----------
	{
		const t = await createTestVault();
		await t.addPerson("Laura");
		await t.vault.createFolder("Friends/Reminders");
		await t.vault.create(
			"Friends/Reminders/Houndmouth Concert.md",
			[
				"---",
				"kind: reminder",
				"name: Houndmouth Concert",
				"date: 2026-08-06",
				'time: "19:00"',
				"type: concert",
				"people: Laura",
				"notes: Doors at 7",
				"status: open",
				"created: 2026-07-01",
				"---",
				"",
			].join("\n")
		);
		await t.migration.run();

		const events = t.events.getEvents();
		eq("the reminder became an event file", events.length, 1);
		const e = events[0];
		eq("kind flipped", t.frontmatterOf(e.file).kind, "event");
		eq("it moved into Events/", e.file.path.startsWith("Friends/Events/"), true);
		eq("time carries over", e.time, "19:00");
		eq("type carries over", e.type, "concert");
		eq("people text became wikilinks", e.people, ["[[Laura]]"]);
		eq("notes became the description", e.description, "Doors at 7");
		eq(
			"the empty Reminders folder is gone",
			t.vault.getAbstractFileByPath("Friends/Reminders"),
			null
		);
	}

	// ---------- migration drops the emoji from the filename too ----------
	{
		const t = await createTestVault();
		await t.vault.createFolder("Friends/Reminders");
		await t.vault.create(
			"Friends/Reminders/Movie night.md",
			[
				"---",
				"kind: reminder",
				"name: 🎬 Movie night",
				"date: 2026-09-01",
				"status: open",
				"created: 2026-07-01",
				"---",
				"",
			].join("\n")
		);
		await t.migration.run();

		const e = t.events.getEvents()[0];
		eq(
			"the migrated filename drops the leading emoji",
			e.file.path,
			"Friends/Events/2026-09-01 Movie night.md"
		);
		eq(
			"the frontmatter name keeps it",
			t.frontmatterOf(e.file).name,
			"🎬 Movie night"
		);
	}

	// ---------- migration: the legacy Reminders.md store ----------
	{
		const t = await createTestVault();
		await t.vault.create(
			"Friends/Reminders.md",
			[
				"---",
				"reminders:",
				"  - id: abc123",
				"    name: Renew passport",
				"    date: 2026-09-01",
				"    type: task",
				"    status: open",
				"  - id: def456",
				"    name: Done thing",
				"    status: done",
				"---",
				"",
			].join("\n")
		);
		await t.migration.run();
		const events = t.events.getEvents();
		eq("both rows became files", events.length, 2);
		eq(
			"a done row stays done",
			events.find((e) => e.name === "Done thing").status,
			"done"
		);
		ok(
			"the store is gone from where it was",
			t.vault.getAbstractFileByPath("Friends/Reminders.md") === null
		);
		ok(
			"…into the trash, not deleted outright",
			t.app.fileManager.trashed.includes("Friends/Reminders.md")
		);
	}

	// ---------- migration: only its own old stores ----------
	// Detection runs on every cache settle, so anything it mistakes for an
	// old store is trashed or rewritten within seconds of being created.
	{
		const t = await createTestVault();
		await t.vault.create(
			"Friends/Reminders.md",
			["---", "tags: [todo]", "---", "", "- Call mum"].join("\n")
		);
		await t.migration.run();
		ok(
			"a note of your own called Reminders isn't trashed",
			t.vault.getAbstractFileByPath("Friends/Reminders.md") !== null
		);
	}
	{
		const t = await createTestVault();
		await t.vault.createFolder("Friends/Reminders");
		await t.migration.run();
		ok(
			"an empty Reminders folder of your own isn't trashed",
			t.vault.getAbstractFileByPath("Friends/Reminders") !== null
		);
	}
	{
		const t = await createTestVault();
		const bo = await t.addPerson("Bo", { events: "see the diary" });
		await t.migration.run();
		eq(
			"a person's own events field that isn't a list is left alone",
			t.frontmatterOf(bo).events,
			"see the diary"
		);
		eq("...and nothing is migrated from it", t.events.getEvents().length, 0);
	}

	// ---------- keeping an event off someone's timeline ----------
	// A calendar entry can name people without being a record about them.
	// The flag only ever opts out: absent means "on their timeline", which
	// is how every event written before it existed behaved.
	{
		const t = await createTestVault();
		const ada = await t.addPerson("Ada Fenwick");
		const link = `[[${ada.basename}]]`;

		await t.events.createEvent({
			name: "Dinner with Ada",
			date: "2026-08-06",
			people: [link],
		});
		let byPerson = t.events.eventsByPersonPath();
		eq(
			"an event with no flag lands on their timeline",
			(byPerson.get(ada.path) ?? []).map((e) => e.name),
			["Dinner with Ada"]
		);

		const hidden = await t.events.createEvent({
			name: "Buy Ada a present",
			date: "2026-08-07",
			people: [link],
			showOnTimelines: false,
		});
		byPerson = t.events.eventsByPersonPath();
		eq(
			"an opted-out event stays off it",
			(byPerson.get(ada.path) ?? []).map((e) => e.name),
			["Dinner with Ada"]
		);
		eq(
			"...though she's still named on the event",
			t.events
				.getEvents()
				.find((e) => e.name === "Buy Ada a present")
				?.people,
			[link]
		);
		eq(
			"...and only the opt-out is written to the note",
			t.frontmatterOf(hidden).showOnTimelines,
			false
		);

		// Absent is the default, so the key stays out of ordinary notes.
		const plain = t.events
			.getEvents()
			.find((e) => e.name === "Dinner with Ada");
		eq("the default reads as true", plain?.showOnTimelines, true);
		eq(
			"...without a key in the file",
			"showOnTimelines" in t.frontmatterOf(plain.file),
			false
		);

		// Turning it back on removes the key rather than writing true.
		await t.events.updateEvent(hidden, {
			name: "Buy Ada a present",
			date: "2026-08-07",
			people: [link],
			showOnTimelines: true,
		});
		eq(
			"opting back in drops the key",
			"showOnTimelines" in t.frontmatterOf(hidden),
			false
		);
		eq(
			"...and it returns to her timeline",
			(t.events.eventsByPersonPath().get(ada.path) ?? []).length,
			2
		);
	}

	// ---------- cancelling ----------
	// A soft delete: the note stays, so the plan you made is still on the
	// record, but it stops counting as something that's happening.
	{
		const t = await createTestVault();
		const file = await t.events.createEvent({
			name: "Houndmouth",
			date: "2026-09-12",
		});
		eq("a new event starts open", t.events.getEvents()[0]?.status, "open");

		await t.events.setStatus(file, "cancelled");
		eq(
			"cancelling is recorded on the note",
			t.frontmatterOf(file).status,
			"cancelled"
		);
		eq(
			"...and reads back",
			t.events.getEvents()[0]?.status,
			"cancelled"
		);
		eq(
			"...without deleting anything",
			t.events.getEvents().length,
			1
		);

		await t.events.setStatus(file, "open");
		eq("restoring puts it back", t.events.getEvents()[0]?.status, "open");
	}
	// An unrecognised status reads as open rather than vanishing into a
	// state nothing renders.
	{
		const t = await createTestVault();
		await t.vault.create(
			"Friends/Events/Odd.md",
			"---\nname: Odd\nstatus: banana\n---\n"
		);
		eq(
			"a nonsense status falls back to open",
			t.events.getEvents().find((e) => e.name === "Odd")?.status,
			"open"
		);
	}

	// ---------- dated drafts on the plan timeline ----------
	// A draft with a day is still a draft, but it belongs on the timeline
	// beside the ideas — the whole point of giving it a day.
	{
		const { PlanOperations, ContactOperations } = await import(
			"./.build/callander.mjs"
		);
		const fm = {
			drafts: [
				{ text: "Ask about the ferry", created: "2026-08-01" },
				{
					text: "Maybe the night market?",
					created: "2026-08-01",
					date: "2026-08-13",
				},
			],
			items: [
				{
					text: "Lobster roll",
					category: "food",
					priority: "must",
					date: "2026-08-12",
				},
			],
		};
		eq(
			"a draft's date survives parsing",
			ContactOperations.draftsOf(fm)[1]?.date,
			"2026-08-13"
		);
		eq(
			"...and an undated one has no date key",
			"date" in ContactOperations.draftsOf(fm)[0],
			false
		);

		const timeline = PlanOperations.timelineOf(fm);
		eq(
			"only the dated draft reaches the timeline",
			timeline.filter((e) => e.source === "draft").map((e) => e.text),
			["Maybe the night market?"]
		);
		eq(
			"...pointing back at its index in the drafts list",
			timeline.find((e) => e.source === "draft")?.index,
			1
		);
		// Ordering is by date like everything else, so a draft slots in
		// among the ideas rather than clumping at either end.
		eq(
			"the timeline stays in date order",
			timeline.map((e) => e.text),
			["Lobster roll", "Maybe the night market?"]
		);
	}

	// ---------- a draft leads its own day ----------
	// Not just sorted in by time — a draft has none, and used to fall in
	// wherever "no time" happens to sort (after everything timed). It's the
	// thought still unsettled about the day, so it reads first.
	{
		const { PlanOperations } = await import("./.build/callander.mjs");
		const fm = {
			drafts: [
				{ text: "Figure out dinner", created: "2026-08-01", date: "2026-08-12" },
			],
			items: [
				{ text: "Museum", category: "activity", priority: "must", date: "2026-08-12", time: "09:00" },
			],
			accommodation: [
				{ text: "Hotel", date: "2026-08-12" },
			],
			travel: [
				{ text: "Train in", date: "2026-08-12", time: "07:00" },
			],
		};
		eq(
			"the draft leads, ahead of a timed leg, an idea and the stay",
			PlanOperations.timelineOf(fm).map((e) => e.text),
			["Figure out dinner", "Train in", "Museum", "Hotel"]
		);
	}

	// ---------- quick ideas (unscheduled, plan-local) ----------
	{
		const { PlanOperations } = await import("./.build/callander.mjs");

		// Hostile shapes on purpose: this is hand-editable YAML, so a scalar
		// where a list belongs must come out empty rather than throw.
		const fm = {
			quickIdeas: [
				{
					text: "Oyster place",
					type: "restaurant",
					categories: ["Boston", "Food"],
					dates: ["2026-07-30", "2026-07-31"],
					time: "dinner",
					cost: 40,
				},
				// Deliberately between the two Boston ideas: it pushes "Ball
				// game" to index 2, so a per-group position (0,1) and the real
				// index (0,2) can no longer look the same.
				{ text: "Nothing planned" },
				{ text: "Ball game", categories: ["Boston"] },
				{ text: "", categories: ["Ignored"] },
				{ notes: "textless, dropped" },
			],
		};
		const ideas = PlanOperations.quickIdeasOf(fm);
		eq(
			"only ideas with text survive",
			ideas.map((i) => i.text),
			["Oyster place", "Nothing planned", "Ball game"]
		);
		eq("categories parse as a list", ideas[0].categories, ["Boston", "Food"]);
		eq("dates parse as a list", ideas[0].dates, [
			"2026-07-30",
			"2026-07-31",
		]);
		eq("the type carries over", ideas[0].type, "restaurant");
		eq("cost is kept", ideas[0].cost, 40);
		eq("a bare idea gets empty lists, not undefined", ideas[1].categories, []);

		// ---- grouping ----
		const groups = PlanOperations.groupQuickIdeas(ideas);
		eq(
			"a group per category, in first-seen order, then Other",
			groups.map((g) => g.label),
			["Boston", "Food", "Other"]
		);
		eq(
			"an idea in two categories appears under both",
			groups
				.filter((g) => g.label === "Boston" || g.label === "Food")
				.map((g) => g.entries.map((e) => e.idea.text)),
			[["Oyster place", "Ball game"], ["Oyster place"]]
		);
		eq(
			"uncategorised falls to Other",
			groups.at(-1).entries.map((e) => e.idea.text),
			["Nothing planned"]
		);
		// The index is what routes an edit back to the one real object — a
		// row under "Food" must still point at the plan's own item 0.
		eq(
			"entries keep their real index, not a per-group position",
			groups[0].entries.map((e) => e.index),
			[0, 2]
		);
		eq(
			"...including in a second group the same idea appears in",
			groups[1].entries.map((e) => e.index),
			[0]
		);

		// Nothing categorised at all: one unlabelled run, because "Other"
		// would name a distinction nobody is drawing.
		const plain = PlanOperations.groupQuickIdeas(
			PlanOperations.quickIdeasOf({
				quickIdeas: [{ text: "A" }, { text: "B" }],
			})
		);
		eq("a wholly uncategorised list is one group", plain.length, 1);
		eq("...with no heading", plain[0].label, "");
		eq(
			"...holding everything",
			plain[0].entries.map((e) => e.idea.text),
			["A", "B"]
		);

		eq("no quickIdeas key at all is empty", PlanOperations.quickIdeasOf({}), []);
	}

	// ---------- "Mate's" folded into Home ----------
	// Mapped on read, so a plan written before the type was removed still
	// shows a real stay rather than an untyped bed.
	{
		const { PlanOperations } = await import("./.build/callander.mjs");
		const stays = PlanOperations.simpleListOf(
			{
				accommodation: [
					{ text: "Riley's spare room", stay: "friends" },
					{ text: "The Ritz", stay: "hotel" },
					{ text: "Untyped", stay: "" },
				],
			},
			"accommodation"
		);
		eq("a legacy friends stay reads as home", stays[0].stay, "home");
		eq("...leaving every other type alone", stays[1].stay, "hotel");
		eq("...and an untyped stay still untyped", stays[2].stay, undefined);
	}

	// ---------- quick idea categories: persisted, not just live-scanned ----------
	{
		const { PlanOperations } = await import("./.build/callander.mjs");

		// Backward compatibility, no migration: a plan with categorised
		// ideas but no explicit quickIdeaCategories field yet still offers
		// them immediately, rather than showing an empty list until each
		// idea happens to be re-saved.
		eq(
			"unions with what's currently referenced when the field is absent",
			PlanOperations.quickIdeaCategoriesOf({
				quickIdeas: [
					{ text: "Oyster place", categories: ["Boston"] },
				],
			}),
			["Boston"]
		);

		// The point of the feature: a category persists even once nothing
		// currently uses it.
		eq(
			"the persisted field survives when no idea references it anymore",
			PlanOperations.quickIdeaCategoriesOf({
				quickIdeaCategories: ["Boston", "Rainy day"],
				quickIdeas: [{ text: "Untagged now" }],
			}),
			["Boston", "Rainy day"]
		);

		// Persisted first, then whatever's newly in use, deduped
		// case-insensitively with the persisted spelling winning.
		eq(
			"persisted and live-referenced categories combine without duplicates",
			PlanOperations.quickIdeaCategoriesOf({
				quickIdeaCategories: ["Boston"],
				quickIdeas: [
					{ text: "A", categories: ["boston"] },
					{ text: "B", categories: ["Food"] },
				],
			}),
			["Boston", "Food"]
		);

		eq(
			"hostile shapes come out empty rather than throwing",
			PlanOperations.quickIdeaCategoriesOf({ quickIdeaCategories: "Boston" }),
			[]
		);
		eq(
			"no field and nothing referenced is empty",
			PlanOperations.quickIdeaCategoriesOf({}),
			[]
		);
	}

	// ---------- ideas still waiting on a day ----------
	// These render above the itinerary under "Needs date", but they're the
	// same objects, so a row has to route an edit back to the right item.
	{
		const { PlanOperations } = await import("./.build/callander.mjs");
		const fm = {
			items: [
				{ text: "Museum", category: "activity", priority: "must" },
				{
					text: "Lobster roll",
					category: "restaurant",
					date: "2026-08-12",
				},
				{
					text: "Night swim",
					category: "activity",
					cost: 0,
					notes: "if it's warm",
				},
			],
		};
		const undated = PlanOperations.undatedIdeaEntries(fm);
		eq(
			"only ideas without a date come through",
			undated.map((e) => e.text),
			["Museum", "Night swim"]
		);
		eq(
			"...indexed against the full items list, not the filtered one",
			undated.map((e) => e.index),
			[0, 2]
		);
		eq("...with an empty date", undated[0].date, "");
		eq("...marked as ideas", undated[0].source, "idea");
		eq("...carrying their detail", undated[1].notes, "if it's warm");
		eq("...including a zero cost", undated[1].cost, 0);

		// The two views of the plan must not overlap: an idea belongs to
		// exactly one of them, or it would render twice.
		const dated = PlanOperations.timelineOf(fm).map((e) => e.text);
		eq("the dated timeline has the rest", dated, ["Lobster roll"]);
		eq(
			"nothing appears in both",
			undated.filter((e) => dated.includes(e.text)).length,
			0
		);
	}

	// ---------- categories ----------
	{
		const t = await createTestVault();
		const file = await t.events.createEvent({
			name: "Celtics vs Knicks",
			date: "2026-10-22",
			categories: ["Celtics", "Sports"],
		});
		eq("categories are stored as a list", t.frontmatterOf(file).categories, ["Celtics", "Sports"]);
		eq(
			"…and read back",
			t.events.getEvents().find((e) => e.file === file)?.categories,
			["Celtics", "Sports"]
		);
		await t.events.updateEvent(file, { name: "Celtics vs Knicks", date: "2026-10-23" });
		eq(
			"an edit that doesn't mention them leaves them alone",
			t.frontmatterOf(file).categories,
			["Celtics", "Sports"]
		);
		await t.events.updateEvent(file, { name: "Celtics vs Knicks", date: "2026-10-23", categories: [] });
		eq("an edit that empties them removes the key", "categories" in t.frontmatterOf(file), false);
		await t.events.createEvent({ name: "Heat vs Celtics", date: "2026-10-30", categories: ["sports", "Away games"] });
		await t.events.createEvent({ name: "Lakers vs Celtics", date: "2026-11-02", categories: ["Celtics", "SPORTS"] });
		eq(
			"every category in use, once each, first spelling kept",
			t.events.getEventCategories(),
			["Away games", "Celtics", "sports"]
		);
	}

	// ---------- renaming and deleting a category everywhere ----------
	{
		const t = await createTestVault();
		const a = await t.events.createEvent({ name: "A", date: "2026-10-01", categories: ["sports", "Boston"] });
		const b = await t.events.createEvent({ name: "B", date: "2026-10-02", categories: ["Sports"] });
		const c = await t.events.createEvent({ name: "C", date: "2026-10-03", categories: ["music"] });

		await t.events.renameCategory("sports", "NBA");
		eq("renamed on the event that had the exact case", t.frontmatterOf(a).categories, ["NBA", "Boston"]);
		eq("...and on one that only matched case-insensitively", t.frontmatterOf(b).categories, ["NBA"]);
		eq("an event without it is untouched", t.frontmatterOf(c).categories, ["music"]);

		// Renaming onto a name the event already carries merges rather than
		// duplicating — "Boston" and "NBA" colliding would otherwise leave
		// two entries that read as the same category.
		await t.events.renameCategory("NBA", "Boston");
		eq("a rename that collides merges into one", t.frontmatterOf(a).categories, ["Boston"]);

		await t.events.deleteCategory("Boston");
		eq("deleting removes it from every event", "categories" in t.frontmatterOf(a), false);
		eq("...even when the key is now empty", "categories" in t.frontmatterOf(b), false);
		eq("the event never carrying it is untouched", t.frontmatterOf(c).categories, ["music"]);
		ok("no event was deleted, only the category", [a, b, c].every((f) => t.vault.getAbstractFileByPath(f.path)));
	}

	// ---------- an event's own colour ----------
	{
		const t = await createTestVault();
		const file = await t.events.createEvent({ name: "Gig", date: "2026-10-02" });
		const colorOf = () => t.events.getEvents().find((e) => e.file === file)?.color;
		eq("an event has no colour of its own to start with", colorOf(), "");
		await t.events.setColor(file, "#AA3344");
		eq("a colour is stored lowercased", t.frontmatterOf(file).color, "#aa3344");
		eq("…and read back", colorOf(), "#aa3344");
		await t.events.updateEvent(file, { name: "Gig", date: "2026-10-03" });
		eq("an edit leaves it alone", colorOf(), "#aa3344");
		await t.events.setColor(file, "");
		eq("clearing it removes the key", "color" in t.frontmatterOf(file), false);
		await t.events.setColor(file, "not a colour");
		eq("something that isn't a hex isn't stored", "color" in t.frontmatterOf(file), false);
	}

	// ---------- timezones, end to end ----------
	// The point of resolving inside toInfo is that nothing downstream had
	// to be taught about zones. These go through the real read path with a
	// pinned viewer zone, so they assert the thing the design claims
	// rather than the arithmetic (tests/timezone.test.mjs has that).
	{
		const t = await createTestVault({ displayTimezone: "America/New_York" });
		const file = await t.events.createEvent({
			name: "Celtics at Bulls",
			date: "2026-10-22",
			time: "12:00",
			timezone: "America/Chicago",
		});
		eq("the file keeps the zone it was entered in", t.frontmatterOf(file).time, "12:00");
		eq("...and names it", t.frontmatterOf(file).timezone, "America/Chicago");

		const e = t.events.getEvents().find((x) => x.name === "Celtics at Bulls");
		eq("read back converted", e.time, "13:00");
		eq("the source survives for editing", e.sourceTime, "12:00");
		eq("as does the zone", e.timezone, "America/Chicago");
	}
	{
		// The one that matters: crossing midnight has to move the DATE, or
		// every consumer that buckets by it — calendar cell, week heading,
		// sort — puts the event on the wrong day while looking right.
		const t = await createTestVault({ displayTimezone: "America/New_York" });
		await t.events.createEvent({
			name: "Late game",
			date: "2026-01-05",
			time: "21:00",
			timezone: "America/Los_Angeles",
		});
		const e = t.events.getEvents().find((x) => x.name === "Late game");
		eq("a 9pm Pacific game reads as midnight", e.time, "00:00");
		eq("...on the following day", e.date, "2026-01-06");
		eq("while the file still says the 5th", e.sourceDate, "2026-01-05");
	}
	{
		// And with no zone — every event that predates this — the read path
		// hands back exactly what the file says.
		const t = await createTestVault({ displayTimezone: "America/New_York" });
		await t.events.createEvent({
			name: "Dinner",
			date: "2026-01-05",
			time: "19:00",
		});
		const e = t.events.getEvents().find((x) => x.name === "Dinner");
		eq("a floating time is untouched", [e.date, e.time], ["2026-01-05", "19:00"]);
		eq("and carries no zone", e.timezone, "");
		eq("no timezone key is written", "timezone" in t.frontmatterOf(e.file), false);
	}
	{
		// Editing from another zone must not rewrite what the event means.
		// This is the shape of the bug the source fields exist to prevent:
		// read in New York, written back from the values the form holds.
		const t = await createTestVault({ displayTimezone: "America/New_York" });
		const file = await t.events.createEvent({
			name: "Game",
			date: "2026-10-22",
			time: "12:00",
			timezone: "America/Chicago",
		});
		const e = t.events.getEvents().find((x) => x.name === "Game");
		await t.events.updateEvent(file, {
			name: "Game (renamed)",
			date: e.sourceDate,
			time: e.sourceTime,
			timezone: e.timezone,
		});
		const fm = t.frontmatterOf(file);
		eq("a round trip leaves the stored time alone", fm.time, "12:00");
		eq("...and its zone", fm.timezone, "America/Chicago");
	}

	return result();
}
