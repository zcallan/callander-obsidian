type StandardFieldKey = keyof typeof STANDARD_FIELDS;
type StandardFieldValue = (typeof STANDARD_FIELDS)[StandardFieldKey];

export const STANDARD_FIELDS = {
	NAME: "name",
	DISPLAY_NAME: "displayName",
	SHORT_NAME: "shortName",
	NICKNAMES: "nicknames",
	LEGAL_NAME: "legalName",
	BIRTHDAY: "birthday",
	BIRTHDAY_WISHED: "birthdayWished",
	MET: "met",
	HOMETOWN: "hometown",
	BIRTHPLACE: "birthplace",
	LOCATION: "location",
	PARENTS: "parents",
	SIBLINGS: "siblings",
	FRIENDS: "friends",
	RELATED_FILES: "relatedFiles",
	GROUPS: "groups",
	EMAIL: "email",
	PHONE: "phone",
	ADDRESS: "address",
	COMPANY: "company",
	JOB_TITLE: "jobTitle",
	INDUSTRY: "industry",
	RELATIONSHIP: "relationship",
	EVENTS: "events",
	INTERACTIONS: "interactions", // legacy key, migrated to "events"
	CREATED: "created",
	UPDATED: "updated",
	NOTES: "notes",
	EXTRAS: "extras",
	IDEAS: "ideas",
	GIFT_IDEAS: "giftIdeas", // legacy key, migrated to "ideas"
	DRAFTS: "drafts",
	INTERESTS: "interests",
	FUN_FACTS: "funFacts",
	LIFE_GOALS: "lifeGoals",
	QUOTES: "quotes",
} as const;

/**
 * Fields whose values name *other* notes, so an entry can be a `[[Wikilink]]`
 * and gets note autocomplete while editing.
 *
 * Stored as YAML lists rather than one comma-joined string, because Obsidian
 * only indexes a frontmatter link when the whole value is the link — a link
 * embedded in a longer string is inert, invisible to the graph and to
 * backlinks, and silently broken by a rename. A list of whole-value links is
 * what `members` on a plan already does, and it's what makes these show up in
 * graph view for free.
 *
 * Raw text stays welcome: an entry that isn't a link is kept verbatim, so a
 * relative with no note of their own can still be named.
 */
export const LINKABLE_FIELDS: string[] = [
	"parents",
	"siblings",
	"friends",
	"relatedFiles",
];

// System fields that shouldn't be shown as custom fields
export const SYSTEM_FIELDS: StandardFieldValue[] = [
	STANDARD_FIELDS.NAME,
	STANDARD_FIELDS.BIRTHDAY_WISHED,
	STANDARD_FIELDS.EVENTS,
	STANDARD_FIELDS.INTERACTIONS,
	STANDARD_FIELDS.CREATED,
	STANDARD_FIELDS.UPDATED,
	STANDARD_FIELDS.NOTES,
	STANDARD_FIELDS.EXTRAS,
	STANDARD_FIELDS.IDEAS,
	STANDARD_FIELDS.GIFT_IDEAS,
	STANDARD_FIELDS.DRAFTS,
	STANDARD_FIELDS.INTERESTS,
	STANDARD_FIELDS.FUN_FACTS,
	STANDARD_FIELDS.LIFE_GOALS,
	STANDARD_FIELDS.QUOTES,
];

// Fixed idea categories — deliberately few, no user-defined tags (Callander brief)
// `label` names the category on its own (a chip, a hand-typed note heading);
// `plural` is only for the person page's grouped list, which usually holds
// more than one and reads better for it ("GIFTS", not "GIFT").
export const IDEA_CATEGORIES = [
	{ id: "gift", label: "Gift", plural: "Gifts", emoji: "🎁" },
	{ id: "conversation", label: "Conversation", plural: "Conversations", emoji: "💬" },
	{ id: "activity", label: "Activity", plural: "Activities", emoji: "🥾" },
	{ id: "place", label: "Place", plural: "Places", emoji: "📍" },
	{ id: "movie", label: "Movie", plural: "Movies", emoji: "🎬" },
	{ id: "book", label: "Book", plural: "Books", emoji: "📚" },
	{ id: "show", label: "Show", plural: "Shows", emoji: "📺" },
	{ id: "music", label: "Music", plural: "Music", emoji: "🎵" },
	{ id: "recommendation", label: "Recommendation", plural: "Recommendations", emoji: "⭐" },
	{ id: "other", label: "Other", plural: "Other", emoji: "✨" },
] as const;

export type IdeaCategory = (typeof IDEA_CATEGORIES)[number]["id"];

// What a friend is into — factual, never evaluative. Helps with gifts,
// conversations, and plans. Grouped on the friend page like ideas.
// Each has a second, optional "detail" field whose label/placeholder vary by
// category (an author for a book, an artist for a song, etc.).
export const INTEREST_CATEGORIES = [
	{
		id: "hobbies",
		label: "Hobby",
		emoji: "🎨",
		detailLabel: "Details (optional)",
		detailPlaceholder: "Optional details",
	},
	{
		id: "books",
		label: "Book",
		emoji: "📚",
		detailLabel: "Author",
		detailPlaceholder: "e.g. Brandon Sanderson",
	},
	{
		id: "music",
		label: "Song",
		emoji: "🎵",
		detailLabel: "Artist",
		detailPlaceholder: "e.g. Fleetwood Mac",
	},
	{
		id: "musicgenre",
		label: "Music Genre",
		emoji: "🎶",
		detailLabel: "Details (optional)",
		detailPlaceholder: "Optional details",
	},
	{
		id: "movie",
		label: "Movie",
		emoji: "🎬",
		detailLabel: "Details (optional)",
		detailPlaceholder: "Optional details",
	},
	{
		id: "tv",
		label: "TV Show",
		emoji: "📺",
		detailLabel: "Details (optional)",
		detailPlaceholder: "Optional details",
	},
	{
		id: "games",
		label: "Game",
		emoji: "🎮",
		detailLabel: "Details (optional)",
		detailPlaceholder: "Optional details",
	},
	{
		id: "sports",
		label: "Sport",
		emoji: "⚽",
		detailLabel: "Details (optional)",
		detailPlaceholder: "Optional details",
	},
	{
		id: "teams",
		label: "Team",
		emoji: "🏟️",
		detailLabel: "Sport/League",
		detailPlaceholder: "e.g. NBA, Premier League",
	},
	{
		id: "foods",
		label: "Food",
		emoji: "🍔",
		detailLabel: "Restaurant",
		detailPlaceholder: "e.g. where they get it",
	},
	{
		id: "drinks",
		label: "Drink",
		emoji: "🍹",
		detailLabel: "Bar",
		detailPlaceholder: "e.g. their local",
	},
	{
		id: "other",
		label: "Other",
		emoji: "✨",
		detailLabel: "Details (optional)",
		detailPlaceholder: "Optional details",
	},
] as const;

export type InterestCategory = (typeof INTEREST_CATEGORIES)[number]["id"];

// Fixed event types — deliberately few; "hangout" is the broad default.
// No call/text granularity: that's the road to contact-frequency logging.
// One vocabulary for everything on a timeline or the dashboard — the old
// reminder types (outings you're going to) folded into the event types
// (things that happened). "Task" is the odd one out: not really an event,
// but a person-less "renew passport" needs somewhere to live too.
export const EVENT_TYPES = [
	{ id: "hangout", label: "Hangout", emoji: "🤝" },
	{ id: "party", label: "Party", emoji: "🎉" },
	{ id: "concert", label: "Concert", emoji: "🎸" },
	{ id: "movie", label: "Movie", emoji: "🍿" },
	{ id: "comedy", label: "Comedy", emoji: "🎭" },
	{ id: "event", label: "Event", emoji: "📅" },
	{ id: "trip", label: "Trip", emoji: "✈️" },
	{ id: "milestone", label: "Milestone", emoji: "🏅" },
	{ id: "life", label: "Life event", emoji: "🌱" },
	{ id: "given", label: "Given", emoji: "🎁" },
	{ id: "task", label: "Task", emoji: "⏰" },
	{ id: "other", label: "Other", emoji: "✨" },
] as const;

export type EventType = (typeof EVENT_TYPES)[number]["id"];


// Where you're sleeping — deliberately few; untyped stays render the bed.
export const ACCOMMODATION_TYPES = [
	{ id: "home", label: "Home", emoji: "🏠" },
	{ id: "airbnb", label: "Airbnb", emoji: "🏡" },
	{ id: "hotel", label: "Hotel", emoji: "🏨" },
	{ id: "hostel", label: "Hostel", emoji: "🎒" },
	{ id: "camping", label: "Camping", emoji: "⛺" },
	{ id: "other", label: "Other", emoji: "🛏️" },
] as const;

export type AccommodationType = (typeof ACCOMMODATION_TYPES)[number]["id"];

export const ACCOMMODATION_EMOJI: Record<AccommodationType, string> = {
	home: "🏠",
	airbnb: "🏡",
	hotel: "🏨",
	hostel: "🎒",
	camping: "⛺",
	// The generic bed the timeline already falls back to for an untyped stay.
	other: "🛏️",
};

/**
 * A stay's check-in/check-out when the hour genuinely doesn't matter —
 * distinct from unset, which means nobody has said yet. Stored rather than
 * blank so "we can arrive whenever" and "we haven't checked" don't collapse
 * into the same answer.
 */
export const ANY_TIME = "any";

// Booking status for stays; "none" (no booking needed) shows nothing.
export const BOOKING_STATES = [
	{ id: "booked", label: "Booked", emoji: "✅" },
	{ id: "todo", label: "To book", emoji: "📌" },
	{ id: "none", label: "Not needed", emoji: "➖" },
] as const;

export type BookingState = (typeof BOOKING_STATES)[number]["id"];

// Plan ideas carry a category and a priority — a plan is a menu.
export const PLAN_IDEA_CATEGORIES = [
	{ id: "activity", label: "Activity", emoji: "🥾" },
	{ id: "restaurant", label: "Restaurant", emoji: "🍕" },
	{ id: "bar", label: "Bar", emoji: "🍺" },
	{ id: "coffee", label: "Coffee", emoji: "☕" },
	{ id: "cooking", label: "Cooking", emoji: "🍳" },
	{ id: "sightseeing", label: "Sightseeing", emoji: "📸" },
	{ id: "show", label: "Show", emoji: "🎭" },
	{ id: "event", label: "Event", emoji: "🏀" },
	{ id: "meetup", label: "Meetup", emoji: "👋" },
	{ id: "task", label: "Task", emoji: "⏰" },
	{ id: "shopping", label: "Shopping", emoji: "🛍️" },
	{ id: "other", label: "Other", emoji: "✨" },
] as const;

export type PlanIdeaCategory = (typeof PLAN_IDEA_CATEGORIES)[number]["id"];

export const PLAN_PRIORITIES = [
	{ id: "must", label: "Must-do", emoji: "🎯" },
	{ id: "maybe", label: "Maybe", emoji: "🤔" },
] as const;

export type PlanPriority = (typeof PLAN_PRIORITIES)[number]["id"];

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

export type RoughTimeId = (typeof ROUGH_TIMES)[number]["id"];

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

// How you're getting there — shown as an icon beside travel legs.
export const TRAVEL_TYPES = [
	{ id: "car", label: "Driving", emoji: "🚗" },
	{ id: "plane", label: "Flying", emoji: "✈️" },
	{ id: "bus", label: "Bus", emoji: "🚌" },
	{ id: "train", label: "Train", emoji: "🚆" },
	{ id: "boat", label: "Boat", emoji: "⛵" },
	{ id: "taxi", label: "Taxi", emoji: "🚕" },
	{ id: "bike", label: "Bike", emoji: "🚲" },
	{ id: "walking", label: "Walking", emoji: "🚶" },
	{ id: "running", label: "Running", emoji: "🏃" },
	{ id: "other", label: "Other", emoji: "🧭" },
] as const;

export type TravelType = (typeof TRAVEL_TYPES)[number]["id"];

export const TRAVEL_TYPE_EMOJI: Record<TravelType, string> =
	Object.fromEntries(TRAVEL_TYPES.map((t) => [t.id, t.emoji])) as Record<
		TravelType,
		string
	>;

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

export type SomedaySeason = (typeof SOMEDAY_SEASONS)[number]["id"];

/** Look up a season for its emoji/label. */
export function somedaySeason(id: string | undefined | null) {
	return id ? SOMEDAY_SEASONS.find((s) => s.id === id) : undefined;
}

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

// The retired reminders store/folder names — only the migration reads these
export const REMINDERS_BASENAME = "Reminders";

// Fixed palette for group color dots — no color picker, keep it minimal
export const GROUP_COLORS = [
	"#e05561",
	"#e69735",
	"#dcc22e",
	"#5cb870",
	"#45b8ac",
	"#5a9cf8",
	"#9a7ef0",
	"#e57fb3",
	"#8f9aa5",
];

// Fields that have special input handling
export const SPECIAL_INPUT_FIELDS = {
	[STANDARD_FIELDS.BIRTHDAY]: "date",
	[STANDARD_FIELDS.PHONE]: "tel",
	[STANDARD_FIELDS.EMAIL]: "email",
} as const;

// The sidebar ribbon's icons — each individually toggleable from settings
// (Quick actions). Metadata only: main.ts owns the actual click behaviour,
// settings.ts owns the toggles, and this is the shared list keeping their
// keys, icons and labels from drifting apart.
export const RIBBON_ACTIONS = [
	{ key: "ribbonDashboard", icon: "heart-handshake", name: "Open Callander" },
	{ key: "ribbonDiary", icon: "book-open", name: "Open diary" },
	{
		key: "ribbonAddIdea",
		icon: "lightbulb",
		name: "Add idea for a friend",
	},
	{ key: "ribbonSomedays", icon: "sparkles", name: "Open somedays" },
	{ key: "ribbonEvents", icon: "calendar-days", name: "Open events" },
	// The key keeps its historical name so saved toggles survive the
	// reminders→events merge; only the label and action moved on.
	{ key: "ribbonReminder", icon: "calendar-plus", name: "New event" },
] as const;

export type RibbonActionKey = (typeof RIBBON_ACTIONS)[number]["key"];
