/**
 * How a frontmatter key reads on screen, and what it's for.
 *
 * The keys are camelCase because that's what lives in the YAML, but
 * "legalName" is not a label. These were previously rendered raw and leaned
 * on CSS `text-transform: capitalize`, which treats camelCase as one word —
 * hence "DisplayName" and "RelatedFiles" on screen.
 */

/**
 * Only the keys the rule below can't produce — a different word, not a
 * different formatting. "shortName", "legalName", "relatedFiles" and friends
 * are deliberately absent: the rule already yields exactly those labels, and
 * listing them again would be a second place to keep in step.
 */
const OVERRIDES: Record<string, string> = {
	// "Display name" describes the mechanism; "Preferred name" describes what
	// you're actually being asked for.
	displayName: "Preferred name",
	// "Met" alone reads as a date field with no object.
	met: "How we met",
};

/**
 * "legalName" → "Legal name". Splits camelCase, lowercases the tail, and
 * capitalises only the first word — sentence case, matching Obsidian's own
 * UI conventions rather than Title Case.
 *
 * A custom field someone added by hand ("favouriteTea", "nickname") gets the
 * same treatment, so this never has to know every key in advance.
 */
export function fieldLabel(key: string): string {
	const override = OVERRIDES[key];
	if (override) return override;
	const spaced = key
		// camelCase and consecutive capitals both become word boundaries, so
		// "jobTitle" and "URLSlug" each split sensibly.
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
		.replace(/[_-]+/g, " ")
		.trim();
	if (!spaced) return key;
	const lower = spaced.toLowerCase();
	return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** One or two sentences on what a field is for, plus an example where one helps. */
export interface FieldHelp {
	text: string;
	example?: string;
}

const HELP: Record<string, FieldHelp> = {
	displayName: {
		text: "What this person is called throughout Callander, when that isn't their file name.",
		example: "File is “Robert Chen”, preferred name is “Bob”",
	},
	shortName: {
		text: "Overrides the shortened form used where space is tight, like guest lists and plan summaries. Set it only when the automatic one reads wrong.",
		example: "“Obama” instead of “Barack”",
	},
	legalName: {
		text: "Their full name as it appears on documents. Useful for bookings and paperwork.",
		example: "Robert James Chen",
	},
	nicknames: {
		text: "Other things they get called. Kept for recall, not used for display.",
	},
	birthday: {
		text: "Drives birthday reminders on the dashboard. The year is optional — a day and month is enough.",
	},
	met: {
		text: "When you first met, at whatever precision you remember. Shows as “how long ago” on their page.",
		example: "2019, or March 2019, or an exact day",
	},
	hometown: {
		text: "Where they're from originally.",
	},
	birthplace: {
		text: "Where they were born, when it's somewhere other than where they grew up.",
	},
	location: {
		text: "Where they live now. Handy for working out who's nearby when you're travelling.",
	},
	parents: {
		text: "Their parents. Link a name to another note to connect the two, or just type it.",
		example: "[[Denise Chen]], or simply Denise",
	},
	siblings: {
		text: "Their brothers and sisters. Link a name to another note, or just type it.",
	},
	friends: {
		text: "People they know, so you can see how a circle connects. Link a name to another note, or just type it.",
	},
	relatedFiles: {
		text: "Any other notes tied to this person — a letter, a trip write-up, a shared project. Click one to open it in a new tab.",
		example: "[[Love letter, 2024]]",
	},
	groups: {
		text: "Circles this person belongs to. Groups get their own page with shared ideas and events.",
		example: "Uni friends, Climbing crew",
	},
	email: { text: "Their email address." },
	phone: { text: "Their phone number." },
	address: { text: "Their postal address, for cards and deliveries." },
	company: { text: "Where they work." },
	jobTitle: { text: "What they do there." },
	industry: {
		text: "The field they work in, when the job title alone doesn't say.",
	},
	relationship: {
		text: "How you know them. Used to group and filter your people.",
		example: "Friend, Family, Colleague",
	},
};

/** The help for a field, or null when it has none (custom fields). */
export function fieldHelp(key: string): FieldHelp | null {
	return HELP[key] ?? null;
}
