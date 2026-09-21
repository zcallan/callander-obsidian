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
