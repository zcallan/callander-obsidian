import type { EventInfo, PlanInfo } from "@/types";
import {
	type FlexDate,
	flexSortKey,
	flexToLocalDate,
	isExactFlexDate,
	isFlexUpcoming,
	parseFlexDate,
} from "@/utils/flexdate";
import { daysUntilFlex } from "@/utils/upcomingWhen";
import { parseDurationMinutes } from "@/utils/planFormat";

/**
 * Has a same-day event's own start time already run past its duration?
 *
 * `isFlexUpcoming` only counts days, so an event due to start at 3:30pm
 * still reads as "upcoming" at 11pm the same day — right for something
 * with no known length (a dinner nobody put an end time on stays visible
 * until the day itself turns over), wrong for a 3h15m game that in fact
 * finished at 6:45. Only a *known* duration moves the goalposts; a bare
 * start time says when something begins, not how long it runs.
 */
function hasEndedToday(event: EventInfo, date: FlexDate, now: Date): boolean {
	if (!isExactFlexDate(date)) return false;
	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	const target = flexToLocalDate(date);
	target.setHours(0, 0, 0, 0);
	if (target.getTime() !== today.getTime()) return false;

	const [rawHour = "", rawMinute] = (event.time || "").split(":");
	const hour = Number(rawHour);
	// Empty, "anytime" and "tbd" all fail this the same way a real "HH:MM"
	// wouldn't — none of them name a moment a duration could run out from.
	// Empty needs saying: Number("") is 0, which would read as midnight.
	if (rawHour.trim() === "" || !Number.isFinite(hour)) return false;
	const minutes = parseDurationMinutes(event.duration);
	if (minutes === null) return false;

	const start = new Date(now);
	start.setHours(hour, Number(rawMinute) || 0, 0, 0);
	return now.getTime() >= start.getTime() + minutes * 60000;
}

export interface UpcomingItem {
	event: EventInfo;
	/** Sort key; 0 for undated, so they lead. */
	key: number;
	/** Days from today; null when the date is too coarse to count. */
	days: number | null;
	/**
	 * A task whose day has gone by and that nobody has ticked off. It
	 * stays on the list until someone does, whatever the window says.
	 */
	overdue?: boolean;
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
 * - a passed *task* — a task is the one thing here that doesn't stop
 *   mattering when its date goes by. Every other event is implicitly done
 *   once its day is over; a task asks to be ticked off, and stays until
 *   someone does it, flagged `overdue` so the section can lead with it.
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
		// A same-day event whose known duration has run out falls through
		// exactly like a day that's already gone by — which for a task
		// means the branch below picks it up as overdue instead, the same
		// as any other kind of late.
		if (isFlexUpcoming(p, now) && !hasEndedToday(event, p, now)) {
			items.push({
				event,
				key: flexSortKey(p),
				days: daysUntilFlex(event.date, now),
			});
			continue;
		}
		if (event.type === "task") {
			// No cut-off. A task a month late is more worth seeing than
			// one due on Friday, not less — dropping it after a week
			// meant the ones you'd been avoiding were the ones that
			// quietly disappeared.
			items.push({
				event,
				key: flexSortKey(p),
				days: daysUntilFlex(event.date, now),
				overdue: true,
			});
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
 * The window reaches backwards to Monday so a task due earlier this week
 * stays in view. An overdue one ignores the window entirely — it's the
 * thing the section most needs to say, and a task three weeks late would
 * otherwise be the one that fell off the bottom.
 */
export function thisAndNextWeek<
	T extends { days: number | null; overdue?: boolean }
>(
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
		(i) =>
			i.overdue ||
			i.days === null ||
			(i.days >= opened && i.days <= closes)
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

/**
 * The overdue tasks, and everything else, in the order they were given.
 *
 * A separate pass rather than another `eventPeriod` heading: that function
 * also groups the Events page, which reads backwards through history and
 * has its own "Last week" for the same dates. Overdue is a dashboard idea
 * — "you said you'd do this and you haven't" — so it lives here.
 */
export function splitOverdue(items: readonly UpcomingEntry[]): {
	overdue: UpcomingEntry[];
	rest: UpcomingEntry[];
} {
	// Only an event goes overdue. A plan past its date is already left out
	// by upcomingPlans — finished, or never really dated — so there's no
	// such thing as a late one to find here.
	const late = (i: UpcomingEntry) => i.kind === "event" && i.overdue === true;
	return {
		overdue: items.filter(late),
		rest: items.filter((i) => !late(i)),
	};
}
