import {
	ItemView,
	WorkspaceLeaf,
	setIcon,
	Notice,
	type ViewStateResult,
} from "obsidian";
import { fieldOf } from "@/utils/fm";
import type FriendTracker from "@/main";
import type { SomedayInfo } from "@/types";
import { SomedayModal } from "@/modals/SomedayModal";
import { SomedayViewModal } from "@/modals/SomedayViewModal";
import { parseFlexDate, formatFlexDate } from "@/utils/flexdate";
import { splitLeadingEmoji } from "@/components/EventTimeline";
import {
	formatSomedayDays,
	formatSomedaySeasonDeadline,
	somedayType,
	SOMEDAY_DAYS,
	SOMEDAY_SEASONS,
	SOMEDAY_COMPANY,
	SOMEDAY_TYPES,
	SOMEDAY_SORTS,
	SomedayDay,
	SomedayCompany,
	SomedaySort,
	SomedayType,
} from "@/constants";
import {
	sortSomedays,
	finalDateLabel,
	dateDeadlineLabel,
	WEEKDAY_BY_INDEX,
} from "@/utils/somedaySort";

export const VIEW_TYPE_SOMEDAYS = "callander-somedays";

type DayFilter = "today" | "tomorrow" | "weekend";

/**
 * The full page of Somedays — the wishlist. Each idea is a plain row; clicking
 * one opens a view modal. A filter bar narrows by when (Today / Weekend / a
 * specific day / a season), by party (solo vs group) and by type, and a
 * sort the dashboard's own Somedays list follows.
 */
export class SomedaysView extends ItemView {
	private somedays: SomedayInfo[] = [];
	private searchQuery = "";
	private focusPath: string | null = null;
	private listEl: HTMLElement | null = null;

	// Filters — "when" (day toggles + specific-day + season, union) and party.
	private dayFilters = new Set<DayFilter>();
	private specificDay: SomedayDay | "" = "";
	private season = "";
	private company: SomedayCompany | "" = "";
	private type: SomedayType | "" = "";
	// Reshuffles the Random sort. Set once per page open (and when Random is
	// picked) rather than per render, so the list holds still while you type
	// in the search box or flip a filter.
	private randomSeed = Math.floor(Math.random() * 2 ** 31);

	constructor(leaf: WorkspaceLeaf, private plugin: FriendTracker) {
		super(leaf);
		this.navigation = true;
	}

	getViewType(): string {
		return VIEW_TYPE_SOMEDAYS;
	}

	getDisplayText(): string {
		return "Somedays";
	}

	getIcon(): string {
		return "sparkles";
	}

	async onOpen() {
		// A fresh shuffle each time the page is opened.
		this.randomSeed = Math.floor(Math.random() * 2 ** 31);
		const folder = this.plugin.somedayOperations.getSomedaysFolderPath();
		const inScope = (path: string) =>
			path === folder || path.startsWith(folder + "/");
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (inScope(file.path)) void this.refresh();
			})
		);
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (inScope(file.path)) void this.refresh();
			})
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (inScope(file.path)) void this.refresh();
			})
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (inScope(file.path) || inScope(oldPath)) void this.refresh();
			})
		);
		await this.refresh();
	}

	// Opening a Someday file routes here with its path → open its view modal.
	async setState(state: unknown, result: ViewStateResult) {
		const focusPath = fieldOf(state, "focusPath");
		this.focusPath = typeof focusPath === "string" ? focusPath : null;
		await super.setState(state, result);
		await this.refresh();
	}

	getState() {
		return {
			type: VIEW_TYPE_SOMEDAYS,
			focusPath: this.focusPath ?? undefined,
		};
	}

	async refresh() {
		this.somedays = this.plugin.somedayOperations.getSomedays();
		this.render();
	}

	// ---- Filtering ----

	private weekdayId(d: Date): SomedayDay {
		return WEEKDAY_BY_INDEX[d.getDay()];
	}

	private matchesFilters(s: SomedayInfo): boolean {
		// Type — exact match; unset is excluded like every other filter here.
		if (this.type && s.type !== this.type) return false;

		// Party — solo/group, with "either" matching both. Unset is excluded.
		if (
			this.company === "solo" &&
			!(s.company === "solo" || s.company === "either")
		) {
			return false;
		}
		if (
			this.company === "group" &&
			!(s.company === "group" || s.company === "either")
		) {
			return false;
		}

		// "When" — union of active filters. An idea with no candidate days is
		// available any day, so it passes every day filter.
		const dayOk = (wd: SomedayDay) =>
			s.days.length === 0 || s.days.includes(wd);
		const preds: boolean[] = [];
		if (this.dayFilters.has("today")) {
			preds.push(dayOk(this.weekdayId(new Date())));
		}
		if (this.dayFilters.has("tomorrow")) {
			const d = new Date();
			d.setDate(d.getDate() + 1);
			preds.push(dayOk(this.weekdayId(d)));
		}
		if (this.dayFilters.has("weekend")) {
			preds.push(
				s.days.length === 0 ||
					s.days.includes("sat") ||
					s.days.includes("sun")
			);
		}
		if (this.specificDay) preds.push(dayOk(this.specificDay));
		if (this.season) preds.push(s.seasons.includes(this.season));
		if (preds.length === 0) return true;
		return preds.some((p) => p);
	}

	private sorted(): SomedayInfo[] {
		const q = this.searchQuery.trim().toLowerCase();
		const matches = this.somedays.filter((s) => {
			if (!this.matchesFilters(s)) return false;
			if (!q) return true;
			return (
				s.name.toLowerCase().includes(q) ||
				s.notes.toLowerCase().includes(q) ||
				s.people.some((p) => p.toLowerCase().includes(q)) ||
				s.subIdeas.some((sub) => sub.text.toLowerCase().includes(q))
			);
		});
		return sortSomedays(matches, this.plugin.settings.somedaySort, {
			randomSeed: this.randomSeed,
			hemisphere: this.plugin.settings.hemisphere,
		});
	}

	/** Open, un-converted somedays among the currently filtered set. */
	private openCandidates(): SomedayInfo[] {
		return this.sorted().filter(
			(s) => s.status !== "done" && !s.convertedTo
		);
	}

	private surpriseMe() {
		const open = this.openCandidates();
		if (open.length === 0) {
			new Notice("Nothing to surprise you with");
			return;
		}
		const pick = open[Math.floor(Math.random() * open.length)];
		this.openViewModal(pick);
	}

	// ---- Rendering ----

	private render() {
		const container = this.containerEl.children[1] as HTMLElement;
		const scrollTop = container.scrollTop;
		container.empty();
		container.addClass("dashboard-container", "somedays-container");

		// Header + New someday (+ Surprise me)
		const header = container.createDiv({ cls: "dashboard-header" });
		header.createEl("h2", { text: "Somedays" });
		const actions = header.createDiv({ cls: "dashboard-actions" });
		const newBtn = actions.createEl("button", {
			cls: "callander-button",
		});
		setIcon(newBtn, "plus");
		newBtn.createSpan({ text: "New someday" });
		newBtn.addEventListener("click", () => this.openEditor(null));

		if (this.openCandidates().length >= 2) {
			const surpriseBtn = actions.createEl("button", {
				cls: "callander-button",
			});
			setIcon(surpriseBtn, "dices");
			surpriseBtn.createSpan({ text: "Surprise me" });
			surpriseBtn.addEventListener("click", () => this.surpriseMe());
		}

		if (this.somedays.length > 0) this.renderFilters(container);

		// Search (only worth showing once there are a few)
		if (this.somedays.length > 4) {
			const searchWrap = container.createDiv({
				cls: "dashboard-search",
			});
			const searchInput = searchWrap.createEl("input", {
				attr: { type: "text", placeholder: "Search somedays…" },
				cls: "contact-field-input",
			});
			searchInput.value = this.searchQuery;
			searchInput.addEventListener("input", () => {
				this.searchQuery = searchInput.value;
				this.renderList();
			});
		}

		this.listEl = container.createDiv({ cls: "someday-list" });
		this.renderList();

		// Intro/helper text sits at the very bottom, under the list.
		container.createDiv({
			cls: "section-helper-text someday-footer-note",
			text: "Ideas you might do one day — a park, a bar, a trip. Give them a rough when; convert one into a plan when it firms up.",
		});

		container.scrollTop = scrollTop;
	}

	private filterPill(
		row: HTMLElement,
		label: string,
		active: boolean,
		onClick: () => void
	) {
		const pill = row.createEl("button", {
			cls: `someday-filter-pill${active ? " is-active" : ""}`,
			text: label,
			attr: { type: "button" },
		});
		pill.addEventListener("click", onClick);
		return pill;
	}

	private renderFilters(container: HTMLElement) {
		const wrap = container.createDiv({ cls: "someday-filters" });

		// Days — day toggles + a specific-day and a season dropdown (union)
		const row1 = wrap.createDiv({ cls: "someday-filter-row" });
		row1.createSpan({ cls: "someday-filter-label", text: "Days" });
		const opts1 = row1.createDiv({ cls: "someday-filter-options" });
		const dayPill = (id: DayFilter, label: string) =>
			this.filterPill(opts1, label, this.dayFilters.has(id), () => {
				if (this.dayFilters.has(id)) this.dayFilters.delete(id);
				else this.dayFilters.add(id);
				this.render();
			});
		dayPill("today", "Today");
		dayPill("tomorrow", "Tomorrow");
		dayPill("weekend", "Weekend");

		const daySel = opts1.createEl("select", {
			cls: "dropdown someday-filter-select",
		});
		daySel.createEl("option", { value: "", text: "Day…" });
		SOMEDAY_DAYS.forEach((d) =>
			daySel.createEl("option", { value: d.id, text: d.label })
		);
		daySel.value = this.specificDay;
		daySel.addEventListener("change", () => {
			this.specificDay = daySel.value as SomedayDay | "";
			this.render();
		});

		const seasonSel = opts1.createEl("select", {
			cls: "dropdown someday-filter-select",
		});
		seasonSel.createEl("option", { value: "", text: "Season…" });
		SOMEDAY_SEASONS.forEach((s) =>
			seasonSel.createEl("option", { value: s.id, text: s.label })
		);
		seasonSel.value = this.season;
		seasonSel.addEventListener("change", () => {
			this.season = seasonSel.value;
			this.render();
		});

		// Party — solo / group (each a toggle; neither = everyone)
		const row2 = wrap.createDiv({ cls: "someday-filter-row" });
		row2.createSpan({ cls: "someday-filter-label", text: "Party" });
		const opts2 = row2.createDiv({ cls: "someday-filter-options" });
		(["group", "solo"] as const).forEach((id) => {
			const c = SOMEDAY_COMPANY.find((x) => x.id === id)!;
			this.filterPill(
				opts2,
				`${c.emoji} ${c.label}`,
				this.company === id,
				() => {
					this.company = this.company === id ? "" : id;
					this.render();
				}
			);
		});

		// Type — a dropdown rather than pills; 16 options is too many to
		// scan as a row, same reasoning as the modal's own Type field.
		const row3 = wrap.createDiv({ cls: "someday-filter-row" });
		row3.createSpan({ cls: "someday-filter-label", text: "Type" });
		const opts3 = row3.createDiv({ cls: "someday-filter-options" });
		const typeSel = opts3.createEl("select", {
			cls: "dropdown someday-filter-select",
		});
		typeSel.createEl("option", { value: "", text: "Type…" });
		SOMEDAY_TYPES.forEach((t) =>
			typeSel.createEl("option", {
				value: t.id,
				text: `${t.emoji} ${t.label}`,
			})
		);
		typeSel.value = this.type;
		typeSel.addEventListener("change", () => {
			this.type = typeSel.value as SomedayType | "";
			this.render();
		});

		// Sort — persisted, because the dashboard's Somedays list follows it.
		const row4 = wrap.createDiv({ cls: "someday-filter-row" });
		row4.createSpan({ cls: "someday-filter-label", text: "Sort" });
		const opts4 = row4.createDiv({ cls: "someday-filter-options" });
		const sortSel = opts4.createEl("select", {
			cls: "dropdown someday-filter-select",
		});
		SOMEDAY_SORTS.forEach((s) =>
			sortSel.createEl("option", { value: s.id, text: s.label })
		);
		sortSel.value = this.plugin.settings.somedaySort;
		const handleSortChange = async () => {
			const next = sortSel.value as SomedaySort;
			// Re-picking Random deals a new order, rather than leaving the
			// same shuffle sitting there looking like nothing happened.
			if (next === "random") {
				this.randomSeed = Math.floor(Math.random() * 2 ** 31);
			}
			this.plugin.settings.somedaySort = next;
			await this.plugin.saveSettings();
			this.render();
			// The dashboard follows this sort, so bring it along.
			this.plugin.refreshDashboards();
		};
		sortSel.addEventListener("change", () => void handleSortChange());
	}

	private renderList() {
		const listEl = this.listEl;
		if (!listEl) return;
		listEl.empty();

		const list = this.sorted();
		if (list.length === 0) {
			listEl.createDiv({
				cls: "section-helper-text",
				text:
					this.somedays.length === 0
						? "No somedays yet. Add the first thing you'd love to do."
						: "Nothing matches these filters.",
			});
			return;
		}

		for (const someday of list) this.renderRow(listEl, someday);

		// A row opened directly (via its file) → open its view modal, once.
		if (this.focusPath) {
			const target = list.find((s) => s.file.path === this.focusPath);
			this.focusPath = null;
			if (target) this.openViewModal(target);
		}
	}

	/**
	 * The right-hand summary: "Sat / Sun", "Any day · Sat 12 Sep", or
	 * nothing at all.
	 *
	 * Seasons and a month/year-precision date are deliberately absent —
	 * they read as a deadline beside the name ("by end of Fall", "by end
	 * of Sep") rather than as timing here; see dateDeadlineLabel. An
	 * unconstrained someday says nothing rather than "Any time", which
	 * every row would otherwise carry.
	 */
	private whenSummary(s: SomedayInfo): string {
		const days = formatSomedayDays(s.days);
		const flex = parseFlexDate(s.date);
		if (flex && flex.day !== null) {
			const when = formatFlexDate(flex);
			return days ? `${days} · ${when}` : when;
		}
		return days;
	}

	private renderRow(container: HTMLElement, someday: SomedayInfo) {
		const inactive = someday.status === "done" || !!someday.convertedTo;
		const row = container.createDiv({
			cls: `someday-card someday-row${
				inactive ? " someday-inactive" : ""
			}`,
		});

		// The type emoji leads the title unless the name brings its own —
		// same treatment as the view modal, so the row and its detail match.
		const typeInfo = somedayType(someday.type);
		const title =
			typeInfo && !splitLeadingEmoji(someday.name)
				? `${typeInfo.emoji} ${someday.name}`
				: someday.name;
		const main = row.createDiv({ cls: "someday-row-main" });
		main.createSpan({ cls: "someday-title", text: title });

		// Deadlines ride with the name rather than the timing summary —
		// they're about this someday running out, not about when it suits.
		// A final date leads: it's the firmer of the three. The date and
		// season entries never both fire — the modal keeps them mutually
		// exclusive.
		const now = new Date();
		const deadlines = [
			finalDateLabel(someday.finalDate, now),
			dateDeadlineLabel(someday.date, now),
			formatSomedaySeasonDeadline(someday.seasons),
		].filter(Boolean);
		if (deadlines.length > 0) {
			main.createSpan({
				cls: "someday-row-final",
				text: ` • ${deadlines.join(" • ")}`,
			});
		}

		const when = this.whenSummary(someday);
		if (when) {
			row.createDiv({ cls: "someday-row-when", text: when });
		}

		row.addEventListener("click", () => this.openViewModal(someday));
	}

	private openViewModal(someday: SomedayInfo) {
		new SomedayViewModal(this.app, this.plugin, someday, () =>
			this.refresh()
		).open();
	}

	private openEditor(someday: SomedayInfo | null) {
		new SomedayModal(
			this.app,
			this.plugin,
			someday,
			() => this.refresh(),
			() => this.refresh()
		).open();
	}
}
