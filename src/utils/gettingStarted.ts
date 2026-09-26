/**
 * The dashboard's "Getting started" checklist: a first thing to do on each
 * page of the plugin, ticked off by itself as the vault shows it done.
 */

export const GETTING_STARTED_STEPS = [
	{
		id: "friend",
		title: "Add your first friend",
		blurb: "Everything else in Callander hangs off the people in it.",
		action: "Add friend",
	},
	{
		id: "group",
		title: "Add your first group",
		blurb: "Circles like Family or Basketball, with a colour and ideas of their own.",
		action: "New group",
	},
	{
		id: "quickNote",
		title: "Add your first quick note",
		blurb: "Jot something down now and file it onto someone later.",
		action: "Quick note",
	},
	{
		id: "name",
		title: "Add your name in the settings",
		blurb: "So shared plan messages count you in — and a look at what else is there.",
		action: "Open settings",
	},
	{
		id: "event",
		title: "Add your first event",
		blurb: "Anything with a date — a dinner, a gig, a thing to remember.",
		action: "New event",
	},
	{
		id: "someday",
		title: "Add your first someday",
		blurb: "Things you'd like to do one day, before they have a date.",
		action: "New someday",
	},
	{
		id: "plan",
		title: "Add your first plan",
		blurb: "For the bigger things: a running order, who's coming, who owes what.",
		action: "New plan",
	},
	{
		id: "diary",
		title: "Add your first diary entry",
		blurb: "A few lines about a day, linked to the people in it.",
		action: "New entry",
	},
	{
		id: "calendar",
		title: "Open your calendar",
		blurb: "Events, plans and birthdays together, a month at a time.",
		action: "Open calendar",
	},
] as const;

export type GettingStartedStep = (typeof GETTING_STARTED_STEPS)[number]["id"];

/**
 * Which steps are done: those the vault shows done now, and those it ever
 * has. Sticky, because most of these don't stay true on their own — a quick
 * note is filed onto someone and leaves the inbox, a test friend is deleted
 * — and a tick that came off again would read as the plugin forgetting.
 *
 * `newlyDone` is what `remembered` doesn't hold yet: what the caller has to
 * save. Ids no longer among the steps drop out, so a retired step can't
 * inflate the count.
 */
export function gettingStartedProgress(
	facts: Record<GettingStartedStep, boolean>,
	remembered: readonly string[]
): { done: GettingStartedStep[]; newlyDone: GettingStartedStep[] } {
	const done: GettingStartedStep[] = [];
	const newlyDone: GettingStartedStep[] = [];
	for (const { id } of GETTING_STARTED_STEPS) {
		const known = remembered.includes(id);
		if (facts[id] && !known) newlyDone.push(id);
		if (facts[id] || known) done.push(id);
	}
	return { done, newlyDone };
}
