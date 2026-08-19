import { ANY_TIME, roughTime } from "@/constants";
import { formatDate, ordinalDay } from "@/utils/dateFormat";
import { formatShortWeekdayDate } from "@/utils/flexdate";

/**
 * Display helpers shared by the plan timeline and its read view, so a stay
 * that reads "3 nights (Thu-Sun)" in one place reads the same in the other.
 *
 * Name shortening lives in @/utils/nameFormat — it's used well beyond plans.
 */

/**
 * A quick idea's candidate days as a compact human list: a consecutive run
 * collapses to "Sun 2 Aug - Wed 7 Aug" rather than naming every day in it,
 * the same shape formatPlanDateRange uses for the plan's own span.
 *
 * Sorted and deduped before grouping — the stored order is whatever order
 * the days were toggled in, and hand-edited frontmatter can repeat one.
 * A date that won't parse can't be placed in a run with the rest, so it's
 * kept as its own segment (raw text) rather than silently dropped.
 */
export function formatQuickIdeaDates(dates: string[]): string {
	const valid: { iso: string; date: Date }[] = [];
	const invalid: string[] = [];
	for (const iso of dates) {
		const date = new Date(`${iso}T00:00:00`);
		if (isNaN(date.getTime())) invalid.push(iso);
		else valid.push({ iso, date });
	}

	const byIso = new Map<string, Date>();
	for (const { iso, date } of valid) {
		if (!byIso.has(iso)) byIso.set(iso, date);
	}
	const sorted = [...byIso.values()].sort((a, b) => a.getTime() - b.getTime());

	const ONE_DAY = 86400000;
	const segments: string[] = [];
	let runStart: Date | null = null;
	let runEnd: Date | null = null;
	const flushRun = () => {
		if (!runStart || !runEnd) return;
		segments.push(
			runStart.getTime() === runEnd.getTime()
				? formatShortWeekdayDate(runStart)
				: `${formatShortWeekdayDate(runStart)} - ${formatShortWeekdayDate(
						runEnd
				  )}`
		);
	};
	for (const date of sorted) {
		// Rounded, not an exact-ms equality check: a DST transition makes
		// local midnight to local midnight either 23 or 25 real hours, and
		// both are still "the next day".
		const adjacent =
			runEnd && Math.round((date.getTime() - runEnd.getTime()) / ONE_DAY) === 1;
		if (adjacent) {
			runEnd = date;
		} else {
			flushRun();
			runStart = date;
			runEnd = date;
		}
	}
	flushRun();

	return [...segments, ...invalid].join(", ");
}

/**
 * A stored duration ("2h 30m", "45m", "2h") as whole minutes.
 *
 * Tolerant on purpose: the field was free text before it became a pair of
 * dropdowns, so a vault can hold anything someone typed. Anything with a
 * recognisable hour and/or minute figure is read — "2h flight" gives 120 —
 * and anything else gives null rather than a wrong number.
 */
export function parseDurationMinutes(text: string | undefined): number | null {
	if (!text) return null;
	const hours = /(\d+)\s*h/i.exec(text);
	const minutes = /(\d+)\s*m/i.exec(text);
	if (!hours && !minutes) return null;
	const total =
		(hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0);
	// A parse that lands on nothing ("0h 0m") is the same as unset — there's
	// no such thing as a zero-length duration worth recording.
	return total > 0 ? total : null;
}

/** Whole minutes as the canonical stored form: "2h 30m", "2h", "45m", "". */
export function formatDurationLabel(totalMinutes: number): string {
	if (totalMinutes <= 0) return "";
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return [hours > 0 && `${hours}h`, minutes > 0 && `${minutes}m`]
		.filter(Boolean)
		.join(" ");
}

/** "8am" / "12pm" / "5pm" from a 24h "HH:MM" — the hour alone, for a
 * check-in or check-out where the minutes never matter. */
export function formatHourLabel(hour: number): string {
	const period = hour < 12 ? "am" : "pm";
	const display = hour % 12 === 0 ? 12 : hour % 12;
	return `${display}${period}`;
}

/**
 * A stay's hours as one label: "Check in 3pm, 11am out".
 *
 * Unset ends are simply absent rather than shown as a blank — a stay whose
 * check-out nobody has looked up reads "Check in 3pm", not "Check in 3pm,
 * — out". "Any time" is a real answer and does show, collapsing to
 * "Any time in/out" when it's the answer at both ends, since spelling it
 * twice reads like two separate facts rather than one shrug.
 */
export function formatStayHours(
	checkIn: string | undefined,
	checkOut: string | undefined
): string {
	const label = (value: string | undefined) => {
		if (!value) return null;
		if (value === ANY_TIME) return "Any time";
		const hour = /^(\d{1,2}):/.exec(value)?.[1];
		return hour === undefined ? null : formatHourLabel(Number(hour));
	};
	const from = label(checkIn);
	const to = label(checkOut);
	if (from === "Any time" && to === "Any time") return "Any time in/out";
	// "Check in" leads once, rather than on both ends — "Check in 3pm,
	// check out 11am" says the same thing twice as many words.
	if (from && to) return `Check in ${from}, ${to} out`;
	if (from) return `Check in ${from}`;
	if (to) return `${to} out`;
	return "";
}

/** "Thursday 30 July" from an ISO date. */
export function formatTimelineDay(iso: string): string {
	const d = new Date(`${iso}T00:00:00`);
	if (isNaN(d.getTime())) return iso;
	return formatDate(d, {
		weekday: "long",
		day: "numeric",
		month: "long",
	});
}

/** A rough label ("Dinner time") when that's all we know, else a 12h clock. */
export function formatItemTime(time: string): string {
	const rough = roughTime(time);
	if (rough) return rough.label;
	const m = /^(\d{1,2}):(\d{2})$/.exec(time);
	if (!m) return time;
	let hour = parseInt(m[1], 10);
	const minute = m[2];
	const ampm = hour >= 12 ? "pm" : "am";
	hour = hour % 12 || 12;
	return `${hour}:${minute}${ampm}`;
}

export function formatItemCost(cost: number): string {
	return cost === 0 ? "Free" : `$${cost}`;
}

/**
 * The span of a stay: "Thu-Sun" up to six nights, and "until Thu 21st"
 * beyond that — a week or more wraps around to the same weekday, where
 * "Thu-Thu" says nothing.
 *
 * Null for a single night — the day heading it already sits under answers
 * "until when?", so spelling out one night's span is just noise.
 */
export function stayRange(dateISO: string, nights: number): string | null {
	if (nights < 2) return null;
	const start = new Date(`${dateISO}T00:00:00`);
	if (isNaN(start.getTime())) return null;
	const end = new Date(start);
	end.setDate(end.getDate() + nights);
	const weekday = (d: Date) => formatDate(d, { weekday: "short" });
	if (nights > 6) {
		return `until ${weekday(end)} ${ordinalDay(end.getDate())}`;
	}
	return `${weekday(start)}-${weekday(end)}`;
}

/** "3 nights (Thu-Sun)" — how a stay's length reads across the plan views. */
export function nightsSummary(dateISO: string, nights: number): string {
	const range = stayRange(dateISO, nights);
	return `${nightsLabel(nights)}${range ? ` (${range})` : ""}`;
}

/** "2 nights" / "1 night" — the stay-length phrase used in both views. */
export function nightsLabel(nights: number): string {
	return nights === 1 ? "1 night" : `${nights} nights`;
}

/** True when the text already leads with an emoji/pictograph. */
export function startsWithEmoji(text: string): boolean {
	return /^\p{Extended_Pictographic}/u.test(text.trim());
}
