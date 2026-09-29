import type CallanderPlugin from "@/main";
import type { ContactWithCountdown, Idea } from "@/types";
import type { LedgerDraft } from "@/utils/draftsMarkdown";
import {
	gettingStartedProgress,
	type GettingStartedStep,
} from "@/utils/gettingStarted";

/**
 * Everything the dashboard draws that has to be read from disk, read once
 * before a render starts.
 *
 * The render used to await these section by section, so a second refresh
 * could empty the page while the first was suspended mid-way, and the first
 * then finished drawing into the second's page: sections twice over, and
 * page-width wrappers nested inside each other. Gathered up front, the
 * render is synchronous and that can't happen. Each is read once, too; the
 * drafts used to be read twice per render.
 */
export interface DashboardSnapshot {
	contacts: ContactWithCountdown[];
	/** The dashboard note's checklist, ticked drafts included. */
	drafts: LedgerDraft[];
	inboxIdeas: Idea[];
	/** Getting started's steps done, remembered ones included. */
	gettingStartedDone: GettingStartedStep[];
}

/** Nothing read yet: the dashboard before its first refresh. */
export const EMPTY_SNAPSHOT: DashboardSnapshot = {
	contacts: [],
	drafts: [],
	inboxIdeas: [],
	gettingStartedDone: [],
};

export async function gatherDashboard(
	plugin: CallanderPlugin
): Promise<DashboardSnapshot> {
	const ops = plugin.contactOperations;
	// Cheap when there's nothing to do, and what carries a friend's note
	// that synced in still holding its drafts in frontmatter over to the
	// checklist — before this reads them from there.
	await ops.migrateDraftsToDashboard();
	const [contacts, drafts, inboxIdeas] = await Promise.all([
		ops.getContacts(),
		ops.readDrafts(),
		ops.getInboxIdeas(),
	]);
	return {
		contacts,
		drafts,
		inboxIdeas,
		gettingStartedDone: recordGettingStarted(plugin, contacts, drafts),
	};
}

/**
 * The steps done, and any newly done remembered in settings — here rather
 * than while drawing, where the save's broadcast set off another refresh
 * from inside a render.
 */
function recordGettingStarted(
	plugin: CallanderPlugin,
	contacts: ContactWithCountdown[],
	drafts: LedgerDraft[]
): GettingStartedStep[] {
	const settings = plugin.settings;
	if (!settings.showGettingStarted) return [];
	const { done, newlyDone } = gettingStartedProgress(
		{
			friend: contacts.length > 0,
			name: settings.yourName.trim() !== "",
			group: plugin.contactOperations.getGroupInfos(contacts).length > 0,
			// Ticked ones count: it asks whether you've ever captured one.
			quickNote: drafts.length > 0,
			// A timeline entry is a record kept on someone's page, not an
			// event — the Events page leaves them out too.
			event: plugin.eventOperations
				.getEvents()
				.some((e) => e.variant !== "timeline"),
			plan: plugin.planOperations.getPlans().length > 0,
			someday: plugin.somedayOperations.getSomedays().length > 0,
			diary: plugin.diaryOperations.getEntriesMeta().length > 0,
			// Nothing in the vault says the page was ever opened, so the
			// page ticks this one itself — see CalendarView.onOpen.
			calendar: false,
		},
		settings.gettingStartedDone
	);
	if (newlyDone.length > 0) {
		settings.gettingStartedDone = [
			...settings.gettingStartedDone,
			...newlyDone,
		];
		void plugin.saveSettings();
	}
	return done;
}
