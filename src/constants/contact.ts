type StandardFieldKey = keyof typeof STANDARD_FIELDS;
type StandardFieldValue = (typeof STANDARD_FIELDS)[StandardFieldKey];

export const STANDARD_FIELDS = {
	NAME: "name",
	DISPLAY_NAME: "displayName",
	SHORT_NAME: "shortName",
	NICKNAMES: "nicknames",
	LEGAL_NAME: "legalName",
	PRONOUNS: "pronouns",
	BIRTHDAY: "birthday",
	BIRTHDAY_WISHED: "birthdayWished",
	MET: "met",
	HOMETOWN: "hometown",
	BIRTHPLACE: "birthplace",
	LOCATION: "location",
	PARENTS: "parents",
	SIBLINGS: "siblings",
	CHILDREN: "children",
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
	INSIDE_JOKES: "insideJokes",
	GENERATED: "generated", // provenance flag — see utils/generated
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
	"children",
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
	STANDARD_FIELDS.INSIDE_JOKES,
	// Never an About row: the badge on the entry is the only thing that
	// should say Claude added it.
	STANDARD_FIELDS.GENERATED,
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
//
// Each type labels its own fields in the add form: what the thing is called
// (a Book, a Song), up to two further fields only where they fit (a book's
// author, music's artist and genre — omitted where there's nothing natural
// to ask), and a Notes placeholder written as what *they* like about it or
// how they have it, never a recommendation to them.
//
// `plural` heads the group on the friend page ("Books"), matching Ideas.
//
// `nameLabel` names the first field where the type's own label doesn't
// name the thing in it: Music asks for a Song, Food for a Dish.
//
// `ideaCategory` is where the chip's lightbulb files an idea made from it:
// a book is a book to read, a place somewhere to go, a team more often a gift.
export const INTEREST_CATEGORIES = [
	{
		id: "hobbies",
		ideaCategory: "activity",
		label: "Hobby",
		plural: "Hobbies",
		emoji: "🎨",
		namePlaceholder: "e.g. Rock climbing",
		notesPlaceholder: "e.g. Mostly bouldering; wants to try climbing outdoors",
	},
	{
		id: "books",
		ideaCategory: "book",
		label: "Book",
		plural: "Books",
		emoji: "📚",
		namePlaceholder: "e.g. East of Eden",
		detailLabel: "Author",
		detailPlaceholder: "e.g. John Steinbeck",
		notesPlaceholder: "e.g. Loves the setting and time period, but hates Cathy Ames",
	},
	{
		id: "music",
		ideaCategory: "music",
		label: "Music",
		plural: "Music",
		emoji: "🎵",
		// The type is Music; the thing itself is a song.
		nameLabel: "Song",
		namePlaceholder: "e.g. Stick Season",
		detailLabel: "Artist",
		detailPlaceholder: "e.g. Noah Kahan",
		detail2Label: "Genre",
		detail2Placeholder: "e.g. Indie folk",
		notesPlaceholder: "e.g. Always turns it up for the chorus",
	},
	{
		id: "movie",
		ideaCategory: "movie",
		label: "Movie",
		plural: "Movies",
		emoji: "🎬",
		namePlaceholder: "e.g. The Dark Knight",
		notesPlaceholder: "e.g. Quotes it constantly, Christian Bale is their favourite Batman",
	},
	{
		id: "tv",
		ideaCategory: "show",
		label: "TV Show",
		plural: "TV Shows",
		emoji: "📺",
		namePlaceholder: "e.g. The Bear",
		notesPlaceholder: "e.g. Loves the Christmas special episode",
	},
	{
		id: "games",
		ideaCategory: "gift",
		label: "Game",
		plural: "Games",
		emoji: "🎮",
		namePlaceholder: "e.g. Stardew Valley",
		detailLabel: "Platform",
		detailPlaceholder: "e.g. Switch",
		notesPlaceholder: "e.g. Wants to do a multiplayer farm someday",
	},
	{
		id: "sports",
		ideaCategory: "activity",
		label: "Sport",
		plural: "Sports",
		emoji: "⚽",
		namePlaceholder: "e.g. Basketball",
		notesPlaceholder: "e.g. Plays every Tuesday night, team named \"Run n' Dunk\"",
	},
	{
		id: "teams",
		ideaCategory: "gift",
		label: "Team",
		plural: "Teams",
		emoji: "🏟️",
		namePlaceholder: "e.g. Boston Celtics",
		detailLabel: "Sport/league",
		detailPlaceholder: "e.g. NBA",
		notesPlaceholder: "e.g. Season ticket holder, loves Paul Pierce",
	},
	{
		id: "foods",
		ideaCategory: "place",
		label: "Food",
		plural: "Foods",
		emoji: "🍔",
		nameLabel: "Dish",
		namePlaceholder: "e.g. Spicy miso ramen",
		detailLabel: "Restaurant",
		detailPlaceholder: "e.g. Shinjuku Ramen",
		notesPlaceholder: "e.g. Extra chilli oil, two eggs",
	},
	{
		id: "drinks",
		ideaCategory: "gift",
		label: "Drink",
		plural: "Drinks",
		emoji: "🍹",
		namePlaceholder: "e.g. Martini",
		notesPlaceholder: "e.g. Shaken, not stirred",
	},
	{
		id: "places",
		ideaCategory: "place",
		label: "Place",
		plural: "Places",
		emoji: "📍",
		namePlaceholder: "e.g. The Avenue",
		detailLabel: "Location",
		detailPlaceholder: "e.g. Boston",
		notesPlaceholder: "e.g. Cheap burgers after 10pm",
	},
	{
		id: "other",
		ideaCategory: "gift",
		label: "Other",
		plural: "Other",
		emoji: "✨",
		nameLabel: "Interest",
		namePlaceholder: "e.g. Vintage cameras",
		notesPlaceholder: "e.g. Loves Leica and Fujifilm the best",
	},
] as const;

export type InterestCategory = (typeof INTEREST_CATEGORIES)[number]["id"];

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
