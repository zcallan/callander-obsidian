import type { PlanIdeaCategory } from "@/constants";
import { PLAN_IDEA_CATEGORIES } from "@/constants";
import type { PlanItem } from "@/types";
import { parseFlexDate } from "@/utils/flexdate";

/**
 * What an event becomes when a plan grows out of it.
 *
 * Structural rather than typed against EventInfo: it needs no TFile, so the
 * unit suite can exercise it against plain objects.
 */
export interface PlannableEvent {
	name: string;
	date: string;
	time: string;
	duration: string;
	type: string;
	location: string;
	description: string;
	/** Wikilinks — the same shape a plan's members list stores. */
	people: string[];
}

/**
 * Event type → plan category, for the timeline entry the event becomes.
 *
 * The two vocabularies overlap but aren't the same list: a plan's
 * categories describe what you'd *do* on a trip, an event's describe what
 * kind of thing happened. Where there's no counterpart the nearest one
 * wins — a concert, a movie and a comedy night are all "show" once they're
 * a line on an itinerary, and a hangout is what a plan calls a meetup.
 */
const PLAN_CATEGORY: Record<string, PlanIdeaCategory> = {
	hangout: "meetup",
	party: "event",
	concert: "show",
	movie: "show",
	comedy: "show",
	activity: "activity",
	sports: "event",
	event: "event",
	// A trip is the event most likely to earn a plan of its own, and what
	// you'd put on the itinerary is the going itself.
	trip: "activity",
	milestone: "event",
	life: "other",
	given: "other",
	task: "task",
	other: "other",
};

/** Falls back to "other" — an unknown or empty type still has to land
 * somewhere, and a wrong-but-editable category beats a dropped entry. */
export function planCategoryForEvent(type: string): PlanIdeaCategory {
	const mapped = PLAN_CATEGORY[type];
	if (mapped && PLAN_IDEA_CATEGORIES.some((c) => c.id === mapped)) {
		return mapped;
	}
	return "other";
}

/** Everything a new plan takes from the event it grew out of. */
export interface EventPlanSeed {
	/** What the New plan form opens with. Nothing is written until Create. */
	prefill: { name: string; date: string };
	/** The event itself, as the plan's first timeline entry. */
	item: PlanItem;
	/** Frontmatter written onto the plan once it exists. */
	fields: { location?: string; members?: string[] };
}

/**
 * The event, restated as a plan's starting point.
 *
 * The event is kept, not consumed: it's a real entry on the calendar, and
 * a plan growing around it doesn't unhappen it. It lands on the plan's
 * timeline as a must-do, which is what it already is — the plan is the
 * scaffolding going up around a thing that's already booked.
 *
 * `peopleNames` arrives resolved, because a timeline entry stores whoever's
 * coming as free text where the plan's own members stay wikilinks. The
 * caller owns the metadata cache; this only does the reshaping.
 */
export function eventPlanSeed(
	event: PlannableEvent,
	peopleNames: string[] = []
): EventPlanSeed {
	const flex = parseFlexDate(event.date);
	// The plan form offers month/day precision only, so a bare-year date
	// starts the field blank rather than lying about which month.
	const prefillDate = flex && flex.month !== null ? event.date : "";
	// A timeline entry only shows on the plan's schedule with a real day —
	// anything vaguer sits in the list without pretending to a slot.
	const dayPrecise =
		flex && flex.year !== null && flex.month !== null && flex.day !== null;

	return {
		prefill: { name: event.name, date: prefillDate },
		item: {
			text: event.name,
			category: planCategoryForEvent(event.type),
			// Already on the calendar, so it isn't a maybe.
			priority: "must",
			...(dayPrecise && { date: event.date }),
			...(event.time && { time: event.time }),
			...(event.duration && { duration: event.duration }),
			...(peopleNames.length > 0 && { people: peopleNames.join(", ") }),
			...(event.location && { location: event.location }),
			// The description describes this entry, not the trip around it,
			// so it rides with the entry rather than becoming plan notes.
			...(event.description && { notes: event.description }),
		},
		fields: {
			// Where the event is is the best first guess at where the plan
			// is, and it's one field to correct if the plan outgrows it.
			...(event.location && { location: event.location }),
			...(event.people.length > 0 && { members: event.people }),
		},
	};
}
