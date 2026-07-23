type StandardFieldKey = keyof typeof STANDARD_FIELDS;
type StandardFieldValue = (typeof STANDARD_FIELDS)[StandardFieldKey];

export const STANDARD_FIELDS = {
	NAME: "name",
	DISPLAY_NAME: "displayName",
	BIRTHDAY: "birthday",
	BIRTHDAY_WISHED: "birthdayWished",
	MET: "met",
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
