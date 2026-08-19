import { parseFlexDate, formatFlexDate, monthName } from "@/utils/flexdate";
import { formatDate } from "@/utils/dateFormat";

/** Emphasis for a row's relative-time text: "soon" is today/tomorrow,
 * "past" is anything already gone by. Derived from the day count, never by
 * reading the rendered string back. */
export type RowTone = "soon" | "past";

/**
 * Days from today to a flex date. Coarse dates anchor to the start of
 * their period (a bare "August 2026" counts from the 1st) — good enough
 * for a window test, where being a few days out never flips the answer.
 * Null when there's no year at all, which the caller treats as "always
 * show": an undated event is actionable now, not far off.
 */
export function daysUntilFlex(
	dateStr: string | undefined,
	now: Date
): number | null {
	const p = parseFlexDate(dateStr ?? "");
	if (!p || p.year === null) return null;
	const target = new Date(p.year, (p.month ?? 1) - 1, p.day ?? 1);
	target.setHours(0, 0, 0, 0);
	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/** "today" / "4 days ago" / "in 12 days" (etc.) and its tone, from an
 * exact day offset — the piece day-precision dates and a plan's end date
 * both need. */
export function relativeFromDays(days: number): {
	relative: string;
	tone?: RowTone;
} {
	let relative: string;
	if (days === 0) relative = "today";
	else if (days === 1) relative = "tomorrow";
	else if (days === -1) relative = "yesterday";
	else if (days < 0) relative = `${-days} days ago`;
	else if (days <= 90) relative = `in ${days} days`;
	else relative = `in ${Math.round(days / 30)} months`;
	const tone: RowTone | undefined =
		days < 0 ? "past" : days <= 1 ? "soon" : undefined;
	return { relative, tone };
}

/**
 * A date said the way you'd say it out loud, when it's close enough that
 * the day name alone pins it down: "Today • 6 Aug", "This Thursday • 8 Aug"
 * inside a week, "Next Thursday • 15 Aug" inside two.
 *
 * The date rides along on every one of these, "Today" included, even though
 * the name alone would disambiguate on its own — the whole point of naming
 * it conversationally was to save the reader from doing date arithmetic in
 * their head, not to make them do it anyway to find the actual date.
 *
 * Null from a fortnight out, and for anything already past — beyond that
 * range there's more than one candidate weekday, and a date behind you
 * needs the calendar to say which one it was.
 */
export function conversationalLabel(target: Date, days: number): string | null {
	if (days < 0 || days >= 14) return null;
	// Self-built short month — Intl's en-AU "short" doesn't actually
	// abbreviate (renders "August" in full). See upcomingWhen's other note.
	const short = `${target.getDate()} ${monthName(
		target.getMonth() + 1
	).slice(0, 3)}`;
	// The two days nobody says by name.
	if (days === 0) return `Today • ${short}`;
	if (days === 1) return `Tomorrow • ${short}`;
	const weekday = formatDate(target, { weekday: "long" });
	return days < 7 ? `This ${weekday} • ${short}` : `Next ${weekday} • ${short}`;
}

/**
 * The right-hand column, for rows whose date label already names the day.
 *
 * It counts rather than repeats: beside a label reading "Tomorrow" there's
 * no sense in also saying "tomorrow", so it says "in 1 day". Today counts
 * down properly, which sidesteps the whole question of what to call the
 * time of day:
 *
 * - still ahead, at a known time → "in 40 minutes" / "in 3 hours"
 * - that time has passed → "now"
 * - no time at all → "today"
 *
 * Counting beats naming here. "Tonight" is only right after about 6pm,
 * "later today" is vague, and both are guesses about what a clock time
 * means to you; "in 3 hours" is simply true.
 *
 * Null when the day speaks for itself, leaving relativeFromDays to answer.
 */
export function immediacyRelative(
	days: number,
	time: string | undefined,
	now: Date
): string | null {
	if (days === 1) return "in 1 day";
	if (days !== 0) return null;
	// Undated within the day — "today" repeats the label beside it, but
	// it's the only thing that's actually true.
	if (!time) return "today";
	const [rawHour, rawMinute] = time.split(":");
	const hour = Number(rawHour);
	if (!Number.isFinite(hour)) return "today";
	const minute = Number(rawMinute);
	const at = new Date(now);
	at.setHours(hour, Number.isFinite(minute) ? minute : 0, 0, 0);

	const minutes = Math.round((at.getTime() - now.getTime()) / 60000);
	// Started, or near enough that a countdown would be noise.
	if (minutes < 1) return "now";
	if (minutes < 60) {
		return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
	}
	// Nearest hour rather than floor: at 1h50m "in 2 hours" is off by ten
	// minutes, where "in 1 hour" is off by fifty.
	const hours = Math.round(minutes / 60);
	return `in ${hours} hour${hours === 1 ? "" : "s"}`;
}

/** Split "when" into a date ("Friday 21 Aug") and a relative ("in 25 days"). */
export function upcomingWhen(
	dateStr: string,
	now: Date,
	/** Say near dates by weekday — see conversationalLabel. */
	options: { conversational?: boolean } = {}
): { date: string; relative: string; tone?: RowTone } {
	const p = parseFlexDate(dateStr);
	if (!p) return { date: "", relative: "" };
	if (p.year !== null && p.month !== null && p.day !== null) {
		const target = new Date(p.year, p.month - 1, p.day);
		target.setHours(0, 0, 0, 0);
		const today = new Date(now);
		today.setHours(0, 0, 0, 0);
		const days = Math.round(
			(target.getTime() - today.getTime()) / 86400000
		);
		// Close by, the weekday says it better than the calendar does — and
		// carries its own year, so the suffix below never comes up.
		const near = options.conversational
			? conversationalLabel(target, days)
			: null;
		if (near) return { date: near, ...relativeFromDays(days) };
		// Intl's en-AU "short" month doesn't actually abbreviate (renders
		// "July" in full) — build the short form ourselves rather than
		// trust it, the same way TableView's birthdayDate() does.
		const weekday = formatDate(target, { weekday: "long" });
		const year = p.year !== now.getFullYear() ? ` ${p.year}` : "";
		const date = `${weekday} ${p.day} ${monthName(p.month).slice(
			0,
			3
		)}${year}`;
		return { date, ...relativeFromDays(days) };
	}
	// Month precision ("August 2026"): counting days would imply a
	// precision we don't have, so compare whole months instead.
	if (p.year !== null && p.month !== null) {
		const months =
			(p.year - now.getFullYear()) * 12 +
			(p.month - (now.getMonth() + 1));
		let relative: string;
		if (months === 0) relative = "this month";
		else if (months === 1) relative = "next month";
		else if (months === -1) relative = "last month";
		else if (months < 0) relative = `${-months} months ago`;
		else relative = `in ${months} months`;
		// A whole month is never "today" — only the past end gets emphasis.
		return {
			date: formatFlexDate(p),
			relative,
			tone: months < 0 ? "past" : undefined,
		};
	}
	return { date: formatFlexDate(p), relative: "" };
}
