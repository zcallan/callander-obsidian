/**
 * The Events page's list: what one row is, and which rows a set of filters
 * leaves, in which order. The mirror of planList.ts for the Plans page.
 */

import type { EventType } from "@/constants";
import type { EventInfo, PlanInfo } from "@/types";
import {
	applyEventSort,
	matchesEventWhen,
	type EventSort,
	type EventWhen,
	type SortableEvent,
} from "@/utils/eventRow";
import { hasCategory } from "@/utils/eventCategories";
import { planWhenDate } from "@/utils/planRow";

/**
 * One row on the page — an event, or a plan shown among them.
 *
 * Carries the fields applyEventSort reads, so the two sort as one list by
 * whichever sort is picked rather than as two lists stapled together. A
 * plan's type is "plan", which no type chip matches: picking a type narrows
 * to events of that type, and a plan isn't one.
 */
export type EventPageItem = SortableEvent & {
	time: string;
	location: string;
	/** Wikilinks — an event's people, a plan's members. */
	people: string[];
	description: string;
	/** An event's categories. A plan has none, so a category filter drops
	 * it — the same way a type chip does. */
	categories: string[];
	/** What Upcoming / Past judges it by — see planWhenDate. */
	whenDate: string;
} & ({ kind: "event"; event: EventInfo } | { kind: "plan"; plan: PlanInfo });

export function eventPageItem(event: EventInfo): EventPageItem {
	return {
		kind: "event",
		event,
		file: event.file,
		name: event.name,
		date: event.date,
		type: event.type,
		status: event.status,
		created: event.created,
		updated: event.updated,
		time: event.time,
		location: event.location,
		people: event.people,
		description: event.description,
		categories: event.categories,
		whenDate: event.date,
	};
}

export function planPageItem(plan: PlanInfo): EventPageItem {
	return {
		kind: "plan",
		plan,
		file: plan.file,
		name: plan.name,
		date: plan.date,
		type: "plan",
		status: plan.status,
		// Read as unstamped, though plans do carry created and updated,
		// so Oldest and Last updated sink them to the end — the same place
		// an unstamped event goes.
		created: "",
		updated: "",
		time: "",
		location: plan.location,
		people: plan.members,
		description: "",
		categories: [],
		whenDate: planWhenDate(plan),
	};
}

/** The page's filters, each facet already resolved to its value. */
export interface EventFilters {
	when: EventWhen;
	/** Skip `when`: the Calendar tab's arrows are its own. */
	anyWhen?: boolean;
	type: EventType | "";
	category: string;
	personPath: string;
	/** The search box as typed; trimmed and lower-cased here. */
	query: string;
}

/** How a row's people resolve, which needs the vault. */
export interface EventPeopleLookup {
	/** Their links resolved to vault paths. */
	paths: (e: EventPageItem) => string[];
	/** Every name in full, joined — what the search reads. */
	names: (e: EventPageItem) => string;
}

/** Does a row pass the type, category and person facets? */
export function eventMatchesFacets(
	e: EventPageItem,
	filters: Pick<EventFilters, "type" | "category" | "personPath">,
	paths: EventPeopleLookup["paths"]
): boolean {
	if (filters.type && e.type !== filters.type) return false;
	if (filters.category && !hasCategory(e.categories, filters.category)) {
		return false;
	}
	if (filters.personPath && !paths(e).includes(filters.personPath)) {
		return false;
	}
	return true;
}

/** Search over name, description, location and people's full names. */
export function eventMatchesSearch(
	e: EventPageItem,
	q: string,
	names: EventPeopleLookup["names"]
): boolean {
	if (!q) return true;
	return (
		e.name.toLowerCase().includes(q) ||
		e.description.toLowerCase().includes(q) ||
		e.location.toLowerCase().includes(q) ||
		names(e).toLowerCase().includes(q)
	);
}

/** The rows the filters leave, sorted. */
export function eventPipeline<T extends EventPageItem>(
	items: readonly T[],
	filters: EventFilters,
	sort: EventSort,
	people: EventPeopleLookup,
	now: Date
): T[] {
	const q = filters.query.trim().toLowerCase();
	const matches = items.filter(
		(e) =>
			(filters.anyWhen ||
				matchesEventWhen(e.whenDate, filters.when, now)) &&
			eventMatchesFacets(e, filters, people.paths) &&
			eventMatchesSearch(e, q, people.names)
	);
	// Looking back, the natural order runs the other way: the most recent
	// thing is the near end of the list, the way the next thing is when
	// looking forward.
	return applyEventSort(matches, sort, {
		recentFirst: filters.when === "past",
	});
}
