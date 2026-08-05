import {
	SOMEDAY_SEASONS,
	SOMEDAY_TYPES,
	type Hemisphere,
	type SomedayDay,
	type SomedaySort,
} from "@/constants";
import { parseFlexDate, monthName } from "@/utils/flexdate";
import { nameWithoutLeadingEmoji } from "@/utils/emoji";

/**
 * Ordering for the Somedays list, shared by the Somedays page (which picks
 * the sort) and the dashboard's own list (which follows it).
 *
 * Deliberately structural rather than typed against SomedayInfo: it needs
 * no TFile, so it can be exercised directly against plain objects in the
 * unit suite. SomedayInfo satisfies it as-is.
 */
export interface SortableSomeday {
	file: { path: string; stat: { ctime: number } };
	name: string;
	date: string;
	seasons: string[];
	days: SomedayDay[];
	finalDate: string;
	cost: number | null;
	type: string;
	people: string[];
	status: string;
	convertedTo: string;
}

/** JS getDay() (0=Sun) → our weekday ids. */
export const WEEKDAY_BY_INDEX: SomedayDay[] = [
	"sun",
	"mon",
	"tue",
	"wed",
	"thu",
	"fri",
	"sat",
];

/**
 * Which season each month belongs to, north of the equator. The southern
 * half of the world runs the same cycle six months offset, which is all
 * the `hemisphere` argument below does.
 */
const NORTHERN_SEASON_BY_MONTH: Record<number, string> = {
	1: "winter",
	2: "winter",
	3: "spring",
	4: "spring",
	5: "spring",
	6: "summer",
	7: "summer",
	8: "summer",
	9: "fall",
	10: "fall",
	11: "fall",
	12: "winter",
};

/** The season id a date falls in, or "" if the month is out of range. */
export function seasonOfDate(
	date: Date,
	hemisphere: Hemisphere = "northern"
): string {
	const month = date.getMonth() + 1;
	// Six months round the calendar is exactly the seasonal opposite, so
	// the southern half reuses the same table rather than duplicating it.
	const lookup =
		hemisphere === "southern" ? ((month + 5) % 12) + 1 : month;
	const season = NORTHERN_SEASON_BY_MONTH[lookup] ?? "";
	return SOMEDAY_SEASONS.some((s) => s.id === season) ? season : "";
}

/**
 * Whole days from `now` to a final date; null when it isn't a real
 * day-precision date. Negative once the date has passed.
 */
export function daysUntilFinalDate(
	finalDate: string,
	now: Date
): number | null {
	const flex = parseFlexDate(finalDate);
	if (!flex || flex.year === null || flex.month === null || flex.day === null) {
		return null;
	}
	const target = new Date(flex.year, flex.month - 1, flex.day);
	target.setHours(0, 0, 0, 0);
	const today = new Date(now);
	today.setHours(0, 0, 0, 0);
	return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/**
 * The final date, as a deadline phrase at whatever precision it's
 * recorded: "before 12 Sep" for an exact day (day-first, like every other
 * date in this app), "by end of August" for a month, "by end of 2026" for
 * a bare year. "" when unset.
 *
 * A year only shows on the day/month forms when it isn't `now`'s year —
 * the Final date field is always day-precision today, so month/year only
 * arise from a hand-edited note, but the display stays correct either way.
 */
export function finalDateLabel(iso: string, now: Date): string {
	const f = parseFlexDate(iso);
	if (!f) return "";
	const distantYear =
		f.year !== null && f.year !== now.getFullYear() ? ` ${f.year}` : "";
	if (f.month !== null && f.day !== null) {
		return `before ${f.day} ${monthName(f.month).slice(0, 3)}${distantYear}`;
	}
	if (f.month !== null) {
		return `by end of ${monthName(f.month)}${distantYear}`;
	}
	if (f.year !== null) {
		return `by end of ${f.year}`;
	}
	return "";
}

/**
 * The "When" date, once it's rough enough to read as a deadline rather
 * than a day: "by end of Sep" for a month, "by end of 2026" for a bare
 * year. "" for exact-day precision — that stays paired with the
 * day-of-week summary instead — and "" when unset.
 *
 * Month is abbreviated, matching the day-precision phrasing ("before 12
 * Sep") that can sit next to this on the same line.
 */
export function dateDeadlineLabel(iso: string, now: Date): string {
	const f = parseFlexDate(iso);
	if (!f || f.day !== null) return "";
	const distantYear =
		f.year !== null && f.year !== now.getFullYear() ? ` ${f.year}` : "";
	if (f.month !== null) {
		return `by end of ${monthName(f.month).slice(0, 3)}${distantYear}`;
	}
	if (f.year !== null) {
		return `by end of ${f.year}`;
	}
	return "";
}

/**
 * Could this be done today? Weekday first (no chosen days means any day
 * suits), then whichever of season/date is set — the modal makes those
 * two mutually exclusive, and "Any date" constrains nothing.
 *
 * Time of day is deliberately ignored: "possible today" is about the
 * calendar, and every someday suits some part of a day.
 */
export function possibleToday(
	s: SortableSomeday,
	now: Date,
	hemisphere: Hemisphere = "northern"
): boolean {
	const weekday = WEEKDAY_BY_INDEX[now.getDay()];
	if (s.days.length > 0 && !s.days.includes(weekday)) return false;

	if (s.seasons.length > 0) {
		const season = seasonOfDate(now, hemisphere);
		return !!season && s.seasons.includes(season);
	}

	const flex = parseFlexDate(s.date);
	if (!flex) return true;
	if (flex.year !== null && flex.year !== now.getFullYear()) return false;
	if (flex.month !== null && flex.month !== now.getMonth() + 1) return false;
	if (flex.day !== null && flex.day !== now.getDate()) return false;
	return true;
}

const TRIP_TYPES = new Set(["shortTrip", "longTrip"]);
const EAT_DRINK_TYPES = new Set(["food", "drinks"]);

/** How near a final date has to be to count as urgent. */
const URGENT_WINDOW_DAYS = 30;

/**
 * The "Recommended" ordering, as a tuple compared left to right — each
 * factor only breaks ties the ones above it left open.
 *
 * Slots, in the priority they were specified:
 *   0  a final date inside the next 30 days
 *   1  ...and how near it is, so the soonest deadline leads that group
 *   2  possible today (weekday / date / season all permitting)
 *   3  trips sink — they're rarely the answer to "what shall we do?"
 *   4  food and drinks lead
 *   5  has suggested people
 *   6  cheapest first; an unrecorded cost sorts last rather than as free
 *
 * A passed deadline is NOT urgent: the chance is gone, so promoting it
 * would crowd out things that can still be done.
 */
function recommendedKey(
	s: SortableSomeday,
	now: Date,
	hemisphere: Hemisphere
): number[] {
	const until = daysUntilFinalDate(s.finalDate, now);
	const urgent = until !== null && until >= 0 && until <= URGENT_WINDOW_DAYS;
	return [
		urgent ? 0 : 1,
		urgent ? until : 0,
		possibleToday(s, now, hemisphere) ? 0 : 1,
		TRIP_TYPES.has(s.type) ? 1 : 0,
		EAT_DRINK_TYPES.has(s.type) ? 0 : 1,
		s.people.length > 0 ? 0 : 1,
		s.cost ?? Number.MAX_SAFE_INTEGER,
	];
}

/**
 * A stable shuffle: the same seed always produces the same order, so the
 * list doesn't jump around as you type in the search box or flip a
 * filter. A fresh seed per page load is what re-shuffles it.
 */
function randomKey(path: string, seed: number): number {
	let h = (seed ^ 0x9e3779b9) >>> 0;
	for (let i = 0; i < path.length; i++) {
		h = Math.imul(h ^ path.charCodeAt(i), 0x01000193) >>> 0;
	}
	return h >>> 0;
}

/** Done and converted somedays are history, not options — they sit below
 * everything whatever the chosen sort. */
function isSpent(s: SortableSomeday): number {
	return s.status === "done" || s.convertedTo ? 1 : 0;
}

/**
 * Alphabetise on the words, not on a leading emoji.
 *
 * A name may carry its own emoji ("⚾ Red Sox") — the row renders that in
 * place of the type's emoji, so it's decoration the reader looks straight
 * past. Comparing it would sort every such someday above the letters, in
 * an order nobody can see a reason for.
 */
function byName(a: SortableSomeday, b: SortableSomeday): number {
	return nameWithoutLeadingEmoji(a.name).localeCompare(
		nameWithoutLeadingEmoji(b.name)
	);
}

/**
 * Where each type sits in the "Type" sort: alphabetical by the label you
 * actually see, rather than by id — "Long Trip" and "Short Trip" read as
 * L and S, not as l-o-n-g-T-r-i-p.
 *
 * Built from a copy, since filter() on the readonly SOMEDAY_TYPES gives a
 * fresh array — the constant's own order (grouped, not alphabetical) is
 * left alone for the chip rows that rely on it.
 */
const TYPE_RANK = new Map<string, number>(
	SOMEDAY_TYPES.filter((t) => t.id !== "other")
		.sort((a, b) => a.label.localeCompare(b.label))
		.map((t, i) => [t.id, i])
);
/** "Other" is pinned last, as it is everywhere else in the app... */
const OTHER_RANK = TYPE_RANK.size;
/** ...and a someday with no type at all sits below even that — an
 * explicit "Other" is still a decision; a blank one isn't. */
const UNTYPED_RANK = OTHER_RANK + 1;

function typeRank(type: string): number {
	if (type === "other") return OTHER_RANK;
	return TYPE_RANK.get(type) ?? UNTYPED_RANK;
}

export function sortSomedays<T extends SortableSomeday>(
	list: readonly T[],
	sort: SomedaySort,
	options: {
		now?: Date;
		randomSeed?: number;
		hemisphere?: Hemisphere;
	} = {}
): T[] {
	const now = options.now ?? new Date();
	const seed = options.randomSeed ?? 0;
	const hemisphere = options.hemisphere ?? "northern";
	const sorted = [...list];

	// Precomputed rather than derived inside the comparator, which would
	// re-parse every date O(n log n) times.
	const keys = new Map<string, number[]>();
	if (sort === "recommended") {
		for (const s of sorted) {
			keys.set(s.file.path, recommendedKey(s, now, hemisphere));
		}
	}

	sorted.sort((a, b) => {
		const spent = isSpent(a) - isSpent(b);
		if (spent !== 0) return spent;

		switch (sort) {
			case "random":
				return (
					randomKey(a.file.path, seed) - randomKey(b.file.path, seed)
				);
			case "newest":
				return b.file.stat.ctime - a.file.stat.ctime;
			case "oldest":
				return a.file.stat.ctime - b.file.stat.ctime;
			case "nameAsc":
				return byName(a, b);
			case "nameDesc":
				return byName(b, a);
			case "type": {
				const rank = typeRank(a.type) - typeRank(b.type);
				// Within a type, name keeps it readable (and stable).
				return rank !== 0 ? rank : byName(a, b);
			}
			default: {
				const ka = keys.get(a.file.path) ?? [];
				const kb = keys.get(b.file.path) ?? [];
				for (let i = 0; i < ka.length; i++) {
					if (ka[i] !== kb[i]) return ka[i] - kb[i];
				}
				// Everything tied — name keeps the order stable rather than
				// letting it drift between renders.
				return byName(a, b);
			}
		}
	});
	return sorted;
}
