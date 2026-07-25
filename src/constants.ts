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
export const INTEREST_CATEGORIES = [
	{ id: "hobbies", label: "Hobby", emoji: "🎨" },
	{ id: "books", label: "Book", emoji: "📚" },
	{ id: "music", label: "Music", emoji: "🎵" },
	{ id: "screen", label: "Movie & TV", emoji: "🎬" },
	{ id: "games", label: "Game", emoji: "🎮" },
	{ id: "sports", label: "Sport", emoji: "⚽" },
	{ id: "teams", label: "Team", emoji: "🏟️" },
	{ id: "foods", label: "Food", emoji: "🍔" },
	{ id: "drinks", label: "Drink", emoji: "🍹" },
	{ id: "other", label: "Other", emoji: "✨" },
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
	{ id: "other", label: "Other", emoji: "✨" },
] as const;

export type EventType = (typeof EVENT_TYPES)[number]["id"];

// Plan ideas carry a category and a priority — a plan is a menu.
export const PLAN_IDEA_CATEGORIES = [
	{ id: "activity", label: "Activity", emoji: "🥾" },
	{ id: "restaurant", label: "Restaurant", emoji: "🍴" },
	{ id: "cooking", label: "Cooking", emoji: "🍳" },
	{ id: "sightseeing", label: "Sightseeing", emoji: "📸" },
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
	{ id: "other", label: "Other", emoji: "🧭" },
] as const;

export type TravelType = (typeof TRAVEL_TYPES)[number]["id"];

export const TRAVEL_TYPE_EMOJI: Record<TravelType, string> =
	Object.fromEntries(TRAVEL_TYPES.map((t) => [t.id, t.emoji])) as Record<
		TravelType,
		string
	>;

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
