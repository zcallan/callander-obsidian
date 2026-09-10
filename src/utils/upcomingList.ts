import type { EventInfo, PlanInfo } from "@/types";
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
 * This week and next. Anything further out lives on the Events page, so a
 * booking eight months away doesn't crowd out the next fortnight — but an
 * undated item has no distance to be beyond the window, so it always stays.
 *
 * Whole weeks rather than a rolling count of days: on a Friday, "the next
 * 14 days" quietly means most of the week after next, while "this week and
 * next" is a span you can picture. It also matches the headings the
 * timeline view groups by.
 *
 * The window reaches backwards to Monday, which matters for exactly one
 * thing: upcomingItems keeps a passed *task* for a week so it can still be
 * ticked off, and that task should stay in view rather than fall out of a
 * window that opens today. Every other kind of event is already gone by
 * the time its date passes.
 */
export function thisAndNextWeek<T extends { days: number | null }>(
	items: readonly T[],
	now: Date = new Date(),
	startsOn: 0 | 1 = 1
): T[] {
	// How many days back this week opened. Follows the same setting the
	// calendars do — a fortnight measured from a Monday while the grids
	// count from a Sunday would put the boundary in a different place on
	// the two pages. The +7 keeps it negative-or-zero rather than wrapping.
	const opened = -((now.getDay() - startsOn + 7) % 7);
	const closes = opened + 13;
	return items.filter(
		(i) => i.days === null || (i.days >= opened && i.days <= closes)
	);
}

/** A plan on the dashboard's Upcoming list, keyed like an event. */
export interface UpcomingPlan {
	plan: PlanInfo;
	key: number;
	days: number | null;
}

/**
 * The plans worth showing beside what's coming up.
 *
 * The same window an event gets, and the same reasons for leaving one out:
 * a plan you've marked done is history, and one whose date has gone by is
 * either finished or was never dated properly — neither is "coming up".
 *
 * A plan with no date at all leads, keyed to 0 like an undated event. That's
 * the common case early on: somebody says "we should do that", the plan
 * exists before the date does, and it's exactly the one that gets forgotten
 * if it sorts to the bottom.
 */
export function upcomingPlans(
	plans: readonly PlanInfo[],
	now: Date
): UpcomingPlan[] {
	const items: UpcomingPlan[] = [];
	for (const plan of plans) {
		if (plan.status === "done") continue;
		// Hidden by hand from this list only — it stays in the Plans
		// section, which is where it can be put back.
		if (plan.hiddenFromUpcoming) continue;
		const p = parseFlexDate(plan.date);
		if (!p || p.year === null) {
			items.push({ plan, key: 0, days: null });
			continue;
		}
		if (!isFlexUpcoming(p, now)) continue;
		items.push({
			plan,
			key: flexSortKey(p),
			days: daysUntilFlex(plan.date, now),
		});
	}
	return items.sort((a, b) => a.key - b.key);
}

/** One line of the Upcoming list: an event, or a plan. */
export type UpcomingEntry =
	| ({ kind: "event" } & UpcomingItem)
	| ({ kind: "plan" } & UpcomingPlan);

/**
 * Events and plans interleaved by date.
 *
 * One list rather than two, because "what's coming up" is one question. A
 * plan sorts among the events on the day it starts; the undated ones from
 * either lead together, since both are keyed to 0.
 *
 * A tie puts the plan first. A plan is the container for a day and the
 * events are what happens inside it, so a plan reading after them would be
 * a heading trailing its own contents.
 */
export function mergeUpcoming(
	events: readonly UpcomingItem[],
	plans: readonly UpcomingPlan[]
): UpcomingEntry[] {
	const merged: UpcomingEntry[] = [
		...events.map((e) => ({ kind: "event" as const, ...e })),
		...plans.map((p) => ({ kind: "plan" as const, ...p })),
	];
	const rank = (e: UpcomingEntry) => (e.kind === "plan" ? 0 : 1);
	return merged.sort((a, b) => a.key - b.key || rank(a) - rank(b));
}
