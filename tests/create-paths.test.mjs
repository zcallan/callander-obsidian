import { createSuite } from "./harness.mjs";
import { createTestVault } from "./vault.mjs";
import { atFixedDate } from "./fixed-date.mjs";

/**
 * What each create path writes, pinned before the hand-built YAML behind it
 * is replaced: the file's name, its keys in order, and, where no
 * processFrontMatter pass follows, its exact bytes. Key order is part of the
 * contract; people read these notes, and a sync diff shows every reorder.
 *
 * Where a create finishes through processFrontMatter (somedays and events),
 * the bytes come from the test stub's YAML writer rather than Obsidian's, so
 * those are pinned by keys and values instead.
 */
export async function run() {
	const { eq, result } = createSuite("create paths (fake vault)");
	const midday = new Date(2026, 7, 5, 12); // 5 August 2026

	await atFixedDate(midday, async () => {
		const t = await createTestVault();
		const keys = (file) => Object.keys(t.frontmatterOf(file));

		// ---------- a diary entry ----------
		const entry = await t.diary.createEntry("Coffee with Sam", "2026-08-04");
		eq("a diary entry is named by its date and title", entry.path, "Diary/2026-08-04 Coffee with Sam.md");
		eq(
			"…and written exactly so",
			t.read(entry),
			'---\ntitle: "Coffee with Sam"\ndate: 2026-08-04\ncreated: 2026-08-05\n---\n\n'
		);
		const again = await t.diary.createEntry("Coffee with Sam", "2026-08-04");
		eq("a second the same gets a number", again.path, "Diary/2026-08-04 Coffee with Sam 1.md");

		// ---------- a plan ----------
		const plan = await t.plans.createPlan("Cabin trip", "2026-09-01", " Byron Bay ", "2026-09-04");
		eq("a plan is named by its name", plan.path, "Friends/Plans/Cabin trip.md");
		eq(
			"…and written exactly so, the location trimmed",
			t.read(plan),
			'---\nname: "Cabin trip"\ndate: 2026-09-01\nendDate: 2026-09-04\nlocation: "Byron Bay"\nstatus: planning\ncreated: 2026-08-05\nupdated: 2026-08-05\n---\n'
		);
		const bare = await t.plans.createPlan("Cabin trip", "2026-10");
		eq("a second the same gets a number", bare.path, "Friends/Plans/Cabin trip 1.md");
		eq(
			"…and without a location or end date, neither key",
			keys(bare),
			["name", "date", "status", "created", "updated"]
		);
		const odd = await t.plans.createPlan('A/B: "trip"?', "2026");
		eq("characters a file name can't hold become dashes", odd.path, "Friends/Plans/A-B- -trip--.md");
		eq("…while the name itself is kept", t.frontmatterOf(odd).name, 'A/B: "trip"?');

		// ---------- a group page and the dashboard ----------
		const group = await t.contacts.ensureGroupFile("run club");
		eq("a group page takes a capital", group.path, "Friends/Groups/Run club.md");
		eq("…and holds only its name", t.read(group), '---\nname: "Run club"\n---\n');
		const dashboard = await t.contacts.ensureDashboardFile();
		eq("the dashboard note", [dashboard.path, t.read(dashboard)], ["Friends/Dashboard.md", "---\nkind: dashboard\n---\n"]);

		// ---------- a someday ----------
		const someday = await t.somedays.createSomeday({
			name: "Trip to Maine",
			types: ["nature"],
			people: ["[[Sam]]"],
			notes: "Lobster rolls",
			cost: 400,
		});
		eq("a someday is named by its name", someday.path, "Friends/Somedays/Trip to Maine.md");
		eq(
			"…its keys in this order, whatever order they came in",
			keys(someday),
			["kind", "name", "status", "created", "cost", "notes", "types", "people", "updated"]
		);
		eq("…with these values", t.frontmatterOf(someday), {
			kind: "someday",
			name: "Trip to Maine",
			status: "open",
			created: "2026-08-05",
			cost: 400,
			notes: "Lobster rolls",
			types: ["nature"],
			people: ["[[Sam]]"],
			updated: "2026-08-05",
		});
		const plain = await t.somedays.createSomeday({ name: "Trip to Maine" });
		eq(
			"a bare one has no optional keys, and a number",
			[plain.path, keys(plain)],
			["Friends/Somedays/Trip to Maine 1.md", ["kind", "name", "status", "created", "updated"]]
		);

		// ---------- an event ----------
		const event = await t.events.createEvent({
			name: "Dinner",
			date: "2026-08-10",
			time: "19:30",
			type: "hangout",
			people: [],
			location: "Toro",
		});
		eq("an event is named by its date and name", event.path, "Friends/Events/2026-08-10 Dinner.md");
		eq(
			"…its keys in this order",
			keys(event),
			["kind", "name", "status", "created", "date", "time", "type", "location", "variant", "updated"]
		);
		eq("…a calendar entry by default", t.frontmatterOf(event).variant, "reminder");
	});

	return result();
}
