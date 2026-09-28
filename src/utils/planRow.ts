import type { PlanInfo, PlanList } from "@/types";
import { monthName, parseFlexDate } from "@/utils/flexdate";
import { splitLeadingEmoji } from "@/utils/emoji";
import { relativeFromDays, upcomingWhen } from "@/utils/upcomingWhen";
import type { EventRowFields } from "@/utils/eventRow";
import { isoDay, wholeDaysBetween } from "@/utils/dates";

/** A plan's icon when its name doesn't lead with an emoji of its own. */
export const PLAN_ICON = "🗺️";

/**
 * Longest run of days the calendar paints a plan across. A trip is days,
 * not months — anything longer is almost certainly a mistyped end date, and
 * painting it over a season would bury every event underneath.
 */
const MAX_SPAN_DAYS = 62;

/** What a plan row reads. Structural, so tests can pass plain objects. */
export interface RowablePlan {
	name: string;
	date: string;
	endDate: string;
	location: string;
}

/**
 * How a plan reads as a row — shared by the dashboard's Plans section and
 * the Events page, so a trip looks the same in both.
 *
 * People arrive already resolved to names, as they do for eventRowFields;
 * with none, the location rides beside the name instead.
 */
export function planRowFields(
	plan: RowablePlan,
	now: Date,
	peopleNames = ""
): EventRowFields {
	// A leading emoji in the plan name stands in as the row icon
	const lead = splitLeadingEmoji(plan.name);
	const { date, relative, tone } = upcomingWhen(plan.date, now);
	const today = new Date(now);
	today.setHours(0, 0, 0, 0);

	const startFlex = parseFlexDate(plan.date);
	const endFlex = parseFlexDate(plan.endDate);

	// Multi-day plans read as a range: "Saturday 16 Aug - 17 Aug"
	let when = date;
	let endDay: Date | null = null;
	if (endFlex && endFlex.month !== null && endFlex.day !== null) {
		const endYear = endFlex.year ?? startFlex?.year ?? now.getFullYear();
		endDay = new Date(endYear, endFlex.month - 1, endFlex.day);
		if (when) {
			// Self-built short month — see the note in upcomingWhen.
			when += ` - ${endFlex.day} ${monthName(endFlex.month).slice(0, 3)}`;
		}
	}

	// A plan that's underway reads as "today" for its whole span: the start
	// date's "3 days ago" would suggest it had passed. And once it's fully
	// over, the end date is the relevant "ago" — a 4-day trip that finished
	// yesterday should say "1 day ago", not "4".
	let relativeText = relative;
	let relativeTone = tone;
	if (
		endDay &&
		startFlex &&
		startFlex.year !== null &&
		startFlex.month !== null &&
		startFlex.day !== null
	) {
		const startDay = new Date(
			startFlex.year,
			startFlex.month - 1,
			startFlex.day
		);
		if (today >= startDay && today <= endDay) {
			relativeText = "today";
			relativeTone = "soon";
		} else if (today > endDay) {
			// relativeFromDays takes "target minus today" (negative = past),
			// the same convention as upcomingWhen's own target date.
			const daysUntilEnd = wholeDaysBetween(today, endDay);
			({ relative: relativeText, tone: relativeTone } =
				relativeFromDays(daysUntilEnd));
		}
	}

	return {
		icon: lead ? lead.emoji : PLAN_ICON,
		date: when || "No date yet",
		time: "",
		name: lead ? lead.rest : plan.name,
		suffix: peopleNames || plan.location,
		relative: relativeText,
		tone: relativeTone,
	};
}

/**
 * Every day a plan covers, as local YYYY-MM-DD — the squares a calendar
 * puts it in. A weekend away is the whole weekend, not the Saturday.
 *
 * Empty unless the start is known to the day: a plan for "sometime in
 * October" has no square to sit in, the same rule eventsByDay applies. An
 * end that isn't day-precise, or runs backwards, leaves just the start.
 */
export function planDays(plan: { date: string; endDate: string }): string[] {
	const s = parseFlexDate(plan.date);
	if (!s || s.year === null || s.month === null || s.day === null) return [];
	const start = new Date(s.year, s.month - 1, s.day);

	let end = start;
	const e = parseFlexDate(plan.endDate);
	if (e && e.month !== null && e.day !== null) {
		const candidate = new Date(e.year ?? s.year, e.month - 1, e.day);
		// An end with no year of its own landing before the start has
		// crossed New Year: 30 Dec to 2 Jan.
		if (e.year === null && candidate < start) {
			candidate.setFullYear(candidate.getFullYear() + 1);
		}
		if (candidate > start) end = candidate;
	}

	const days: string[] = [];
	for (
		const d = new Date(start);
		d <= end && days.length < MAX_SPAN_DAYS;
		d.setDate(d.getDate() + 1)
	) {
		days.push(isoDay(d));
	}
	return days;
}

/** Weekday names for a bar, indexed by Date.getDay() — the same forms the
 * grid's own column headings use. */
const SPAN_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * The days a bar covers, as it reads on the bar: "Thu 20 - Thu 27".
 *
 * The whole span, not the part in the row being drawn — a bar broken over a
 * week boundary is still one trip, and the dates are what say whether the
 * piece you're looking at is the start of it or the end.
 *
 * Weekday and day of the month, no month name: the grid you're reading it
 * on already says which month, and a bar has one line to spend.
 */
export function planSpanLabel(days: readonly string[]): string {
	if (days.length === 0) return "";
	const read = (iso: string) => {
		const d = new Date(iso + "T00:00:00");
		return `${SPAN_WEEKDAYS[d.getDay()]} ${d.getDate()}`;
	};
	const from = read(days[0]);
	return days.length === 1 ? from : `${from} - ${read(days[days.length - 1])}`;
}

/**
 * The date the Upcoming / Past filter judges a plan by: its last day.
 *
 * A trip that's underway is still ahead of you, so Upcoming keeps it until
 * it's over and Past only takes it once it is — the same split resolveSpan
 * makes. Without a day-precise span the stored date is all there is.
 */
export function planWhenDate(plan: { date: string; endDate: string }): string {
	const days = planDays(plan);
	return days.length > 0 ? days[days.length - 1] : plan.date;
}

/** The plans the Events page lists: all of them, bar any hidden from it. */
export function plansForEventsPage<T extends Pick<PlanInfo, "hiddenFromEvents">>(
	plans: readonly T[]
): T[] {
	return plans.filter((p) => !p.hiddenFromEvents);
}

/**
 * Which lists a plan has been hidden from, and how the button that puts it
 * back should read — null when it's on all of them.
 *
 * Both at once is one button rather than two: the row has room for a single
 * action, and "Show in Upcoming and Events" wouldn't fit on a phone.
 */
export function planHiddenFrom(
	plan: Pick<PlanInfo, "hiddenFromUpcoming" | "hiddenFromEvents">
): { lists: PlanList[]; where: string; label: string } | null {
	const lists: PlanList[] = [];
	if (plan.hiddenFromUpcoming) lists.push("upcoming");
	if (plan.hiddenFromEvents) lists.push("events");
	if (lists.length === 0) return null;
	const where = lists
		.map((l) => (l === "upcoming" ? "Upcoming" : "Events"))
		.join(" and ");
	return {
		lists,
		where,
		label: lists.length > 1 ? "Show again" : `Show in ${where}`,
	};
}

