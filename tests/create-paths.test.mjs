import { createSuite } from "./harness.mjs";
import { createTestVault } from "./vault.mjs";
import { atFixedDate } from "./fixed-date.mjs";

/**
 * What each create path writes: the file's name, its keys in order, and
 * their values. Key order is part of the contract; people read these notes,
 * and a sync diff shows every reorder.
 *
 * Every create writes its frontmatter through processFrontMatter, so the
 * bytes come from the test stub's YAML writer rather than Obsidian's; they're
 * pinned by keys and values, plus the body, rather than byte for byte.
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
			"…with these keys, in this order",
			t.frontmatterOf(entry),
			{ title: "Coffee with Sam", date: "2026-08-04", created: "2026-08-05" }
		);
		eq("…in the same order", keys(entry), ["title", "date", "created"]);
		eq("…and an empty line of body", t.bodyOf(entry), "\n");
		const again = await t.diary.createEntry("Coffee with Sam", "2026-08-04");
		eq("a second the same gets a number", again.path, "Diary/2026-08-04 Coffee with Sam 1.md");

		// ---------- a plan ----------
		const plan = await t.plans.createPlan({ name: "Cabin trip", date: "2026-09-01", location: " Byron Bay ", endDate: "2026-09-04" });
		eq("a plan is named by its name", plan.path, "Friends/Plans/Cabin trip.md");
		eq(
			"…with these values, the location trimmed",
			t.frontmatterOf(plan),
			{ name: "Cabin trip", date: "2026-09-01", endDate: "2026-09-04", location: "Byron Bay", status: "planning", created: "2026-08-05", updated: "2026-08-05" }
		);
		eq("…in this order", keys(plan), ["name", "date", "endDate", "location", "status", "created", "updated"]);
		eq("…and no body", t.bodyOf(plan), "");
		const bare = await t.plans.createPlan({ name: "Cabin trip", date: "2026-10" });
		eq("a second the same gets a number", bare.path, "Friends/Plans/Cabin trip 1.md");
		eq(
			"…and without a location or end date, neither key",
			keys(bare),
			["name", "date", "status", "created", "updated"]
		);
		const odd = await t.plans.createPlan({ name: 'A/B: "trip"?', date: "2026" });
		eq("characters a file name can't hold become dashes", odd.path, "Friends/Plans/A-B- -trip--.md");
		eq("…while the name itself is kept", t.frontmatterOf(odd).name, 'A/B: "trip"?');

		// ---------- a group page and the dashboard ----------
		const group = await t.contacts.ensureGroupFile("run club");
		eq("a group page takes a capital", group.path, "Friends/Groups/Run club.md");
		eq("…and holds only its name", [t.frontmatterOf(group), t.bodyOf(group)], [{ name: "Run club" }, ""]);
		const dashboard = await t.contacts.ensureDashboardFile();
		eq("the dashboard note", [dashboard.path, t.frontmatterOf(dashboard), t.bodyOf(dashboard)], ["Friends/Dashboard.md", { kind: "dashboard" }, ""]);

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
