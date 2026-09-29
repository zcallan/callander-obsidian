import {
	Component,
	ItemView,
	WorkspaceLeaf,
	MarkdownRenderer,
	setIcon,
} from "obsidian";
import type CallanderPlugin from "@/main";
import { applyPageWidth, observePageRoom } from "@/components/pageWidth";
import type { DiaryEntry } from "@/types";
import { DiaryEntryModal } from "@/modals/DiaryEntryModal";
import { formatDate } from "@/utils/dateFormat";
import { truncate } from "@/utils/text";
import { ConfirmModal } from "@/modals/ConfirmModal";
import { registerPageRefresh } from "@/utils/vaultRefresh";
import { runAction } from "@/utils/async";
import { FocusKeeper, makeActivatable } from "@/components/activatable";

export const VIEW_TYPE_DIARY = "callander-diary-view";

/** How much of an entry's body its card shows. */
const SNIPPET_CHARS = 120;

export class DiaryView extends ItemView {
	private entries: DiaryEntry[] = [];
	/** Widened for this view only, until it closes. */
	private pageWide = false;
	private expandedPath: string | null = null;
	/** Keyboard focus across a redraw — see FocusKeeper. */
	private readonly focusKeeper = new FocusKeeper();
	/** What the current render's markdown hangs from (renderBody). */
	private renderChild: Component | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: CallanderPlugin) {
		super(leaf);
		// Participate in tab history so back/forward arrows work
		this.navigation = true;
	}

	async onClose() {
		this.renderChild?.unload();
		this.renderChild = null;
	}

	getViewType(): string {
		return VIEW_TYPE_DIARY;
	}

	getDisplayText(): string {
		return "Diary";
	}

	getIcon(): string {
		return "book-open";
	}

	async onOpen() {
		// Once for the life of the view, not per render — it only has to
		// know whether there's room beside the column.
		this.register(observePageRoom(this));
		// Diary entries may live outside the base folder, so the scope is
		// the diary's own.
		registerPageRefresh(this, this.plugin, () => void this.refresh(), {
			scope: (path) => this.plugin.diaryOperations.isDiaryFile(path),
		});
		await this.refresh();
	}

	async refresh() {
		this.entries = await this.plugin.diaryOperations.getEntries();
		this.render();
	}

	private render() {
		this.renderBody();
		// Wrapped after the fact rather than at each of renderBody's exits,
		// which include an early return for an empty diary.
		applyPageWidth(
			this.contentEl,
			this.plugin,
			this.pageWide,
			() => {
				this.pageWide = true;
				this.render();
			}
		);
	}

	private renderBody() {
		// The entries' rendered markdown hangs from a component of this
		// render's own, unloaded at the next and on close. Rendered against
		// the view, every post-processor child a refresh or an expand ever
		// made stayed alive until the view closed.
		this.renderChild?.unload();
		this.renderChild = new Component();
		this.renderChild.load();
		const container = this.contentEl;
		this.focusKeeper.hold(container);
		container.empty();
		container.addClass("diary-view-container");

		// Header
		const header = container.createDiv({ cls: "diary-header" });
		header.createEl("h2", { text: "Diary" });
		const newButton = header.createEl("button", {
			cls: "callander-button button-primary",
			text: "New entry",
		});
		newButton.addEventListener("click", () => this.openNewEntryModal());

		if (this.entries.length === 0) {
			container.createDiv({
				cls: "section-helper-text diary-empty-state",
				text: "Your private journal. Each entry is filed under the date it's about — so you can backfill Tuesday's entry on Friday.",
			});
			return;
		}

		// Group entries by month of their "about" date
		const groups = new Map<string, DiaryEntry[]>();
		for (const entry of this.entries) {
			const key = this.monthLabel(entry.date);
			if (!groups.has(key)) groups.set(key, []);
			groups.get(key)!.push(entry);
		}

		const list = container.createDiv({ cls: "diary-list" });
		for (const [month, monthEntries] of groups) {
			list.createDiv({ cls: "diary-month-header", text: month });
			for (const entry of monthEntries) {
				this.renderEntryCard(list, entry);
			}
		}
		this.focusKeeper.restore(container);
	}

	private monthLabel(dateStr: string): string {
		if (!dateStr) return "Undated";
		const [year, month] = dateStr.split("-").map(Number);
		if (!year || !month) return "Undated";
		return formatDate(new Date(year, month - 1, 1), {
			month: "long",
			year: "numeric",
		});
	}

	private formatEntryDate(dateStr: string): string {
		if (!dateStr) return "";
		const [year, month, day] = dateStr.split("-").map(Number);
		if (!year || !month || !day) return dateStr;
		return formatDate(new Date(year, month - 1, day), {
			weekday: "short",
			day: "numeric",
			month: "short",
		});
	}

	private renderEntryCard(container: HTMLElement, entry: DiaryEntry) {
		const isExpanded = this.expandedPath === entry.file.path;

		const card = container.createDiv({
			cls: `diary-entry-card ${isExpanded ? "expanded" : ""}`,
		});

		// Card header (always visible, click to expand/collapse)
		const cardHeader = card.createDiv({ cls: "diary-entry-header" });
		cardHeader.createDiv({
			cls: "diary-entry-date",
			text: this.formatEntryDate(entry.date),
		});
		cardHeader.createDiv({
			cls: "diary-entry-title",
			text: entry.title,
		});

		if (!isExpanded) {
			const snippet = this.plainSnippet(entry.body);
			if (snippet) {
				cardHeader.createDiv({
					cls: "diary-entry-snippet",
					text: snippet,
				});
			}
		}

		// Opening it redraws the page, and focus follows the header to its
		// successor (the focus key) rather than dropping to the top.
		makeActivatable(
			cardHeader,
			() => {
				this.expandedPath = isExpanded ? null : entry.file.path;
				this.render();
			},
			{ focusKey: `diary:${entry.file.path}` }
		);
		cardHeader.setAttribute("aria-expanded", String(isExpanded));

		if (!isExpanded) return;

		// Expanded: rendered body + toolbar
		const bodyContainer = card.createDiv({ cls: "diary-entry-body" });
		void this.renderReadingView(bodyContainer, entry);
		this.renderToolbar(card, entry);
	}

	private plainSnippet(body: string): string {
		const plain = body
			.replace(/[#>*_`[\]!-]/g, "")
			.replace(/\s+/g, " ")
			.trim();
		return truncate(plain, SNIPPET_CHARS);
	}

	private async renderReadingView(container: HTMLElement, entry: DiaryEntry) {
		if (!entry.body.trim()) {
			container.createDiv({
				cls: "section-helper-text",
				text: "No content yet — click Edit to write.",
			});
			return;
		}
		const child = this.renderChild;
		if (!child) return;
		const rendered = container.createDiv({
			cls: "diary-entry-rendered",
		});
		await MarkdownRenderer.render(
			this.app,
			entry.body,
			rendered,
			entry.file.path,
			child
		);
	}

	// Editing happens in Obsidian's native markdown editor (decided 2026-07-22)
	private async openInEditor(entry: DiaryEntry) {
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(entry.file);
	}

	private renderToolbar(card: HTMLElement, entry: DiaryEntry) {
		const toolbar = card.createDiv({ cls: "diary-entry-toolbar" });

		const editButton = toolbar.createEl("button", {
			cls: "callander-button",
		});
		setIcon(editButton, "pencil");
		editButton.createSpan({ text: "Edit" });
		editButton.addEventListener("click", () =>
			void this.openInEditor(entry)
		);

		// Put this entry on the timeline of every [[linked]] friend
		const logButton = toolbar.createEl("button", {
			cls: "callander-button",
		});
		setIcon(logButton, "milestone");
		logButton.createSpan({ text: "Log to timelines" });
		logButton.addEventListener("click", () =>
			runAction("log the entry to timelines", () =>
				this.plugin.logDiaryEntryToTimelines(entry.file)
			)
		);

		toolbar.createDiv({ cls: "diary-toolbar-spacer" });

		// Edit metadata (title / about-date)
		const metaButton = toolbar.createEl("button", {
			cls: "callander-button button-icon",
			attr: { "aria-label": "Edit title and date" },
		});
		setIcon(metaButton, "settings-2");
		metaButton.addEventListener("click", () => {
			new DiaryEntryModal(
				this.app,
				{ title: entry.title, date: entry.date },
				async (title, date) => {
					await this.plugin.diaryOperations.updateMetadata(
						entry.file,
						title,
						date
					);
					this.expandedPath = entry.file.path;
				}
			).open();
		});

		// Delete
		const deleteButton = toolbar.createEl("button", {
			cls: "callander-button button-icon button-danger",
			attr: { "aria-label": "Delete entry" },
		});
		setIcon(deleteButton, "trash");
		deleteButton.addEventListener("click", () => {
			new ConfirmModal(this.app, {
				title: "Delete diary entry",
				message: `Are you sure you want to delete "${entry.title}"? It will be moved to your trash.`,
				failure: "Couldn't delete",
				onConfirm: async () => {
					await this.plugin.diaryOperations.deleteEntry(entry.file);
					this.expandedPath = null;
				},
			}).open();
		});
	}

	private openNewEntryModal() {
		new DiaryEntryModal(this.app, null, async (title, date) => {
			const file = await this.plugin.diaryOperations.createEntry(
				title,
				date
			);
			this.expandedPath = file.path;
		}).open();
	}
}
