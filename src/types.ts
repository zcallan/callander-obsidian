import { TFile } from "obsidian";
import type { IdeaCategory } from "./constants";

export interface FriendTrackerSettings {
	contactsFolder: string;
	diaryFolder: string;
	defaultSortColumn: keyof Omit<ContactWithCountdown, "file">;
	defaultSortDirection: "asc" | "desc";
	relationshipTypes: string[];
	defaultActiveTab: "notes" | "events" | "ideas" | "markdown";
	belatedBirthdayDays: number;
	showBirthdayReminders: boolean;
	birthdayReminderDays: number;
	showMetColumn: boolean;
	showIdeasColumn: boolean;
	openContactsInCallanderView: boolean;
	lastBirthdayNoticeDate: string;
}

export interface Contact {
	name: string;
	birthday: string;
	relationship: string;
	age: number | null;
	file: TFile;
}

export interface ContactWithCountdown extends Contact {
	formattedBirthday: string;
	daysUntilBirthday: number | null;
	daysSinceBirthday: number | null;
	lastInteraction: string | null;
	met: string;
	openIdeas: number;
	/** The birthday occurrence (YYYY-MM-DD) already wished, if any */
	birthdayWished: string;
	/** displayName if set, otherwise name — what the UI should show */
	displayName: string;
	groups: string[];
	ideas: Idea[];
	events: FriendEvent[];
}

export interface GroupInfo {
	/** Normalized (lowercase) group id */
	name: string;
	/** The group's page in Groups/, if it has been created */
	file: TFile | null;
	color: string | null;
}

export interface SortConfig {
	column: keyof Omit<ContactWithCountdown, "file">;
	direction: "asc" | "desc";
}

/**
 * Something that happened: a meetup, a life event of theirs, a memorable
 * outing. The date is a flex string — "2026-05-12", "2026-05", or "2026" —
 * because you often only remember roughly when.
 */
export interface FriendEvent {
	date: string;
	text: string;
	/** Path of the diary entry this event was logged from, if any —
	 * used to update instead of duplicate when re-logging */
	source?: string;
}

export interface Idea {
	category: IdeaCategory;
	text: string;
	done: boolean;
	/** Optional flex date — the dashboard resurfaces the idea from then on */
	resurface?: string;
}

export interface DiaryEntry {
	file: TFile;
	title: string;
	date: string; // the date the entry is ABOUT (YYYY-MM-DD)
	created: string; // when it was written (YYYY-MM-DD)
	body: string; // markdown body (without frontmatter)
}

export const DEFAULT_SETTINGS: FriendTrackerSettings = {
	contactsFolder: "FriendTracker",
	diaryFolder: "FriendTracker/Diary",
	defaultSortColumn: "daysUntilBirthday",
	defaultSortDirection: "asc",
	relationshipTypes: ["family", "friend", "colleague", "pet"],
	defaultActiveTab: "notes",
	belatedBirthdayDays: 14,
	showBirthdayReminders: true,
	birthdayReminderDays: 7,
	showMetColumn: false,
	showIdeasColumn: true,
	openContactsInCallanderView: true,
	lastBirthdayNoticeDate: "",
};
