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
import { parseFlexDate, formatFlexDate, flexSortKey } from "@/utils/flexdate";
import {
	formatSomedayDays,
	formatSomedaySeasons,
	somedayCompany,
	SOMEDAY_DAYS,
	SOMEDAY_SEASONS,
	SOMEDAY_COMPANY,
	SomedayDay,
	SomedayCompany,
} from "@/constants";

export const VIEW_TYPE_SOMEDAYS = "callander-somedays";

type DayFilter = "today" | "tomorrow" | "weekend";
/** JS getDay() (0=Sun) → our weekday ids */
const WEEKDAY_BY_INDEX: SomedayDay[] = [
	"sun",
	"mon",
	"tue",
	"wed",
	"thu",
	"fri",
	"sat",
];

/**
 * The full page of Somedays — the wishlist. Each idea is a plain row; clicking
 * one opens a view modal. A filter bar narrows by when (Today / Weekend / a
 * specific day / a season) and by party (solo vs group).
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

	/** Active (open, un-converted) first; dated before undated; done/converted last. */
	private rank(s: SomedayInfo): number {
		if (s.status === "done" || s.convertedTo) return 3;
		const f = parseFlexDate(s.date);
		return f && f.year !== null ? 1 : 2;
	}

	private sorted(): SomedayInfo[] {
		const q = this.searchQuery.trim().toLowerCase();
		const matches = this.somedays.filter((s) => {
			if (!this.matchesFilters(s)) return false;
			if (!q) return true;
			return (
				s.name.toLowerCase().includes(q) ||
				s.notes.toLowerCase().includes(q) ||
				s.subIdeas.some((sub) => sub.text.toLowerCase().includes(q))
			);
		});
		return matches.sort((a, b) => {
			const ra = this.rank(a);
			const rb = this.rank(b);
			if (ra !== rb) return ra - rb;
			if (ra === 1) {
				return (
					flexSortKey(parseFlexDate(a.date)!) -
					flexSortKey(parseFlexDate(b.date)!)
				);
			}
			return a.name.localeCompare(b.name);
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
		(["solo", "group"] as const).forEach((id) => {
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

	private whenLabel(s: SomedayInfo): string {
		const f = parseFlexDate(s.date);
		if (f) return formatFlexDate(f);
		return formatSomedaySeasons(s.seasons) || "Any time";
	}

	private renderRow(container: HTMLElement, someday: SomedayInfo) {
		const inactive = someday.status === "done" || !!someday.convertedTo;
		const row = container.createDiv({
			cls: `someday-card someday-row${
				inactive ? " someday-inactive" : ""
			}`,
		});
		row.createDiv({ cls: "someday-card-titleline" }).createSpan({
			cls: "someday-title",
			text: someday.name,
		});

		const subParts: string[] = [this.whenLabel(someday)];
		const comp = somedayCompany(someday.company);
		if (comp) subParts.push(comp.label);
		const days = formatSomedayDays(someday.days);
		if (days) subParts.push(days);
		row.createDiv({
			cls: "someday-card-subline",
			text: subParts.filter(Boolean).join(" · "),
		});

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
