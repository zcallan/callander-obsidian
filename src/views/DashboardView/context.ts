import type { App, TFile } from "obsidian";
import type { ReactNode } from "react";
import type FriendTracker from "@/main";
import type { DashboardSnapshot } from "@/views/DashboardView/snapshot";
import type { SearchBox } from "@/components/searchBox";

/** The dashboard's two React islands. */
export type DashboardIslandKey = "upcoming" | "expenses";

/**
 * What the dashboard's sections (sections/) reach the page through.
 * DashboardView implements it.
 *
 * A render reads only from here, and never awaits: everything that has to
 * be read from disk is in `data`, gathered before the render started, so
 * two renders can't interleave and leave a section drawn twice.
 */
export interface DashboardContext {
	readonly app: App;
	readonly plugin: FriendTracker;
	/** What this render draws from. */
	readonly data: DashboardSnapshot;
	readonly ui: { searchQuery: string };
	/** The friend search, which keeps its focus across a refresh. */
	readonly searchBox: SearchBox;
	/** Fixed for the life of the view, so a Random someday order doesn't
	 * reshuffle on every refresh. */
	readonly somedaySeed: number;
	openContact(file: TFile): Promise<void>;
	/** The host node for an island, rendering `node` into it once. */
	island(key: DashboardIslandKey, node: ReactNode): HTMLElement;
}
