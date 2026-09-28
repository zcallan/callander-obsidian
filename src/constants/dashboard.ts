/**
 * The dashboard's sections, in the order they ship in.
 *
 * Order is a setting, so this array is the default rather than the truth —
 * see resolveDashboardOrder, which reconciles a saved order against this one
 * when sections are added or removed by an update.
 *
 * Labels carry the same emoji the section headings do: the settings list is
 * a list of things you recognise from the page, not of internal names.
 */
export const DASHBOARD_SECTIONS = [
	{ id: "drafts", label: "✏️ Drafts" },
	{ id: "gettingStarted", label: "👋 Getting started" },
	{ id: "calendar", label: "📅 Calendar" },
	{ id: "birthdays", label: "🎂 Upcoming birthdays" },
	{ id: "missedBirthdays", label: "🕯️ Missed birthdays" },
	{ id: "upcoming", label: "📌 Upcoming" },
	{ id: "onThisDay", label: "🕰️ On this day" },
	{ id: "plans", label: "🗺️ Plans" },
	{ id: "somedays", label: "💭 Somedays" },
	{ id: "diary", label: "📖 Diary" },
	{ id: "expenses", label: "💵 Expenses" },
	{ id: "groups", label: "👥 Groups" },
	{ id: "resurfacing", label: "⏰ Resurfacing now" },
	{ id: "inbox", label: "📥 Idea inbox" },
	{ id: "secretActions", label: "🤫 Secret actions" },
] as const;

/** The shipped order, as plain ids. */
export const DEFAULT_DASHBOARD_ORDER: string[] = DASHBOARD_SECTIONS.map(
	(s) => s.id
);
