import { ItemView, WorkspaceLeaf, type TFile } from "obsidian";
import type { ReactNode } from "react";
import { ExpensesSection } from "@/ui/sections/ExpensesSection";
import { UpcomingSection } from "@/ui/sections/UpcomingSection";
import { isInFolder, registerPageRefresh } from "@/utils/vaultRefresh";
import type CallanderPlugin from "@/main";
import { applyPageWidth, observePageRoom } from "@/components/pageWidth";
import { resolveDashboardOrder } from "@/utils/dashboardOrder";
import { DASHBOARD_SECTIONS, DEFAULT_DASHBOARD_ORDER } from "@/constants";
import { newRandomSeed } from "@/utils/somedaySort";
import { IslandSet } from "@/ui/islands";
import { queuedFlight } from "@/utils/singleFlight";
import type {
	DashboardContext,
	DashboardIslandKey,
} from "@/views/DashboardView/context";
import {
	EMPTY_SNAPSHOT,
	gatherDashboard,
	type DashboardSnapshot,
} from "@/views/DashboardView/snapshot";
import {
	renderMissedBirthdays,
	renderUpcomingBirthdays,
} from "@/views/DashboardView/sections/birthdays";
import { renderDiary } from "@/views/DashboardView/sections/diary";
import { renderDrafts } from "@/views/DashboardView/sections/drafts";
import {
	renderGettingStarted,
} from "@/views/DashboardView/sections/gettingStarted";
import { renderGroups } from "@/views/DashboardView/sections/groups";
import { renderHeader } from "@/views/DashboardView/sections/header";
import {
	renderInbox,
	renderResurfacing,
} from "@/views/DashboardView/sections/ideas";
import { renderOnThisDay } from "@/views/DashboardView/sections/onThisDay";
import { renderPlans } from "@/views/DashboardView/sections/plans";
import { renderSomedays } from "@/views/DashboardView/sections/somedays";
import {
	renderCalendarLink,
	renderSecretActions,
} from "@/views/DashboardView/sections/tools";
import { SearchBox } from "@/components/searchBox";
import { FocusKeeper } from "@/components/activatable";

export const VIEW_TYPE_DASHBOARD = "callander-dashboard";

type SectionId = (typeof DASHBOARD_SECTIONS)[number]["id"];

/**
 * Each section, by the id the dashboard order is saved in. A section added
 * to DASHBOARD_SECTIONS without a renderer here fails to compile.
 */
const SECTIONS: Record<
	SectionId,
	(ctx: DashboardContext, el: HTMLElement) => void
> = {
	// Drafts to triage — kept high by default so they don't rot.
	drafts: renderDrafts,
	gettingStarted: renderGettingStarted,
	calendar: renderCalendarLink,
	birthdays: renderUpcomingBirthdays,
	missedBirthdays: renderMissedBirthdays,
	// Future-dated events coming up (React).
	upcoming: (ctx, el) => {
		el.appendChild(ctx.island("upcoming", <UpcomingSection />));
	},
	// Anniversaries — events from this same day in past years.
	onThisDay: renderOnThisDay,
	plans: renderPlans,
	// The wishlist of not-yet-plans.
	somedays: renderSomedays,
	diary: renderDiary,
	// Shared expenses — who owes what (React).
	expenses: (ctx, el) => {
		el.appendChild(ctx.island("expenses", <ExpensesSection />));
	},
	groups: renderGroups,
	resurfacing: renderResurfacing,
	inbox: renderInbox,
	secretActions: renderSecretActions,
};

const isSectionId = (id: string): id is SectionId => id in SECTIONS;

/**
 * The dashboard. This file is its lifetime: what it listens to, gathering
 * what it shows (snapshot.ts), and the sections in order (sections/).
 */
export class DashboardView extends ItemView implements DashboardContext {
	/** What the page shows, as of its last refresh. */
	data: DashboardSnapshot = EMPTY_SNAPSHOT;
	/** Widened for this view only, until it closes. */
	private pageWide = false;
	readonly ui = { searchQuery: "" };
	readonly searchBox = new SearchBox();
	/** Keyboard focus across a redraw — see FocusKeeper. */
	private readonly focusKeeper = new FocusKeeper();
	// Only used when the Somedays sort is "Random" — fixed for the life of
	// this dashboard so the list doesn't reshuffle on every refresh.
	readonly somedaySeed = newRandomSeed();
	/**
	 * React islands for the sections that have been ported, keyed by slot.
	 *
	 * Created once and kept for the life of the view. `render()` rebuilds the
	 * imperative DOM on every vault event, and an island recreated alongside
	 * it would unmount its root and resubscribe a moment later — any change
	 * landing in that gap is simply lost.
	 *
	 * So `render()` detaches these hosts and puts them back rather than
	 * remaking them; React keeps rendering into the same node throughout and
	 * its subscriptions never lapse. Torn down only in onClose.
	 */
	private islands = new IslandSet(() => this.plugin);
	private closed = false;

	constructor(
		leaf: WorkspaceLeaf,
		public plugin: CallanderPlugin
	) {
		super(leaf);
		// Participate in tab history so back/forward arrows work
		this.navigation = true;
	}

	getViewType(): string {
		return VIEW_TYPE_DASHBOARD;
	}

	getDisplayText(): string {
		return "Callander";
	}

	getIcon(): string {
		return "heart-handshake";
	}

	async onOpen() {
		// Once for the life of the view, not per render — it only has to
		// know whether there's room beside the column.
		this.register(observePageRoom(this));
		// No-ops once the base folder exists — only a fresh install ever
		// actually creates anything here.
		await this.plugin.seedStarterVault();
		// The dashboard note itself, which otherwise only appeared once
		// something needed somewhere to live (an idea, a draft, an ad-hoc
		// expense). A fresh vault would show nothing in the file explorer
		// to click, so it's made up front — it's also the one file that
		// opens this page from there.
		await this.plugin.contactOperations.ensureDashboardFile();

		// Everything the page shows lives under the base folder, apart from
		// a diary folder kept outside it. Read when an event arrives, so a
		// changed setting is heard too.
		registerPageRefresh(this, this.plugin, () => void this.refresh(), {
			scope: (path) =>
				isInFolder(path, this.plugin.settings.baseFolder) ||
				this.plugin.diaryOperations.isDiaryFile(path),
		});
		await this.refresh();
	}

	/**
	 * Read everything, then draw. One at a time: a refresh asked for while
	 * one is reading runs once more after it, and `await` ends after a
	 * render of data read after it asked (queuedFlight).
	 */
	refresh = queuedFlight(async () => {
		const data = await gatherDashboard(this.plugin);
		if (this.closed) return;
		this.data = data;
		this.render();
	});

	async onClose() {
		this.closed = true;
		this.islands.unmountAll();
	}

	async openContact(file: TFile) {
		await this.plugin.openContactPage(file);
	}

	island(key: DashboardIslandKey, node: ReactNode): HTMLElement {
		return this.islands.host(key, node);
	}

	/** Draws `data`, synchronously: nothing here awaits (DashboardContext). */
	private render() {
		const container = this.contentEl;
		const scrollTop = container.scrollTop;
		this.searchBox.hold();
		this.focusKeeper.hold(container);
		container.empty();
		container.addClass("dashboard-container", "dashboard-home-container");

		renderHeader(this, container);
		// Sections in whatever order the settings hold, defaulting to the
		// order they're declared in.
		for (const id of resolveDashboardOrder(
			this.plugin.settings.dashboardOrder,
			DEFAULT_DASHBOARD_ORDER
		)) {
			if (isSectionId(id)) SECTIONS[id](this, container);
		}

		applyPageWidth(container, this.plugin, this.pageWide, () => {
			this.pageWide = true;
			this.render();
		});

		container.scrollTop = scrollTop;
		this.focusKeeper.restore(container);
	}
}
