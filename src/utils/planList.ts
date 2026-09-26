import type { PlanInfo } from "@/types";
import {
	EVENT_SORTS,
	EVENT_WHEN_FILTERS,
	applyEventSort,
	matchesEventWhen,
	type EventSort,
	type EventWhen,
	type SortableEvent,
} from "@/utils/eventRow";
import { planWhenDate } from "@/utils/planRow";

/**
 * What the All plans page lists, filters and orders.
 *
 * The Events page's rules, applied to plans: the same sort, the same
 * Upcoming / Past / All, the same search. Lifted out of the view so they
 * can be tested — a plan that quietly falls out of a list is the kind of
 * thing that only gets noticed when someone goes looking for it.
 */

/** A plan as the page's rows, sorts and filters see it. */
export type PlanListItem = SortableEvent & {
	plan: PlanInfo;
	location: string;
	/** Wikilinks — the members. Named for what an event calls them, so
	 * the same person-resolving helper serves both. */
	people: string[];
	/** What Upcoming / Past judges it by — its last day, see planWhenDate. */
	whenDate: string;
};

export function planListItem(plan: PlanInfo): PlanListItem {
	return {
		plan,
		file: plan.file,
		name: plan.name,
		date: plan.date,
		// No type to speak of, so the Type sort is left off the page's own
		// list (see PLAN_SORTS) and this is only here to satisfy the shape.
		type: "plan",
		status: plan.status,
		created: plan.created,
		updated: plan.updated,
		location: plan.location,
		people: plan.members,
		whenDate: planWhenDate(plan),
	};
}

/**
 * The events' sorts, less the one that has nothing to sort by: every plan
 * is a plan, so "Type" would be a no-op dressed up as a choice.
 */
export const PLAN_SORTS = EVENT_SORTS.filter((s) => s.id !== "type");

/** A stored sort, or Natural when it isn't one this page offers — a value
 * carried over from the Events page's own list would otherwise leave the
 * select blank. */
export function planSortOf(value: unknown): EventSort {
	return PLAN_SORTS.some((s) => s.id === value)
		? (value as EventSort)
		: "natural";
}

/**
 * All first, then Upcoming and Past. The Events page opens on what's
 * ahead; a page of plans is short enough that everything at once is the
 * better front door — and the pills read as "everything, or one half of it".
 */
export const PLAN_WHEN_FILTERS = [
	...EVENT_WHEN_FILTERS.filter((w) => w.id === "all"),
	...EVENT_WHEN_FILTERS.filter((w) => w.id !== "all"),
];

/**
 * Whether the list reads latest-first. Only Upcoming reads forwards —
 * soonest first, the way you'd scan what's ahead. All and Past put the
 * most recent at the top, so with All that means the furthest-off plans
 * lead and the oldest sink to the bottom, rather than a page that opens on
 * whichever trip you made years ago.
 */
export function readsBackwards(when: EventWhen): boolean {
	return when !== "upcoming";
}

/** The facet the page filters by, besides who's on it. */
export const PLAN_STATUSES = [
	{ id: "planning", label: "Planning", emoji: "🗺️" },
	{ id: "done", label: "Done", emoji: "✅" },
] as const;

export type PlanStatusId = (typeof PLAN_STATUSES)[number]["id"];

/**
 * Whether a plan's name, place or people contain the search.
 *
 * `peopleNames` is every member in full, joined, rather than the
 * summarised form a row shows — a roster ending "+3 more" would stop
 * matching the three.
 */
export function planMatchesSearch(
	item: Pick<PlanListItem, "name" | "location">,
	query: string,
	peopleNames: string
): boolean {
	if (!query) return true;
	return (
		item.name.toLowerCase().includes(query) ||
		item.location.toLowerCase().includes(query) ||
		peopleNames.toLowerCase().includes(query)
	);
}

export interface PlanFilters {
	when: EventWhen;
	/** "" for any. */
	status: string;
	/** A person's or group's path; "" for anyone. */
	personPath: string;
	/** Already lower-cased and trimmed. */
	query: string;
	/** Skip Upcoming / Past / All — for pricing a chip, which has to say
	 * what picking it would show under the other filters. */
	anyWhen?: boolean;
}

/**
 * The page's list: filtered, then ordered.
 *
 * The person lookup arrives as functions so this stays free of the
 * metadata cache and testable against plain objects.
 */
export function planPipeline(
	items: readonly PlanListItem[],
	filters: PlanFilters,
	sort: EventSort,
	lookup: {
		paths: (item: PlanListItem) => string[];
		names: (item: PlanListItem) => string;
	},
	now: Date = new Date()
): PlanListItem[] {
	const matches = items.filter(
		(item) =>
			(filters.anyWhen || matchesEventWhen(item.whenDate, filters.when, now)) &&
			(!filters.status || item.status === filters.status) &&
			(!filters.personPath || lookup.paths(item).includes(filters.personPath)) &&
			planMatchesSearch(item, filters.query, lookup.names(item))
	);
	return applyEventSort(matches, sort, {
		recentFirst: readsBackwards(filters.when),
	});
}
