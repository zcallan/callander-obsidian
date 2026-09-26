/**
 * Filtering events by category, as the calendars' drawers do.
 *
 * Stored as the categories that are unticked rather than those that are
 * ticked, so a category that appears later — the next imported season —
 * starts out showing instead of silently hidden. Compared without case,
 * the way the category picker matches names.
 */

/**
 * Does an event with these categories show? Hidden only when it has some
 * and every one of them is unticked: an event also filed under a category
 * still showing is still wanted, and one with none was never filtered.
 */
export function shownByCategory(
	categories: readonly string[],
	hidden: readonly string[]
): boolean {
	if (categories.length === 0) return true;
	const off = new Set(hidden.map((h) => h.toLowerCase()));
	return categories.some((c) => !off.has(c.toLowerCase()));
}

/** The hidden list after ticking (`show`) or unticking a category. */
export function setCategoryShown(
	hidden: readonly string[],
	category: string,
	show: boolean
): string[] {
	const others = hidden.filter(
		(h) => h.toLowerCase() !== category.toLowerCase()
	);
	return show ? others : [...others, category];
}

/** Is this category ticked? */
export function categoryShown(
	hidden: readonly string[],
	category: string
): boolean {
	return !hidden.some((h) => h.toLowerCase() === category.toLowerCase());
}

/** Is this category one of the event's? Compared without case, the way
 * the picker and the drawer both match names. */
export function hasCategory(
	categories: readonly string[],
	category: string
): boolean {
	const key = category.toLowerCase();
	return categories.some((c) => c.toLowerCase() === key);
}

/**
 * Every distinct category across some events' lists, alphabetised, each
 * under the casing it was first seen in.
 *
 * Built from the events on the page rather than from every event in the
 * vault, so the Filters panel never offers a category that would return
 * nothing.
 */
export function categoriesIn(
	lists: Iterable<readonly string[]>
): string[] {
	const seen = new Map<string, string>();
	for (const list of lists) {
		for (const c of list) {
			const key = c.toLowerCase();
			if (!seen.has(key)) seen.set(key, c);
		}
	}
	return [...seen.values()].sort((a, b) =>
		a.localeCompare(b, undefined, { sensitivity: "base" })
	);
}

/**
 * The categories the Filters panel offers: those on the page's events,
 * less the ones ticked off in the calendar's drawer.
 *
 * A category you've hidden from the calendar is one you've said you don't
 * want to see, so offering it as something to narrow to would contradict
 * the drawer sitting next to it. Ticking it back on restores the pill.
 */
export function filterableCategories(
	lists: Iterable<readonly string[]>,
	hidden: readonly string[]
): string[] {
	return categoriesIn(lists).filter((c) => categoryShown(hidden, c));
}

/**
 * How many categories a calendar drawer lists before the rest fold behind
 * "Show N more". Up to `limit`, all of them. Past it, `limit` — unless that
 * would fold away a single one, which costs as much room as just listing
 * it, so one fewer is listed to leave at least two behind the disclosure.
 */
export function visibleCategoryCount(total: number, limit = 5): number {
	if (total <= limit) return total;
	return total - limit >= 2 ? limit : limit - 1;
}
