import type { App, WorkspaceLeaf } from "obsidian";
import type { ReactNode } from "react";
import type CallanderPlugin from "@/main";
import type { IdeaCategory, InterestCategory } from "@/constants";
import type { EventTimeline } from "@/components/EventTimeline";
import type { ViewStore } from "@/ui/viewStore";
import type { OwnWrites } from "@/utils/ownWrites";
import type { ContactPageModel } from "@/views/ContactPageView/model";
import type {
	FieldHelpPopover,
} from "@/views/ContactPageView/sections/fieldHelp";
import type { NotesController } from "@/views/ContactPageView/sections/notes";

/**
 * The page's React islands, one per slot. A typo in a key would silently
 * make a second root, so they're named here once.
 */
export type IslandKey =
	| "plan-drafts"
	| "plan-members"
	| "quick-ideas"
	| "plan-timeline"
	| "accommodation"
	| "bring"
	| "plan-expenses"
	| "group-members"
	| "person-drafts"
	| "ideas"
	| "interests"
	| "life-goals"
	| "fun-facts"
	| "inside-jokes"
	| "quotes"
	| "delete"
	| "notes"
	| "diary-mentions";

/** What the page remembers for as long as it's open, whichever note it's on. */
export interface PageUiState {
	/** The category last picked in Add idea, offered first next time. */
	lastIdeaCategory: IdeaCategory;
	lastInterestCategory: InterestCategory;
	/** The Markdown accordion, collapsed by default. */
	markdownOpen: boolean;
	/**
	 * About in edit mode. Kept here rather than in the section, which is
	 * rebuilt on every render: a refresh while you're filling it in used to
	 * drop you back to the read view.
	 */
	aboutEditing: boolean;
	/** Widened for this view only, until it closes. */
	pageWide: boolean;
}

/**
 * What sections (sections/) and handlers (actions/) reach the page through.
 * ContactPageView implements it; nothing else should need to know about the
 * view itself.
 *
 * Every subscription stays on the view: sections and handlers never
 * register anything, so there's one place that owns the page's lifetime.
 */
export interface PageContext {
	readonly app: App;
	readonly plugin: CallanderPlugin;
	/** Bumped whenever the model changes, so the islands re-read it. */
	readonly store: ViewStore;
	readonly leaf: WorkspaceLeaf;
	readonly containerEl: HTMLElement;
	readonly ui: PageUiState;
	readonly helpPopover: FieldHelpPopover;
	readonly notes: NotesController;
	readonly eventTimeline: EventTimeline;
	/** Every write the page makes to a note goes through this, so the
	 * page can tell its own `modify` events from anyone else's. */
	readonly ownWrites: OwnWrites;
	/**
	 * The note on screen. Read it when it's needed, never keep it: the
	 * page replaces it on every load. A handler that has to stay with one
	 * note is given the model it was started on instead.
	 */
	readonly model: ContactPageModel;
	/** The host node for an island, rendering `node` into it once. */
	island(key: IslandKey, node: ReactNode): HTMLElement;
	/** Redraw the page from the current model. */
	render(): void;
	/**
	 * Save settings after changing one only this page's layout reads — a
	 * section's fold state, already on screen — without the redraw every
	 * other settings change gets. A redraw there would snap the chevron
	 * mid-turn.
	 */
	saveLayoutSetting(): void;
	/** Run `cleanup` before the page next redraws, or when it closes —
	 * for anything a render starts that would otherwise outlive it. */
	disposeOnRedraw(cleanup: () => void): void;
	/**
	 * After a write through `model` lands. If the page has since moved on
	 * to a newer model of the same note, that one is now out of date.
	 */
	wrote(model: ContactPageModel): void;
}
