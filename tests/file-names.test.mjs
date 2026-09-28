import { createSuite } from "./harness.mjs";
import { createTestVault } from "./vault.mjs";
import { atFixedDate } from "./fixed-date.mjs";
import { EVENT_SLUG_NAME_MAX, eventSlug, safeFileName } from "./.build/callander.mjs";

/**
 * File naming, beyond what create-paths pins: the pure rules, and the
 * free-name search's edges — a clash, an empty name, and a file allowed to
 * keep the name it already has. File names persist, so each is pinned.
 */
export async function run() {
	const { eq, result } = createSuite("file names");

	// ---------- the pure rules ----------
	eq("illegal characters become dashes, then a trim", safeFileName(' a/b:c#d^e[f]g|h? '), "a-b-c-d-e-f-g-h-");
	eq("the fallback when nothing is left", [safeFileName("  ", "Someday"), safeFileName("")], ["Someday", ""]);

	const alias = (p) => p.replace(/^\[\[|\]\]$/g, "").split("|").pop();
	const target = (p) => p.replace(/^\[\[|\]\]$/g, "").split("|")[0];
	const fields = { name: "🎸 Gig", date: "2026-08-06", people: ["[[Ann Lee|Annie]]"] };
	eq("a slug reads date, who, what — the emoji left out", eventSlug(fields, alias), "2026-08-06 Annie • Gig");
	eq("the person rule is the caller's", eventSlug(fields, target), "2026-08-06 Ann Lee • Gig");
	eq("three people stay out", eventSlug({ ...fields, people: ["[[A]]", "[[B]]", "[[C]]"] }, target), "2026-08-06 Gig");
	eq("a bare date runs into the name", eventSlug({ name: "Gig", date: "2026-08-06" }, target), "2026-08-06 Gig");
	eq("no date or people is the name alone", eventSlug({ name: "Gig" }, target), "Gig");
	eq("an emoji-only name is still something", eventSlug({ name: "   " }, target), "Event");
	const long = "x".repeat(EVENT_SLUG_NAME_MAX) + " tail";
	eq("the name is cut at the cap", eventSlug({ name: long }, target).length, EVENT_SLUG_NAME_MAX);

	// ---------- the free-name search, in a vault ----------
	await atFixedDate(new Date(2026, 7, 5, 12), async () => {
		const t = await createTestVault();

		const a = await t.somedays.createSomeday({ name: "Trip" });
		const b = await t.somedays.createSomeday({ name: "Trip" });
		const blank = await t.somedays.createSomeday({ name: "  " });
		eq("somedays number with a space, and fall back", [a.path, b.path, blank.path], [
			"Friends/Somedays/Trip.md",
			"Friends/Somedays/Trip 1.md",
			"Friends/Somedays/Someday.md",
		]);

		const entry = await t.diary.createEntry("Coffee   with\tSam", "2026-08-04");
		eq("a diary title's whitespace collapses", entry.path, "Diary/2026-08-04 Coffee with Sam.md");
		await t.diary.updateMetadata(entry, "Coffee with Sam", "2026-08-04");
		eq("an unchanged entry keeps its own name", entry.path, "Diary/2026-08-04 Coffee with Sam.md");
		const untitled = await t.diary.createEntry("", "2026-08-04");
		eq("an untitled entry", untitled.path, "Diary/2026-08-04 Untitled.md");

		const first = await t.events.createEvent({ name: "Gig", date: "2026-08-06" });
		const second = await t.events.createEvent({ name: "Gig", date: "2026-08-06" });
		eq("events number with a dash", [first.path, second.path], [
			"Friends/Events/2026-08-06 Gig.md",
			"Friends/Events/2026-08-06 Gig-1.md",
		]);
		await t.events.updateEvent(second, { name: "Gig", date: "2026-08-06" });
		eq("an event keeps its number on an edit that changes nothing", second.path, "Friends/Events/2026-08-06 Gig-1.md");
	});

	return result();
}
