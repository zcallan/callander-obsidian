import type { TFile } from "obsidian";

export interface DiaryEntry {
	file: TFile;
	title: string;
	date: string; // the date the entry is ABOUT (YYYY-MM-DD)
	created: string; // when it was written (YYYY-MM-DD)
	body: string; // markdown body (without frontmatter)
}
