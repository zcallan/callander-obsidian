import type { EventInfo } from "@/types";
import { parseFlexDate, flexSortKey, isFlexUpcoming } from "@/utils/flexdate";
import { daysUntilFlex } from "@/utils/upcomingWhen";

export interface UpcomingItem {
	event: EventInfo;
	/** Sort key; 0 for undated, so they lead. */
	key: number;
	/** Days from today; null when the date is too coarse to count. */
	days: number | null;
}

/**
 * What the dashboard's Upcoming section shows, and in what order.
 *
 * Lifted out of the view so it can be tested: the rules here are the ones
 * that decide whether something you're expecting to see is missing, and
 * "why isn't my event on the dashboard?" is a question with six possible
 * answers below.
 *
 * Excluded, each for its own reason:
 * - `timeline` variant — a record of a person, kept to their page
 * - `done` — ticked off
 * - `cancelled` — called off; still on the Events page, but this section is
 *   for what's actually happening
 *
 * Included but special:
 * - undated ("Anytime") — actionable now, so never out of window, and keyed
 *   to 0 so it leads rather than sorting to some arbitrary date
 * - a passed *task* — still asks to be ticked off for a week afterwards,
 *   where any other passed event is implicitly done
 */
export function upcomingItems(
	events: readonly EventInfo[],
	now: Date
): UpcomingItem[] {
	const items: UpcomingItem[] = [];

	for (const event of events) {
		if (event.variant === "timeline") continue;
		if (event.status === "done") continue;
		if (event.status === "cancelled") continue;

		const p = parseFlexDate(event.date);
		if (!p || p.year === null) {
			items.push({ event, key: 0, days: null });
			continue;
		}
		if (isFlexUpcoming(p, now)) {
			items.push({
				event,
				key: flexSortKey(p),
				days: daysUntilFlex(event.date, now),
			});
			continue;
		}
		if (event.type === "task" && p.month !== null && p.day !== null) {
			const target = new Date(p.year, p.month - 1, p.day);
			target.setHours(0, 0, 0, 0);
			const today = new Date(now);
			today.setHours(0, 0, 0, 0);
			const passed = Math.round(
				(today.getTime() - target.getTime()) / 86400000
			);
			if (passed >= 0 && passed <= 7) {
				items.push({ event, key: flexSortKey(p), days: -passed });
			}
		}
	}

	return items.sort((a, b) => a.key - b.key);
}

/**
 * The near horizon. Anything further out lives on the Events page, so a
 * booking eight months away doesn't crowd out this week — but an undated
 * item has no distance to be beyond the window, so it always stays.
 */
export function withinWindow(
	items: readonly UpcomingItem[],
	windowDays: number
): UpcomingItem[] {
	return items.filter((i) => i.days === null || i.days <= windowDays);
}
