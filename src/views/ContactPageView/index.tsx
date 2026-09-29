import {
	ItemView,
	TFile,
	type ViewStateResult,
	type WorkspaceLeaf,
} from "obsidian";
import type { ReactNode } from "react";
import type FriendTracker from "@/main";
import { applyPageWidth, observePageRoom } from "@/components/pageWidth";
import { EventTimeline } from "@/components/EventTimeline";
import type { EventInfo } from "@/types";
import { IslandSet } from "@/ui/islands";
import { ViewStore } from "@/ui/viewStore";
import { fieldOf } from "@/utils/fm";
import { OwnWrites } from "@/utils/ownWrites";
import { inFolders, registerVaultRefresh } from "@/utils/vaultRefresh";
import type {
	IslandKey,
	PageContext,
	PageUiState,
} from "@/views/ContactPageView/context";
import { ContactPageModel, type PageKind } from "@/views/ContactPageView/model";
import {
	loadAboutDrafts,
	loadModel,
	reloadModel,
} from "@/views/ContactPageView/persistence";
import {
	deleteEvent as removeEvent,
	openEditEventModal as editEvent,
} from "@/views/ContactPageView/actions/person";
import { FieldHelpPopover } from "@/views/ContactPageView/sections/fieldHelp";
import { renderHeader } from "@/views/ContactPageView/sections/header";
import { NotesController } from "@/views/ContactPageView/sections/notes";
import { renderPersonPage } from "@/views/ContactPageView/sections/personPage";
import { renderPlanPage } from "@/views/ContactPageView/sections/planPage";
import { FocusKeeper } from "@/components/activatable";

export const VIEW_TYPE_CONTACT_PAGE = "contact-page-view";

/** Work that arrived while you were typing, held until you stop (whenIdle).
 * A reload covers the other two. */
type DeferredWork = "reload" | "render" | "drafts";

/**
 * A person's, plan's or group's page.
 *
 * This file is the view's lifetime and nothing else: what it listens to,
 * loading a note (persistence.ts), and choosing a layout (sections/). The
 * note on screen is a ContactPageModel, a fresh one per load; handlers
 * (actions/) write through the model they were started on, so a write
 * finishing after the page has moved on lands in the note it was for.
 */
export class ContactPageView extends ItemView implements PageContext {
	public plugin: FriendTracker;
	/** The note on screen; replaced, never edited in place, on each load. */
	model = ContactPageModel.unread();
	/**
	 * Bumped whenever the model has been reloaded or written, so the
	 * islands re-read it at exactly the moments the imperative sections
	 * around them are redrawn. See ViewStore for why this rather than
	 * useVaultVersion.
	 */
	readonly store = new ViewStore();
	readonly ownWrites = new OwnWrites();
	/** Keyboard focus across a redraw — see FocusKeeper. */
	private readonly focusKeeper = new FocusKeeper();
	readonly ui: PageUiState = {
		lastIdeaCategory: "gift",
		lastInterestCategory: "hobbies",
		markdownOpen: false,
		aboutEditing: false,
		pageWide: false,
	};
	/** The one open field-help popover; closed on close. */
	readonly helpPopover = new FieldHelpPopover(
		() => this.containerEl.ownerDocument
	);
	readonly notes: NotesController;
	readonly eventTimeline: EventTimeline;
	/**
	 * React islands, keyed by slot. Created once and kept for the life of
	 * the view — `render()` detaches these hosts and puts them back rather
	 * than remaking them, so React keeps rendering into the same node and
	 * its subscriptions never lapse. Torn down in onClose.
	 */
	private islands = new IslandSet(() => this.plugin);
	/** The note the page is on, or already moving to — set before its load
	 * finishes, which the model on screen only catches up with after. */
	private _file: TFile | null = null;
	/** Counts reads; only the newest one reaches the screen. */
	private loadSeq = 0;
	private closed = false;
	/** What the current render started that has to stop at the next. */
	private redrawCleanups: Array<() => void> = [];
	private deferred: DeferredWork | null = null;
	/** Saves in flight from saveLayoutSetting. */
	private quietSettingSaves = 0;

	constructor(leaf: WorkspaceLeaf, plugin: FriendTracker) {
		super(leaf);
		this.plugin = plugin;
		this.notes = new NotesController(this);
		this.eventTimeline = new EventTimeline(this);
		// Participate in tab history so back/forward arrows work
		this.navigation = true;
	}

	async onOpen() {
		// Once for the life of the view, not per render — it only has to
		// know whether there's room beside the column.
		this.register(observePageRoom(this));

		// This note changed on disk — a sync from another device, an edit
		// in another pane — so the page reloads it, and an edit here can
		// never overwrite fresher data with a stale in-memory copy. Its own
		// writes are told apart exactly (OwnWrites); a guess at their
		// timing used to drop real changes that landed close behind one.
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (!(file instanceof TFile) || file !== this._file) return;
				if (this.ownWrites.isOwn(file)) return;
				this.whenIdle("reload");
			})
		);

		// Everything else the page shows is read from other notes: the
		// timeline from Events/, a person's plans from Plans/, member and
		// group names and colours from People/ and Groups/, the mentions
		// from the diary. Their changes redraw it. The folders are read
		// when an event arrives, not now, so a changed base folder is heard
		// too.
		registerVaultRefresh(this, this.plugin, () => this.whenIdle("render"), {
			scope: (path) => this.drawsFrom(path),
		});
		// Settings are read at render time (the birthday trivia, your name
		// in a plan's head count), so a change redraws the page — except
		// the page's own fold states, which it already shows.
		this.registerEvent(
			this.plugin.events.on("settings-changed", () => {
				if (this.quietSettingSaves > 0) this.store.bump();
				else this.whenIdle("render");
			})
		);
		// Countdowns and "days ago" are counted when the page draws, so the
		// day turning over redraws it too.
		this.registerEvent(
			this.plugin.events.on("day-changed", () => this.whenIdle("render"))
		);

		// This person's drafts are lines in the dashboard note, not in their
		// own file — so a change there (an edit in the note itself, a sync,
		// Claude adding one) has to reach this page by its own route. Only
		// redrawn when what this page shows actually changed, since the
		// dashboard note is written for plenty of unrelated reasons.
		const dashboardChanged = (path: string) => {
			if (path !== this.plugin.contactOperations.getDashboardFilePath()) {
				return;
			}
			if (!this.model.file || this.model.kind === "plan") return;
			this.whenIdle("drafts");
		};
		this.registerEvent(
			this.app.vault.on("modify", (f) => dashboardChanged(f.path))
		);
		this.registerEvent(
			this.app.metadataCache.on(
				"changed",
				(f) => dashboardChanged(f.path)
			)
		);

		// Work held back while you were typing runs once you've stopped:
		// when focus leaves the page, or after a click that didn't land in
		// another field. Not on every focusout — a redraw between mousedown
		// and click would take away the very thing being clicked.
		this.registerDomEvent(this.containerEl, "focusout", (event) => {
			const next = event.relatedTarget;
			if (next instanceof Node && !this.containerEl.contains(next)) {
				this.runDeferred();
			}
		});
		this.registerDomEvent(this.containerEl, "click", () => {
			if (!this.isEditingInView()) this.runDeferred();
		});
	}

	/**
	 * Whether a change at `path` can change what the page draws, besides
	 * its own note and the dashboard's drafts (each handled above).
	 */
	private drawsFrom(path: string): boolean {
		if (path === this._file?.path) return false;
		const { plugin } = this;
		const people = plugin.contactOperations;
		if (path === people.getDashboardFilePath()) return false;
		return (
			plugin.eventOperations.isEventFile(path) ||
			plugin.diaryOperations.isDiaryFile(path) ||
			inFolders(
				plugin.planOperations.getPlansFolderPath(),
				people.getPeopleFolderPath(),
				people.getGroupsFolderPath()
			)(path)
		);
	}

	/** True if an input/textarea inside this view has focus (mid-edit) */
	private isEditingInView(): boolean {
		// The view's own document: in a popout window, the main window's
		// activeElement is never inside this view.
		const active = this.containerEl.ownerDocument
			.activeElement as HTMLElement | null;
		return (
			!!active &&
			this.containerEl.contains(active) &&
			(["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName) ||
				// The native Notes editor, typing mid-sentence.
				active.isContentEditable)
		);
	}

	/**
	 * Do `work` now, or once you've stopped typing. Redrawing under an open
	 * field loses what's in it, and a reload redraws. Held work used to be
	 * dropped; now it waits, and the most thorough of what arrived is what
	 * runs.
	 */
	private whenIdle(work: DeferredWork) {
		if (this.closed) return;
		if (this.isEditingInView()) {
			const onlyRedraw = work === "render" && this.deferred !== "reload";
			this.deferred = onlyRedraw ? "render" : "reload";
			return;
		}
		this.run(work);
	}

	private runDeferred() {
		const work = this.deferred;
		if (!work) return;
		this.deferred = null;
		this.run(work);
	}

	private run(work: DeferredWork) {
		if (work === "reload") void this.reload();
		else if (work === "drafts") void this.refreshDrafts();
		else this.render();
	}

	private async reload() {
		if (this._file) await this.setFile(this._file);
	}

	/** Re-read the drafts about this person, and redraw if they changed. */
	private async refreshDrafts() {
		const model = this.model;
		const before = JSON.stringify(model.aboutDrafts);
		await loadAboutDrafts(this, model);
		const changed = JSON.stringify(model.aboutDrafts) !== before;
		if (model === this.model && changed) this.render();
	}

	/**
	 * A write through `model` has landed. If it was an older model of the
	 * note now on screen — a form left open while the page went to another
	 * note and came back — the model showing may not have it, so the note
	 * is read again. The write went through OwnWrites, so nothing else
	 * would notice.
	 */
	wrote(model: ContactPageModel) {
		if (model === this.model || model.file !== this.model.file) return;
		this.whenIdle("reload");
	}

	getViewType(): string {
		return VIEW_TYPE_CONTACT_PAGE;
	}

	getDisplayText(): string {
		return this._file?.basename || "Contact";
	}

	get file() {
		return this._file;
	}

	async setState(state: unknown, result: ViewStateResult) {
		const filePath = fieldOf(state, "filePath");
		const file =
			typeof filePath === "string"
				? this.app.vault.getFileByPath(filePath)
				: null;
		const fileChanged = !!file && file !== this._file;
		if (file) {
			await this.setFile(file);
		} else if (typeof filePath === "string") {
			// A restored tab for a note that's gone: say so, rather than
			// staying blank.
			this.render();
		}
		// Friend → friend navigation keeps the same view type, and Obsidian
		// only records tab history for same-type navigation when the view
		// reports that its state changed (as FileView does for files).
		if (fileChanged && result) {
			result.history = true;
			// `layout` isn't in the typed API, but same-type navigation only
			// lands in tab history when it's set — keep the write.
			(result as ViewStateResult & { layout?: boolean }).layout = true;
		}
		await super.setState(state, result);
	}

	getState() {
		return {
			type: VIEW_TYPE_CONTACT_PAGE,
			filePath: this._file?.path,
		};
	}

	async setFile(file: TFile) {
		// Before the page moves on, so a held edit is written — and stamped
		// — against the note it was typed in.
		await this.notes.flush();
		this._file = file;
		const loadSeq = ++this.loadSeq;
		const stillWanted = () =>
			!this.closed && this._file === file && this.loadSeq === loadSeq;
		const current = this.model;
		if (current.file === file && current.saved !== null) {
			// The note on screen again: read into the same model.
			const result = await reloadModel(this, current, stillWanted);
			if (result === "done") this.render();
			return;
		}
		const model = await loadModel(this, file, {
			kind: this.kindOf(file),
			stillWanted,
		});
		if (!stillWanted()) return;
		// A different note starts in About's read view.
		this.ui.aboutEditing = false;
		this.model = model;
		this.render();
	}

	/** Which layout a note gets, from the folder it's in. */
	private kindOf(file: TFile): PageKind {
		const { contactOperations, planOperations } = this.plugin;
		if (file.path.startsWith(planOperations.getPlansFolderPath() + "/")) {
			return "plan";
		}
		if (contactOperations.isGroupFile(file.path)) return "group";
		if (contactOperations.isPersonFile(file.path)) return "person";
		return "other";
	}

	async onClose() {
		// Nothing redraws from here on: a load or refresh still in flight
		// would otherwise draw into a closed view.
		this.closed = true;
		// Its dismiss handlers live on the document, so they would
		// outlive this view if the popover were simply left open.
		this.helpPopover.close();
		await this.notes.flush();
		this.disposeRender();
		this.islands.unmountAll();
	}

	island(key: IslandKey, node: ReactNode): HTMLElement {
		return this.islands.host(key, node);
	}

	saveLayoutSetting() {
		// The broadcast fires inside saveSettings, before it resolves, so
		// the count covers it.
		this.quietSettingSaves++;
		void this.plugin
			.saveSettings()
			.finally(() => this.quietSettingSaves--);
	}

	disposeOnRedraw(cleanup: () => void) {
		this.redrawCleanups.push(cleanup);
	}

	private disposeRender() {
		for (const cleanup of this.redrawCleanups.splice(0)) cleanup();
	}

	render() {
		if (this.closed) return;
		// A reload held back while you typed covers this redraw, and must
		// not be lost to it.
		if (this.deferred === "reload") {
			this.deferred = null;
			void this.reload();
			return;
		}
		this.deferred = null;
		this.disposeRender();
		const container = this.contentEl;
		// Anchored into DOM this is about to discard, and its dismiss
		// handlers are on the document — closing first keeps them from
		// pointing at a detached node.
		this.helpPopover.close();
		this.focusKeeper.hold(container);
		container.empty();
		// The imperative DOM above is gone; tell the islands to re-read the
		// data they're about to be re-attached with.
		this.store.bump();

		if (!this.model.data.name) {
			container.createDiv({
				text: "No contact data available",
				cls: "contact-empty-state",
			});
		} else {
			renderHeader(this, container);
			if (this.model.kind === "plan") renderPlanPage(this, container);
			else renderPersonPage(this, container);
		}

		// Wrapped after the fact rather than at each layout's exits.
		// Re-parenting moves the island hosts with everything else; a React
		// root stays attached to its own element, so moving that element
		// doesn't disturb it.
		applyPageWidth(this.contentEl, this.plugin, this.ui.pageWide, () => {
			this.ui.pageWide = true;
			this.render();
		});
		this.focusKeeper.restore(container);
	}

	/** Opened from the timeline (EventTimeline). */
	openEditEventModal(event: EventInfo) {
		editEvent(this, this.model, event);
	}

	/** Deleted from the timeline (EventTimeline). */
	async deleteEvent(event: EventInfo) {
		await removeEvent(this, event);
	}
}
