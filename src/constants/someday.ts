// ---- Somedays: a wishlist of ideas, before they become committed Plans ----

// Candidate days-of-week a Someday could happen on. `short` is the one-letter
// chip label (Mon→Sun order is canonical for display).
export const SOMEDAY_DAYS = [
	{ id: "mon", label: "Mon", short: "M" },
	{ id: "tue", label: "Tue", short: "T" },
	{ id: "wed", label: "Wed", short: "W" },
	{ id: "thu", label: "Thu", short: "T" },
	{ id: "fri", label: "Fri", short: "F" },
	{ id: "sat", label: "Sat", short: "S" },
	{ id: "sun", label: "Sun", short: "S" },
] as const;

export type SomedayDay = (typeof SOMEDAY_DAYS)[number]["id"];

// Rough time-of-day windows a someday suits. "Any" isn't an id of its own:
// it's stored as all three windows, so a future filter can ask "does this
// suit the evening?" with a plain includes() rather than special-casing an
// empty or absent value. The modal shows a single "Any" chip for that state.
export const SOMEDAY_TIMES = [
	{ id: "morning", label: "Morning", emoji: "🌅" },
	{ id: "daytime", label: "Daytime", emoji: "☀️" },
	{ id: "night", label: "Night", emoji: "🌙" },
] as const;

export type SomedayTime = (typeof SOMEDAY_TIMES)[number]["id"];

/**
 * Human summary of chosen times: "Morning / Night", or "" when there's
 * nothing worth saying.
 *
 * All three windows is how "Any" is stored, and "any time" is the default
 * every someday carries — printing it on every row would be noise, so it
 * reads as blank here. The modal doesn't use this: it needs to show the
 * "Any" chip as actively chosen, which is a different question.
 */
export function formatSomedayTimes(ids: readonly string[]): string {
	if (!ids || ids.length === 0) return "";
	const found = SOMEDAY_TIMES.filter((t) => ids.includes(t.id));
	if (found.length === 0 || found.length === SOMEDAY_TIMES.length) return "";
	return found.map((t) => t.label).join(" / ");
}

// Quick presets that select several day chips at once.
export const SOMEDAY_DAY_PRESETS = [
	{ id: "weekend", label: "Weekend", days: ["sat", "sun"] },
	{ id: "weekday", label: "Weekday", days: ["mon", "tue", "wed", "thu", "fri"] },
] as const;

// The four seasons — a rough, non-calendar "when" for a someday ("Maine in
// fall"). More than one can apply, e.g. Summer & Fall.
export const SOMEDAY_SEASONS = [
	{ id: "spring", label: "Spring", emoji: "🌸" },
	{ id: "summer", label: "Summer", emoji: "☀️" },
	{ id: "fall", label: "Fall", emoji: "🍂" },
	{ id: "winter", label: "Winter", emoji: "❄️" },
] as const;

/**
 * A season window read as a deadline: "by end of Fall". Where several
 * seasons are chosen the window closes with the last of them, so
 * Summer + Fall reads "by end of Fall".
 *
 * Blank when every season is chosen — that's no constraint at all.
 *
 * "Last" is the canonical spring→summer→fall→winter order rather than
 * whichever comes round next, so the phrase doesn't change meaning as
 * the year turns. A wrap-around pick (winter + spring) therefore reads
 * "by end of Winter".
 */
export function formatSomedaySeasonDeadline(ids: readonly string[]): string {
	if (!ids || ids.length === 0) return "";
	const found = SOMEDAY_SEASONS.filter((s) => ids.includes(s.id));
	if (found.length === 0 || found.length === SOMEDAY_SEASONS.length) {
		return "";
	}
	return `by end of ${found[found.length - 1].label}`;
}

/** Human summary of chosen seasons: "Any season" | "Summer / Fall" | "". */
export function formatSomedaySeasons(ids: readonly string[]): string {
	if (!ids || ids.length === 0) return "";
	const found = SOMEDAY_SEASONS.filter((s) => ids.includes(s.id));
	if (found.length === 0) return "";
	if (found.length === 4) return "Any season";
	return found.map((s) => s.label).join(" / ");
}

// Is this a solo thing, a group thing, or either? "Either" leads (it's the
// default for a new someday). Optional; also a filter.
export const SOMEDAY_COMPANY = [
	{ id: "either", label: "Either", emoji: "🔀" },
	{ id: "group", label: "Group", emoji: "👥" },
	{ id: "solo", label: "Solo", emoji: "🧍" },
] as const;

export type SomedayCompany = (typeof SOMEDAY_COMPANY)[number]["id"];

/** Look up the solo/group option for its emoji/label; undefined when unset. */
export function somedayCompany(id: string | undefined | null) {
	return id ? SOMEDAY_COMPANY.find((c) => c.id === id) : undefined;
}

// What kind of someday it is. Deliberately grouped rather than alphabetical
// (dining, outdoors, culture/entertainment, then trips) — "Other" stays
// pinned last regardless, matching every other type list in the app.
// Compressed from a longer, narrower list — see migrateSomedayTypes() in
// main.ts for what an old id becomes.
export const SOMEDAY_TYPES = [
	{ id: "food", label: "Food", emoji: "🍽️" },
	{ id: "drinks", label: "Drinks", emoji: "🍺" },
	{ id: "nature", label: "Nature", emoji: "🌳" },
	{ id: "activity", label: "Activity", emoji: "🥾" },
	{ id: "explore", label: "Explore", emoji: "📸" },
	{ id: "museum", label: "Museum", emoji: "🏛️" },
	{ id: "show", label: "Show", emoji: "🍿" },
	{ id: "event", label: "Event", emoji: "📅" },
	{ id: "game", label: "Game", emoji: "🏀" },
	{ id: "creative", label: "Creative", emoji: "🎨" },
	{ id: "shopping", label: "Shopping", emoji: "🛍️" },
	{ id: "shortTrip", label: "Short Trip", emoji: "🚘" },
	{ id: "longTrip", label: "Long Trip", emoji: "✈️" },
	{ id: "other", label: "Other", emoji: "✨" },
] as const;

export type SomedayType = (typeof SOMEDAY_TYPES)[number]["id"];

// How the Somedays list is ordered. Chosen on the Somedays page and
// mirrored by the dashboard's own list — see sortSomedays().
export const SOMEDAY_SORTS = [
	{ id: "recommended", label: "Recommended" },
	{ id: "newest", label: "Newest" },
	{ id: "oldest", label: "Oldest" },
	{ id: "type", label: "Type" },
	{ id: "random", label: "Random" },
	{ id: "nameAsc", label: "Name (A-Z)" },
	{ id: "nameDesc", label: "Name (Z-A)" },
] as const;

export type SomedaySort = (typeof SOMEDAY_SORTS)[number]["id"];

// Which half of the world you're in — decides which months a season's
// months are. The only thing that reads it is "possible today" in the
// Somedays "Recommended" sort, matching a someday's chosen seasons
// against the current date.
export const HEMISPHERES = [
	{ id: "northern", label: "Northern" },
	{ id: "southern", label: "Southern" },
] as const;

export type Hemisphere = (typeof HEMISPHERES)[number]["id"];

/** Look up a someday type for its emoji/label; undefined when unset. */
export function somedayType(id: string | undefined | null) {
	return id ? SOMEDAY_TYPES.find((t) => t.id === id) : undefined;
}

/**
 * Human summary of candidate days: "Any day" | "Weekdays" | "Weekends" |
 * "Mon/Tue/Thu/Fri" | "Any day but Wed".
 */
export function formatSomedayDays(days: readonly string[]): string {
	if (!days || days.length === 0) return "";
	const set = new Set(days);
	const present = SOMEDAY_DAYS.filter((d) => set.has(d.id));
	if (present.length === 7) return "Any day";
	if (set.size === 2 && set.has("sat") && set.has("sun")) return "Weekends";
	// Before the exclusion check below, which would otherwise call the
	// working week "Any day but Sat or Sun".
	const weekdays = ["mon", "tue", "wed", "thu", "fri"];
	if (set.size === 5 && weekdays.every((d) => set.has(d))) return "Weekdays";
	// Mostly selected — name the 1–2 exceptions instead of listing six
	const missing = SOMEDAY_DAYS.filter((d) => !set.has(d.id));
	if (missing.length <= 2) {
		return `Any day but ${missing.map((d) => d.label).join(" or ")}`;
	}
	// Two days have room to breathe; three or more would sprawl, so the
	// slashes tighten up. Canonical Mon→Sun order however they were stored.
	const separator = present.length > 2 ? "/" : " / ";
	return present.map((d) => d.label).join(separator);
}
