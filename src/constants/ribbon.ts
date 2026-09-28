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
