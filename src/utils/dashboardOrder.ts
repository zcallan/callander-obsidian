/**
 * Reconciles a saved dashboard order against the sections that actually exist.
 *
 * A saved order is a snapshot of what the dashboard had the day it was saved,
 * and updates move on: sections get added, and occasionally one is dropped.
 * So the stored array is a preference rather than a specification, and this
 * is what turns it back into a renderable list.
 *
 * Two rules, both about not surprising anyone:
 *
 * - An id that no longer exists is dropped. It would render nothing anyway,
 *   and carrying it forward means a stale order slowly filling with ghosts.
 *
 * - A section the saved order has never seen is inserted where it ships,
 *   relative to the neighbours around it — not appended to the bottom. A
 *   section added by an update is usually the point of that update, and the
 *   bottom of a twelve-section dashboard is where things go to be missed.
 *   Anchoring to the preceding default section keeps "new Diary section, just
 *   under Somedays" true for someone who has never reordered Somedays, and
 *   sensible for someone who has.
 *
 * An empty saved order means "never chosen", and yields the default. That's
 * also why the setting defaults to `[]` rather than to a copy of the default
 * order — a stored copy would freeze today's sections into every vault.
 */
export function resolveDashboardOrder(
	saved: readonly string[],
	all: readonly string[]
): string[] {
	const exists = new Set(all);
	// Dedupe as well as filter: a hand-edited data.json can repeat an id, and
	// a section rendered twice is worse than one rendered in the wrong place.
	const seen = new Set<string>();
	const order: string[] = [];
	for (const id of saved) {
		if (!exists.has(id) || seen.has(id)) continue;
		seen.add(id);
		order.push(id);
	}

	// Anything the saved order never knew about, placed just after the
	// section it ships behind.
	//
	// That predecessor is always already placed: `all` is walked in order,
	// so by the time we reach i, all[i - 1] is either one the saved order
	// kept or one we inserted a moment ago. A loop walking further back
	// looked prudent and was unreachable — mutation testing caught it by
	// finding that shortening it to a single step changed nothing.
	for (let i = 0; i < all.length; i++) {
		const id = all[i];
		if (seen.has(id)) continue;
		seen.add(id);
		const anchor = i === 0 ? -1 : order.indexOf(all[i - 1]);
		if (anchor === -1) order.unshift(id);
		else order.splice(anchor + 1, 0, id);
	}
	return order;
}
