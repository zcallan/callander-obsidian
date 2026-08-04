type StandardFieldKey = keyof typeof STANDARD_FIELDS;
type StandardFieldValue = (typeof STANDARD_FIELDS)[StandardFieldKey];

export const STANDARD_FIELDS = {
	NAME: "name",
	DISPLAY_NAME: "displayName",
	BIRTHDAY: "birthday",
	BIRTHDAY_WISHED: "birthdayWished",
	MET: "met",
	HOMETOWN: "hometown",
	BIRTHPLACE: "birthplace",
	LOCATION: "location",
	PARENTS: "parents",
	GROUPS: "groups",
	EMAIL: "email",
	PHONE: "phone",
	ADDRESS: "address",
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
	QUOTES: "quotes",
} as const;

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
	STANDARD_FIELDS.QUOTES,
];

// Fixed idea categories — deliberately few, no user-defined tags (Callander brief)
export const IDEA_CATEGORIES = [
	{ id: "gift", label: "Gifts", emoji: "🎁" },
	{ id: "conversation", label: "Conversations", emoji: "💬" },
	{ id: "activity", label: "Activities", emoji: "🥾" },
	{ id: "place", label: "Places", emoji: "📍" },
	{ id: "recommendation", label: "Recommendations", emoji: "⭐" },
	{ id: "other", label: "Other", emoji: "✨" },
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
export const EVENT_TYPES = [
	{ id: "hangout", label: "Hangout", emoji: "🤝" },
	{ id: "trip", label: "Trip", emoji: "✈️" },
	{ id: "milestone", label: "Milestone", emoji: "🏅" },
	{ id: "life", label: "Life event", emoji: "🌱" },
	{ id: "given", label: "Given", emoji: "🎁" },
	{ id: "party", label: "Party", emoji: "🎉" },
	{ id: "other", label: "Other", emoji: "✨" },
] as const;

export type EventType = (typeof EVENT_TYPES)[number]["id"];

// Reminder types — "task" is the plain default; the rest are outings.
export const REMINDER_TYPES = [
	{ id: "task", label: "Task", emoji: "⏰" },
	{ id: "party", label: "Party", emoji: "🎉" },
	{ id: "concert", label: "Concert", emoji: "🎸" },
	{ id: "movie", label: "Movie", emoji: "🍿" },
	{ id: "hangout", label: "Hangout", emoji: "🤝" },
	{ id: "event", label: "Event", emoji: "📅" },
	{ id: "comedy", label: "Comedy", emoji: "🎭" },
	{ id: "other", label: "Other", emoji: "⏰" },
] as const;

export type ReminderType = (typeof REMINDER_TYPES)[number]["id"];

// Where you're sleeping — deliberately few; untyped stays render the bed.
export const ACCOMMODATION_TYPES = [
	{ id: "home", label: "Home", emoji: "🏠" },
	{ id: "airbnb", label: "Airbnb", emoji: "🏡" },
	{ id: "hotel", label: "Hotel", emoji: "🏨" },
	{ id: "friends", label: "Mate's place", emoji: "🛋️" },
	{ id: "camping", label: "Camping", emoji: "⛺" },
] as const;

export type AccommodationType = (typeof ACCOMMODATION_TYPES)[number]["id"];

export const ACCOMMODATION_EMOJI: Record<AccommodationType, string> = {
	home: "🏠",
	airbnb: "🏡",
	hotel: "🏨",
	friends: "🛋️",
	camping: "⛺",
};

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
	{ id: "restaurant", label: "Restaurant", emoji: "🍴" },
	{ id: "bar", label: "Bar", emoji: "🍺" },
	{ id: "coffee", label: "Coffee", emoji: "☕" },
	{ id: "cooking", label: "Cooking", emoji: "🍳" },
	{ id: "sightseeing", label: "Sightseeing", emoji: "📸" },
	{ id: "show", label: "Show", emoji: "🎭" },
	{ id: "event", label: "Event", emoji: "🎪" },
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

/** Look up a stored rough-time id; undefined for exact "HH:MM" or empty. */
export function roughTime(time: string | undefined | null) {
	return time ? ROUGH_TIMES.find((r) => r.id === time) : undefined;
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
	{ id: "solo", label: "Solo", emoji: "🧍" },
	{ id: "group", label: "Group", emoji: "👥" },
] as const;

export type SomedayCompany = (typeof SOMEDAY_COMPANY)[number]["id"];

/** Look up the solo/group option for its emoji/label; undefined when unset. */
export function somedayCompany(id: string | undefined | null) {
	return id ? SOMEDAY_COMPANY.find((c) => c.id === id) : undefined;
}

/**
 * Human summary of candidate days: "Any day" | "Weekends" | "Weekdays" |
 * "Any day but Tue or Wed" (when only 1–2 are excluded) | "Mon, Tue".
 */
export function formatSomedayDays(days: readonly string[]): string {
	if (!days || days.length === 0) return "";
	const set = new Set(days);
	const present = SOMEDAY_DAYS.filter((d) => set.has(d.id));
	if (present.length === 7) return "Any day";
	if (set.size === 2 && set.has("sat") && set.has("sun")) return "Weekends";
	const weekdays = ["mon", "tue", "wed", "thu", "fri"];
	if (set.size === 5 && weekdays.every((d) => set.has(d))) return "Weekdays";
	// Mostly selected — name the 1–2 exceptions instead
	const missing = SOMEDAY_DAYS.filter((d) => !set.has(d.id));
	if (missing.length <= 2) {
		return `Any day but ${missing.map((d) => d.label).join(" or ")}`;
	}
	// Canonical Mon→Sun order regardless of how they were stored
	return present.map((d) => d.label).join(", ");
}

// Reserved single-file store that lives beside contacts but isn't a friend
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
