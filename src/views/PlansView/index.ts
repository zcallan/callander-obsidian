import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type FriendTracker from "@/main";
import { applyPageWidth, observePageRoom } from "@/components/pageWidth";
import type { ContactWithCountdown } from "@/types";
import { PlanModal } from "@/modals/PlanModal";
import type { EventSort } from "@/utils/eventRow";
import { buildUpcomingRow } from "@/components/UpcomingRow";
import { registerVaultRefresh } from "@/utils/vaultRefresh";
import { groupEventsByPeriod } from "@/utils/eventGroups";
import { summarisePeople } from "@/utils/nameFormat";
import { planRowFields } from "@/utils/planRow";
import {
	PLAN_SORTS,
	PLAN_STATUSES,
	PLAN_WHEN_FILTERS,
	planListItem,
	planPipeline,
	planSortOf,
	readsBackwards,
	type PlanListItem,
} from "@/utils/planList";
import type { EventWhen } from "@/utils/eventRow";

export const VIEW_TYPE_PLANS = "callander-plans";

/**
 * Every plan, past and future — the Events page's shape, for trips.
 *
 * Deliberately the same controls in the same places: search, a sort on the
 * List, Upcoming / Past / All, a Filters panel, Timeline | List. It reuses
 * that page's stylesheet classes wholesale, so the two can't drift apart
 * visually. What differs is what's worth filtering by — a plan has no type,
 * but it has a status and people — and that there's no calendar tab: the
 * Calendar page already draws plans across their days.
 *
 * Shows every plan, including ones hidden from the dashboard's Upcoming or
 * from the Events page. Those flags are about what a busy list should
 * leave out; this is the place that's meant to have them all.
 */
export class PlansView extends ItemView {
	private items: PlanListItem[] = [];
	/** Fetched alongside the plans, to turn member wikilinks into names. */
	private contacts: ContactWithCountdown[] = [];
	private searchQuery = "";
	private listEl: HTMLElement | null = null;

	// Filters — one status and one person at a time, like the Events page's
	// own single-pick facets.
	private status = "";
	private personPath = "";
	// Starts on All, and one of the three is always on — clicking the
	// active one is a no-op rather than a way to clear it.
	private when: EventWhen = "all";
	private filtersOpen = false;
	/** Widened for this view only, until it closes. */
	private pageWide = false;
	private tab: "timeline" | "list";

	constructor(leaf: WorkspaceLeaf, private plugin: FriendTracker) {
		super(leaf);
		this.navigation = true;
		// Off the parameter, not `this.plugin` — parameter properties are
		// assigned before field initialisers, but not before this line.
		this.tab = plugin.settings.plansTab ?? "timeline";
	}

	getViewType(): string {
		return VIEW_TYPE_PLANS;
	}

	getDisplayText(): string {
		return "Plans";
	}

	getIcon(): string {
		return "plane";
	}

	async onOpen() {
		this.register(observePageRoom(this));
		this.registerEvent(
			this.plugin.events.on("settings-changed", () => void this.refresh())
		);
		// People too: a member renamed on their own page changes what this
		// list shows for them, and nothing else here would hear about it.
		const folders = [
			this.plugin.planOperations.getPlansFolderPath(),
			this.plugin.contactOperations.getPeopleFolderPath(),
		];
		registerVaultRefresh(this, this.plugin, () => void this.refresh(), {
			scope: (path) =>
				folders.some((f) => path === f || path.startsWith(f + "/")),
		});
		await this.refresh();
	}

	async refresh() {
		this.items = this.plugin.planOperations.getPlans().map(planListItem);
		this.contacts = await this.plugin.contactOperations.getContacts();
		this.render();
	}

	// ---- People ----

	private peoplePaths(item: PlanListItem): string[] {
		return this.plugin.eventOperations.peoplePaths(item);
	}

	private displayName(path: string): string {
		const match = this.contacts.find((c) => c.file.path === path);
		if (match) return match.displayName;
		// A group page, or someone outside the People folder — the file name
		// is still a better answer than the raw path.
		return path.split("/").pop()?.replace(/\.md$/, "") ?? path;
	}

	/** Every member in full, joined — what the search reads. */
	private peopleNames(item: PlanListItem): string {
		return this.peoplePaths(item)
			.map((p) => this.displayName(p))
			.join(", ");
	}

	/** The roster as a row shows it: full for one, shortened beyond that. */
	private peopleSummary(item: PlanListItem): string {
		return summarisePeople(
			this.peoplePaths(item).map((path) => {
				const match = this.contacts.find((c) => c.file.path === path);
				return {
					displayName: this.displayName(path),
					shortName: match?.shortName ?? "",
				};
			})
		);
	}

	/** Everyone on at least one in-scope plan — the Person filter's roster,
	 * built from the plans so it never offers a name that returns nothing. */
	private personRoster(scope: PlanListItem[]): { path: string; label: string }[] {
		const seen = new Map<string, string>();
		for (const item of scope) {
			for (const path of this.peoplePaths(item)) {
				if (!seen.has(path)) seen.set(path, this.displayName(path));
			}
		}
		return [...seen.entries()]
			.map(([path, label]) => ({ path, label }))
			.sort((a, b) => a.label.localeCompare(b.label));
	}

	// ---- Filtering ----

	private weekStartsOn(): 0 | 1 {
		return this.plugin.settings.weekStartsOn === 0 ? 0 : 1;
	}

	/** The list under the live filters, with one facet optionally swapped
	 * for a hypothetical value — which is how each chip prices itself. */
	private pipeline(over: { status?: string; personPath?: string } = {}) {
		return planPipeline(
			this.items,
			{
				when: this.when,
				status: over.status ?? this.status,
				personPath: over.personPath ?? this.personPath,
				query: this.searchQuery.trim().toLowerCase(),
			},
			planSortOf(this.plugin.settings.planSort),
			{
				paths: (i) => this.peoplePaths(i),
				names: (i) => this.peopleNames(i),
			}
		);
	}

	/**
	 * What the chip rosters are built from: everything Upcoming / Past
	 * leaves on the table, before a facet or the search narrows it. A chip
	 * vanishing because of a filter you just applied would strand you with
	 * no way back.
	 */
	private inScope(): PlanListItem[] {
		return planPipeline(
			this.items,
			{ when: this.when, status: "", personPath: "", query: "" },
			"natural",
			{ paths: () => [], names: () => "" }
		);
	}

	private activeFilterCount(): number {
		return (this.status ? 1 : 0) + (this.personPath ? 1 : 0);
	}

	// ---- Rendering ----

	private render() {
		const container = this.contentEl;
		const scrollTop = container.scrollTop;
		container.empty();
		container.addClass("dashboard-container", "somedays-container");

		const header = container.createDiv({ cls: "dashboard-header" });
		header.createEl("h2", { text: "Plans" });
		const actions = header.createDiv({ cls: "dashboard-actions" });
		const newBtn = actions.createEl("button", { cls: "callander-button" });
		setIcon(newBtn, "plus");
		newBtn.createSpan({ text: "New plan" });
		newBtn.addEventListener("click", () => this.openEditor());

		// Only while it's empty — once there are plans on screen they say
		// what the page is far better than a sentence does.
		if (this.items.length === 0) {
			container.createDiv({
				cls: "section-helper-text someday-intro-note",
				text: "Something brewing? A weekend away, a dinner — plan it with the people it's for.",
			});
		}

		if (this.items.length > 0) {
			this.renderToolbar(container);
			this.renderWhenStrip(container);
			this.renderTabs(container);
		}

		this.listEl = container.createDiv({ cls: "someday-list" });
		this.renderContent();

		applyPageWidth(container, this.plugin, this.pageWide, () => {
			this.pageWide = true;
			this.render();
		});

		container.scrollTop = scrollTop;
	}

	private filterPill(
		row: HTMLElement,
		label: string,
		active: boolean,
		onClick: () => void,
		/** Omitted for the when pills — a mode, not a facet worth pricing. */
		count?: number
	) {
		const pill = row.createEl("button", {
			cls: `someday-filter-pill${active ? " is-active" : ""}`,
			text: count === undefined ? label : `${label} • ${count}`,
			attr: { type: "button" },
		});
		pill.addEventListener("click", onClick);
		return pill;
	}

	/**
	 * Search stretching left, Sort pinned right. The sort only appears on
	 * the List — the timeline is chronological by definition, so a dropdown
	 * there would change nothing.
	 */
	private renderToolbar(container: HTMLElement) {
		const toolbar = container.createDiv({ cls: "someday-toolbar" });

		const searchInput = toolbar.createEl("input", {
			attr: { type: "text", placeholder: "Search plans…" },
			cls: "contact-field-input someday-toolbar-search",
		});
		searchInput.value = this.searchQuery;
		searchInput.addEventListener("input", () => {
			this.searchQuery = searchInput.value;
			this.renderList();
		});

		if (this.tab !== "list") return;

		const sortSel = toolbar.createEl("select", {
			cls: "dropdown someday-filter-select",
		});
		PLAN_SORTS.forEach((s) =>
			sortSel.createEl("option", { value: s.id, text: s.label })
		);
		sortSel.value = planSortOf(this.plugin.settings.planSort);
		sortSel.addEventListener("change", () => {
			this.plugin.settings.planSort = sortSel.value as EventSort;
			void this.plugin.saveSettings().then(() => this.render());
		});
	}

	/** Upcoming / Past / All on the left, the Filters toggle hard right. */
	private renderWhenStrip(container: HTMLElement) {
		const row = container.createDiv({ cls: "events-when-row" });
		const strip = row.createDiv({
			cls: "someday-filter-options someday-quick-days",
		});
		for (const { id, label } of PLAN_WHEN_FILTERS) {
			this.filterPill(strip, label, this.when === id, () => {
				if (this.when === id) return;
				this.when = id;
				this.render();
			});
		}

		const filterBtn = row.createEl("button", {
			cls: `callander-button someday-filter-toggle${
				this.filtersOpen ? " is-open" : ""
			}`,
			attr: { type: "button", "aria-expanded": String(this.filtersOpen) },
		});
		setIcon(filterBtn, "filter");
		filterBtn.createSpan({ text: "Filters" });
		const active = this.activeFilterCount();
		if (active > 0) {
			filterBtn.createSpan({
				cls: "someday-filter-count",
				text: String(active),
			});
		}
		filterBtn.addEventListener("click", () => {
			this.filtersOpen = !this.filtersOpen;
			this.render();
		});

		if (this.filtersOpen) this.renderFilterPanel(container);
	}

	/** Timeline | List, as on Events — less the Calendar. */
	private renderTabs(container: HTMLElement) {
		const tabs = container.createDiv({
			cls: "callander-tabs",
			attr: { role: "tablist" },
		});
		const TABS: Array<{ id: "timeline" | "list"; label: string }> = [
			{ id: "timeline", label: "Timeline" },
			{ id: "list", label: "List" },
		];
		for (const { id, label } of TABS) {
			const active = this.tab === id;
			const button = tabs.createEl("button", {
				cls: `callander-tab${active ? " active" : ""}`,
				text: label,
				attr: {
					type: "button",
					role: "tab",
					"aria-selected": String(active),
				},
			});
			button.addEventListener("click", () => {
				if (this.tab === id) return;
				this.tab = id;
				this.render();
				// After the redraw: the write fires settings-changed and a
				// refresh of its own, and the tab has to look switched now.
				this.plugin.settings.plansTab = id;
				void this.plugin.saveSettings();
			});
		}
	}

	private renderFilterPanel(container: HTMLElement) {
		const wrap = container.createDiv({ cls: "someday-filters" });
		const scope = this.inScope();

		const statusRow = wrap.createDiv({ cls: "someday-filter-row" });
		statusRow.createSpan({ cls: "someday-filter-label", text: "Status" });
		const statusOpts = statusRow.createDiv({ cls: "someday-filter-options" });
		for (const s of PLAN_STATUSES) {
			// The current pick always renders, even once it's out of scope —
			// otherwise changing Upcoming / Past could leave it applied
			// invisibly.
			if (!scope.some((p) => p.status === s.id) && this.status !== s.id) {
				continue;
			}
			this.filterPill(
				statusOpts,
				`${s.emoji} ${s.label}`,
				this.status === s.id,
				() => {
					this.status = this.status === s.id ? "" : s.id;
					this.render();
				},
				this.pipeline({ status: s.id }).length
			);
		}

		const roster = this.personRoster(scope);
		if (this.personPath && !roster.some((p) => p.path === this.personPath)) {
			roster.push({
				path: this.personPath,
				label: this.displayName(this.personPath),
			});
			roster.sort((a, b) => a.label.localeCompare(b.label));
		}
		if (roster.length === 0) return;
		const personRow = wrap.createDiv({ cls: "someday-filter-row" });
		personRow.createSpan({ cls: "someday-filter-label", text: "Person" });
		const personOpts = personRow.createDiv({ cls: "someday-filter-options" });
		for (const person of roster) {
			this.filterPill(
				personOpts,
				person.label,
				this.personPath === person.path,
				() => {
					this.personPath =
						this.personPath === person.path ? "" : person.path;
					this.render();
				},
				this.pipeline({ personPath: person.path }).length
			);
		}
	}

	/** Rebuild just the list, keeping where you were reading. */
	private renderContent() {
		const container = this.contentEl;
		const scrollTop = container.scrollTop;
		if (this.tab === "timeline") this.renderTimeline();
		else this.renderList();
		container.scrollTop = scrollTop;
	}

	/** The List's own rows under a heading per week and month. */
	private renderTimeline() {
		const listEl = this.listEl;
		if (!listEl) return;
		listEl.empty();

		const list = this.pipeline();
		if (list.length === 0) {
			listEl.createDiv({ cls: "section-helper-text", text: this.emptyMessage() });
			return;
		}

		const wrap = listEl.createDiv({ cls: "events-timeline" });
		// No `alwaysYear`: this year's months read bare ("October") and only
		// another year's carry theirs ("October 2027") — the year is only
		// worth saying when it isn't the one you're in.
		const groups = groupEventsByPeriod(list, (p) => p.date, new Date(), {
			weekStartsOn: this.weekStartsOn(),
			// Headings turn round with the rows, or a timeline whose months
			// ascend while its rows descend reads as neither order.
			recentFirst: readsBackwards(this.when),
		});
		for (const period of groups) {
			wrap.createDiv({
				cls: "contact-timeline-year events-timeline-week",
				text: period.label,
			});
			for (const item of period.items) this.renderRow(wrap, item);
		}
	}

	private renderList() {
		const listEl = this.listEl;
		if (!listEl) return;
		listEl.empty();

		const list = this.pipeline();

		// A narrowed list says how narrowed it is; the ✕ resets the lot.
		const narrowed =
			this.searchQuery.trim().length > 0 || this.activeFilterCount() > 0;
		if (narrowed && this.items.length > 0) {
			const head = listEl.createDiv({ cls: "someday-results-head" });
			head.createEl("h3", {
				cls: "someday-results-heading",
				text: `Results (${list.length})`,
			});
			const clear = head.createEl("button", {
				cls: "someday-clear-button",
				text: "✕ Clear",
				attr: { type: "button", "aria-label": "Clear search and filters" },
			});
			clear.addEventListener("click", () => {
				this.searchQuery = "";
				this.status = "";
				this.personPath = "";
				this.render();
			});
		}
		if (list.length === 0) {
			listEl.createDiv({ cls: "section-helper-text", text: this.emptyMessage() });
			return;
		}
		for (const item of list) this.renderRow(listEl, item);
	}

	/**
	 * Why the list is empty. Upcoming and Past each hide half the timeline,
	 * so an empty list under one usually means "look at the other half",
	 * not "you have nothing".
	 */
	private emptyMessage(): string {
		if (this.items.length === 0) {
			return "No plans yet. Something brewing? Start one.";
		}
		const narrowed =
			this.searchQuery.trim().length > 0 || this.activeFilterCount() > 0;
		if (narrowed) return "Nothing matches these filters.";
		if (this.when === "upcoming") {
			return "No plans coming up — try Past to see the ones you've already made.";
		}
		if (this.when === "past") {
			return "No plans have happened yet — try Upcoming to see what's ahead.";
		}
		return "Nothing matches these filters.";
	}

	private renderRow(container: HTMLElement, item: PlanListItem) {
		const fields = planRowFields(item.plan, new Date(), this.peopleSummary(item));
		buildUpcomingRow(container, {
			...fields,
			// The "past" emphasis earns its keep on the dashboard, where a
			// gone-by date among upcoming ones means something slipped. Here
			// most of the page is history, so it would shout on every row.
			tone: fields.tone === "past" ? undefined : fields.tone,
			// The plan's own page, as from the dashboard's Plans section —
			// not the glance the Events page uses, whose "Hide from this
			// list" is about a list this one deliberately isn't.
			onClick: () => void this.plugin.openContactPage(item.plan.file),
		});
	}

	private openEditor() {
		new PlanModal(this.app, this.plugin, (file) =>
			void this.plugin.openContactPage(file)
		).open();
	}
}
