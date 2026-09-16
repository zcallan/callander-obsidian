import { createSuite } from "./harness.mjs";
import { eventPlanSeed, planCategoryForEvent } from "./.build/callander.mjs";

const event = (over = {}) => ({
	name: "Dinner at Neptune Oyster",
	date: "2026-09-11",
	time: "19:30",
	duration: "2h",
	type: "hangout",
	location: "Neptune Oyster",
	description: "Book ahead — they don't take reservations.",
	people: ["[[Lauren Delbridge]]"],
	...over,
});

/**
 * What an event turns into when a plan grows out of it: which timeline
 * category it lands under, and what the new plan inherits.
 */
export function run() {
	const { eq, result } = createSuite("event to plan");

	// ---------- category mapping ----------
	// The two vocabularies overlap but aren't the same list.
	eq("a hangout is a meetup on an itinerary", planCategoryForEvent("hangout"), "meetup");
	eq("a concert is a show", planCategoryForEvent("concert"), "show");
	eq("so is a movie", planCategoryForEvent("movie"), "show");
	eq("so is comedy", planCategoryForEvent("comedy"), "show");
	eq("sports is an event", planCategoryForEvent("sports"), "event");
	// Shared ids pass straight through.
	eq("activity stays activity", planCategoryForEvent("activity"), "activity");
	eq("task stays task", planCategoryForEvent("task"), "task");
	// An unknown or missing type still has to land somewhere editable.
	eq("an unknown type falls back", planCategoryForEvent("wedding"), "other");
	eq("so does no type at all", planCategoryForEvent(""), "other");

	// ---------- what the plan starts with ----------
	{
		const seed = eventPlanSeed(
			event({ people: ["[[Lauren Delbridge]]", "[[Riley Sorensen]]"] }),
			["Lauren", "Riley"]
		);
		eq("the plan is named for the event", seed.prefill.name, "Dinner at Neptune Oyster");
		eq("and dated from it", seed.prefill.date, "2026-09-11");
		// The event is a fixture, not a maybe — it's already on the calendar.
		eq("the event lands as a must-do", seed.item.priority, "must");
		eq("under its mapped category", seed.item.category, "meetup");
		eq("carrying its day", seed.item.date, "2026-09-11");
		eq("its time", seed.item.time, "19:30");
		eq("its duration", seed.item.duration, "2h");
		eq("its place", seed.item.location, "Neptune Oyster");
		// Resolved names, because a timeline entry stores people as text —
		// everyone, joined, not just whoever happens to be first.
		eq("and everyone coming, by name", seed.item.people, "Lauren, Riley");
		// The description describes this entry, not the trip around it.
		eq("the description rides with the entry", seed.item.notes, "Book ahead — they don't take reservations.");
		// Members stay wikilinks, the shape a plan's own list uses.
		eq("members stay links", seed.fields.members, [
			"[[Lauren Delbridge]]",
			"[[Riley Sorensen]]",
		]);
		eq("and the place seeds the plan's own", seed.fields.location, "Neptune Oyster");
	}
	{
		// Nothing optional set: the entry carries only what exists, rather
		// than a row of empty keys.
		const seed = eventPlanSeed(
			event({ time: "", duration: "", location: "", description: "", people: [] }),
			[]
		);
		eq("no time, no key", "time" in seed.item, false);
		eq("no duration, no key", "duration" in seed.item, false);
		eq("no location, no key", "location" in seed.item, false);
		eq("no notes, no key", "notes" in seed.item, false);
		eq("nobody named, no people", "people" in seed.item, false);
		eq("and no fields to write", seed.fields, {});
	}

	// ---------- dates the plan form can't take ----------
	{
		// The plan form offers month/day precision, so a bare year would
		// have to invent a month to show anything at all.
		const seed = eventPlanSeed(event({ date: "2026" }), []);
		eq("a bare-year date starts the form blank", seed.prefill.date, "");
		// And a timeline entry needs a real day or it claims a slot it
		// hasn't got.
		eq("with no day for the timeline", "date" in seed.item, false);
	}
	{
		// A month-precision date is offerable to the form...
		const seed = eventPlanSeed(event({ date: "2026-09" }), []);
		eq("a month is enough for the form", seed.prefill.date, "2026-09");
		// ...but still isn't a day on the schedule.
		eq("but not for the timeline", "date" in seed.item, false);
	}
	{
		const seed = eventPlanSeed(event({ date: "" }), []);
		eq("an undated event starts blank", seed.prefill.date, "");
		eq("and sits on the list, not the schedule", "date" in seed.item, false);
	}

	return result();
}
