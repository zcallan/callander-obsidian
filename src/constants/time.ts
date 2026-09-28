// Rough times of day for plan items — the honest-imprecision alternative to an
// exact clock time. `sort` is the notional time each one sits at on the
// timeline, so a "Morning" leg orders before a "Dinner time" one.
export const ROUGH_TIMES = [
	{ id: "early-morning", label: "Early morning", sort: "07:00" },
	{ id: "breakfast", label: "Breakfast", sort: "09:00" },
	{ id: "morning", label: "Morning", sort: "10:30" },
	{ id: "lunch", label: "Lunchtime", sort: "12:30" },
	{ id: "afternoon", label: "Afternoon", sort: "14:00" },
	{ id: "late-afternoon", label: "Late afternoon", sort: "16:30" },
	{ id: "dinner", label: "Dinner time", sort: "19:00" },
	{ id: "late-night", label: "Late night", sort: "21:30" },
] as const;

/**
 * Something that takes the whole day rather than sitting at a point in it.
 * Kept out of ROUGH_TIMES because it isn't a time of day — it's the absence
 * of one with an answer attached, which is why the picker rules it off from
 * the hours below. Sorts to the head of its day: a whole-day thing is
 * already under way by the time anything scheduled starts.
 */
export const ALL_DAY_TIME = {
	id: "all-day",
	label: "All day",
	sort: "00:00",
} as const;

/**
 * Times an event can carry that aren't a time of day: one that runs
 * whenever suits, and one whose hour nobody has settled yet. They live in
 * the same `time` field as "HH:MM" — the way a plan item stores a rough
 * time — so anything reading an event's time has to expect a word as well
 * as digits.
 *
 * `label` is what a row or a calendar chip shows, beside a date and a type
 * and with no room to spare. `long` is for where a time stands more on its
 * own — an event's own page, and the text it copies as — since "TBD" by
 * itself doesn't say what is still to be decided.
 */
export const EVENT_SPECIAL_TIMES = [
	{ id: "anytime", label: "Anytime", long: "Anytime" },
	{ id: "tbd", label: "TBD", long: "Time TBD" },
] as const;

/** The special an event's stored time names, if it names one at all. */
export function specialEventTime(time: string | undefined | null) {
	if (!time) return undefined;
	return EVENT_SPECIAL_TIMES.find((t) => t.id === time);
}

/** Look up a stored rough-time id; undefined for exact "HH:MM" or empty. */
export function roughTime(time: string | undefined | null) {
	if (!time) return undefined;
	if (time === ALL_DAY_TIME.id) return ALL_DAY_TIME;
	return ROUGH_TIMES.find((r) => r.id === time);
}

/** Chronological sort key for a stored time (exact "HH:MM" or a rough id). */
export function timeSortValue(time: string | undefined | null): string {
	if (!time) return "99:99";
	return roughTime(time)?.sort ?? time;
}
