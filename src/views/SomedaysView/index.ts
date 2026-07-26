import { ItemView, WorkspaceLeaf, TFile, setIcon } from "obsidian";
import type FriendTracker from "@/main";
import type { SomedayInfo } from "@/types";
import { SomedayModal } from "@/modals/SomedayModal";
import { ConfirmModal } from "@/modals/ConfirmModal";
import {
	parseFlexDate,
	formatFlexDate,
	flexSortKey,
} from "@/utils/flexdate";
import { formatSomedayDays, somedayTimeframe } from "@/constants";

export const VIEW_TYPE_SOMEDAYS = "callander-somedays";

/**
 * The full page of Somedays — the wishlist. Lists every idea as a card, sorted
 * so the soonest-dated float to the top and finished/converted ones sink. A
 * light counterpart to the Plans list; a card can be promoted into a real Plan.
 */
export class SomedaysView extends ItemView {
	private somedays: SomedayInfo[] = [];
	private searchQuery = "";
	private focusPath: string | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: FriendTracker) {
		super(leaf);
		// Participate in tab history so back/forward arrows work
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
				if (inScope(file.path)) this.refresh();
			})
		);
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (inScope(file.path)) this.refresh();
			})
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (inScope(file.path)) this.refresh();
			})
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (inScope(file.path) || inScope(oldPath)) this.refresh();
			})
		);
		await this.refresh();
	}

	// Opening a Someday file routes here with its path, so we can highlight it.
	async setState(state: any, result: any) {
		this.focusPath = state?.focusPath ?? null;
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

	/** Active (open, un-converted) first; dated before undated; done/converted last. */
	private rank(s: SomedayInfo): number {
		if (s.status === "done" || s.convertedTo) return 3;
		const f = parseFlexDate(s.date);
		return f && f.year !== null ? 1 : 2;
	}

	private sorted(): SomedayInfo[] {
		const q = this.searchQuery.trim().toLowerCase();
		const matches = q
			? this.somedays.filter(
					(s) =>
						s.name.toLowerCase().includes(q) ||
						s.notes.toLowerCase().includes(q) ||
						s.location.toLowerCase().includes(q) ||
						s.subIdeas.some((sub) =>
							sub.text.toLowerCase().includes(q)
						)
			  )
			: [...this.somedays];
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

	private render() {
		const container = this.containerEl.children[1] as HTMLElement;
		const scrollTop = container.scrollTop;
		container.empty();
		container.addClass("dashboard-container", "somedays-container");

		// Header + New someday
		const header = container.createEl("div", { cls: "dashboard-header" });
		header.createEl("h2", { text: "Somedays" });
		const actions = header.createEl("div", { cls: "dashboard-actions" });
		const newBtn = actions.createEl("button", {
			cls: "friend-tracker-button",
		});
		setIcon(newBtn, "plus");
		newBtn.createSpan({ text: "New someday" });
		newBtn.addEventListener("click", () => this.openEditor(null));

		container.createEl("div", {
			cls: "section-helper-text",
			text: "Ideas you might do one day — a park, a bar, a trip. Give them a rough when; convert one into a plan when it firms up.",
		});

		// Search (only worth showing once there are a few)
		if (this.somedays.length > 4) {
			const searchWrap = container.createEl("div", {
				cls: "dashboard-search",
			});
			const searchInput = searchWrap.createEl("input", {
				attr: { type: "text", placeholder: "Search somedays…" },
				cls: "contact-field-input",
			});
			searchInput.value = this.searchQuery;
			searchInput.addEventListener("input", () => {
				this.searchQuery = searchInput.value;
				this.render();
			});
		}

		const list = this.sorted();
		if (list.length === 0) {
			container.createEl("div", {
				cls: "section-helper-text",
				text: this.searchQuery
					? "Nothing matches."
					: "No somedays yet. Add the first thing you'd love to do.",
			});
			container.scrollTop = scrollTop;
			return;
		}

		let focusEl: HTMLElement | null = null;
		for (const someday of list) {
			const card = this.renderCard(container, someday);
			if (this.focusPath && someday.file.path === this.focusPath) {
				focusEl = card;
			}
		}

		container.scrollTop = scrollTop;
		if (focusEl) {
			const el = focusEl;
			el.addClass("is-focused");
			setTimeout(() => el.scrollIntoView({ block: "center" }), 0);
			// Clear the highlight target so a later refresh doesn't re-flash it
			this.focusPath = null;
		}
	}

	private whenLabel(s: SomedayInfo): string {
		const f = parseFlexDate(s.date);
		if (f) return formatFlexDate(f);
		if (s.timeframe) {
			const tf = somedayTimeframe(s.timeframe);
			return tf ? `${tf.emoji} ${tf.label}` : s.timeframe;
		}
		return "";
	}

	private renderCard(
		container: HTMLElement,
		someday: SomedayInfo
	): HTMLElement {
		const ops = this.plugin.somedayOperations;
		const inactive = someday.status === "done" || !!someday.convertedTo;
		const card = container.createEl("div", {
			cls: `someday-card${inactive ? " someday-inactive" : ""}`,
		});

		// Title + when
		const head = card.createEl("div", { cls: "someday-card-head" });
		head.createSpan({ cls: "someday-title", text: someday.name });
		const when = this.whenLabel(someday);
		if (when) head.createSpan({ cls: "someday-when", text: when });

		// Meta: days · cost · location
		const metaParts: string[] = [];
		const daysLabel = formatSomedayDays(someday.days);
		if (daysLabel) metaParts.push(daysLabel);
		if (someday.cost !== null) metaParts.push(`~$${someday.cost}`);
		if (someday.location) metaParts.push(someday.location);
		if (metaParts.length > 0) {
			card.createEl("div", {
				cls: "someday-meta",
				text: metaParts.join(" · "),
			});
		}

		if (someday.notes) {
			card.createEl("div", { cls: "someday-notes", text: someday.notes });
		}

		// Breadcrumb to the plan it became
		if (someday.convertedTo) {
			const link = card.createEl("div", {
				cls: "someday-converted-link",
				text: "→ opened as a plan",
			});
			link.addEventListener("click", () => {
				const pf = this.app.vault.getFileByPath(someday.convertedTo);
				if (pf) this.plugin.openContactPage(pf);
			});
		}

		this.renderSubIdeas(card, someday);

		// Actions
		const actions = card.createEl("div", { cls: "someday-actions" });
		const action = (
			icon: string,
			label: string,
			onClick: () => void,
			extraCls = ""
		) => {
			const btn = actions.createEl("button", {
				cls: `friend-tracker-button someday-action ${extraCls}`.trim(),
			});
			setIcon(btn, icon);
			btn.createSpan({ text: label });
			btn.addEventListener("click", onClick);
			return btn;
		};

		action("pencil", "Edit", () => this.openEditor(someday));
		if (!someday.convertedTo) {
			action("map", "Convert to plan", () =>
				this.plugin.convertSomedayToPlan(someday)
			);
		}
		if (someday.status === "done") {
			action("rotate-ccw", "Reopen", async () => {
				await ops.setStatus(someday.file, "open");
				await this.refresh();
			});
		} else {
			action("check", "Done", async () => {
				await ops.setStatus(someday.file, "done");
				await this.refresh();
			});
		}
		const del = actions.createEl("button", {
			cls: "friend-tracker-button button-icon button-danger someday-action",
			attr: { "aria-label": "Delete someday" },
		});
		setIcon(del, "trash");
		del.addEventListener("click", () => {
			new ConfirmModal(
				this.app,
				"Delete someday",
				`Delete "${someday.name}"?`,
				"Delete",
				async () => {
					await ops.deleteSomeday(someday.file);
					await this.refresh();
				}
			).open();
		});

		return card;
	}

	private renderSubIdeas(card: HTMLElement, someday: SomedayInfo) {
		const ops = this.plugin.somedayOperations;
		const wrap = card.createEl("div", { cls: "someday-subideas" });

		someday.subIdeas.forEach((sub, index) => {
			const row = wrap.createEl("div", {
				cls: `someday-subidea${sub.done ? " done" : ""}`,
			});
			const box = row.createEl("input", {
				attr: { type: "checkbox", "aria-label": "Done" },
			});
			box.checked = !!sub.done;
			box.addEventListener("change", async () => {
				await ops.toggleSubIdea(someday.file, index);
				await this.refresh();
			});
			row.createSpan({ cls: "someday-subidea-text", text: sub.text });
			const del = row.createEl("button", {
				cls: "friend-tracker-button button-icon button-danger",
				attr: { "aria-label": "Remove sub-idea" },
			});
			setIcon(del, "trash");
			del.addEventListener("click", async () => {
				await ops.removeSubIdea(someday.file, index);
				await this.refresh();
			});
		});

		const addRow = wrap.createEl("div", {
			cls: "contact-ideas-add-row someday-subidea-add",
		});
		const input = addRow.createEl("input", {
			cls: "contact-field-input",
			attr: { type: "text", placeholder: "Add a sub-idea…" },
		});
		const addBtn = addRow.createEl("button", {
			cls: "friend-tracker-button",
		});
		setIcon(addBtn, "plus");
		addBtn.createSpan({ text: "Add" });
		const add = async () => {
			const text = input.value.trim();
			if (!text) return;
			await ops.addSubIdea(someday.file, text);
			await this.refresh();
		};
		addBtn.addEventListener("click", add);
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") add();
		});
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
