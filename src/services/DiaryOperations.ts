import { TFile, TFolder, normalizePath, parseYaml } from "obsidian";
import type FriendTracker from "@/main";
import type { DiaryEntry } from "@/types";
import { fieldText, isRecord } from "@/utils/fm";
import { todayISO } from "@/utils/flexdate";
import { ILLEGAL_FILENAME_CHARS } from "@/utils/fileName";
import { markdownFilesIn, uniqueNotePath } from "@/services/vaultFiles";

export class DiaryOperations {
	constructor(private plugin: FriendTracker) {}

	private get app() {
		return this.plugin.app;
	}

	getDiaryFolderPath(): string {
		return normalizePath(this.plugin.settings.diaryFolder);
	}

	async ensureDiaryFolder(): Promise<TFolder> {
		const path = this.getDiaryFolderPath();
		const existing = this.app.vault.getFolderByPath(path);
		if (existing) return existing;
		await this.app.vault.createFolder(path);
		const created = this.app.vault.getFolderByPath(path);
		if (!created) {
			throw new Error(`Could not create diary folder: ${path}`);
		}
		return created;
	}

	isDiaryFile(path: string): boolean {
		return (
			path.startsWith(this.getDiaryFolderPath() + "/") &&
			path.endsWith(".md")
		);
	}

	async getEntries(): Promise<DiaryEntry[]> {
		const files = markdownFilesIn(this.app, this.getDiaryFolderPath());

		const entries: DiaryEntry[] = [];
		for (const file of files) {
			try {
				const content = await this.app.vault.cachedRead(file);
				const { frontmatter, body } = this.splitContent(content);
				const str = (key: string) => fieldText(frontmatter, key);
				entries.push({
					file,
					title: str("title") || file.basename,
					date: str("date"),
					created: str("created"),
					body,
				});
			} catch (error) {
				console.error(`Error reading diary entry ${file.path}:`, error);
			}
		}

		// Newest "about" date first, then newest created
		entries.sort((a, b) => {
			const dateCompare = (b.date || "").localeCompare(a.date || "");
			if (dateCompare !== 0) return dateCompare;
			return (b.created || "").localeCompare(a.created || "");
		});

		return entries;
	}

	/**
	 * Entry metadata only — straight from the metadata cache, zero file I/O.
	 * Use this when bodies aren't needed (e.g. diary-mention lookups).
	 */
	getEntriesMeta(): Array<{ file: TFile; title: string; date: string }> {
		return markdownFilesIn(this.app, this.getDiaryFolderPath())
			.map((file) => {
				const fm: unknown =
					this.app.metadataCache.getFileCache(file)?.frontmatter;
				return {
					file,
					title: fieldText(fm, "title") || file.basename,
					date: fieldText(fm, "date"),
				};
			})
			.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
	}

	private splitContent(content: string): {
		frontmatter: Record<string, unknown>;
		body: string;
	} {
		const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
		if (!match) return { frontmatter: {}, body: content };
		let frontmatter: Record<string, unknown> = {};
		try {
			const parsed: unknown = parseYaml(match[1]);
			if (isRecord(parsed)) frontmatter = parsed;
		} catch (error) {
			console.error("Error parsing diary frontmatter:", error);
		}
		return { frontmatter, body: content.slice(match[0].length) };
	}

	async createEntry(title: string, date: string): Promise<TFile> {
		await this.ensureDiaryFolder();
		const path = await this.getAvailablePath(date, title);
		const created = todayISO();
		const content = `---\ntitle: ${JSON.stringify(
			title
		)}\ndate: ${date}\ncreated: ${created}\n---\n\n`;
		return await this.app.vault.create(path, content);
	}

	async updateMetadata(
		file: TFile,
		title: string,
		date: string
	): Promise<TFile> {
		await this.app.fileManager.processFrontMatter(
			file,
			(frontmatter: Record<string, unknown>) => {
				frontmatter.title = title;
				frontmatter.date = date;
			}
		);

		// Keep filename in sync with date + title
		const newPath = await this.getAvailablePath(date, title, file.path);
		if (newPath !== file.path) {
			await this.app.fileManager.renameFile(file, newPath);
		}
		return file;
	}

	async deleteEntry(file: TFile): Promise<void> {
		// Respect the user's "deleted files" preference (trash, not permanent)
		await this.app.fileManager.trashFile(file);
	}

	private sanitizeTitle(title: string): string {
		return (
			title
				.replace(ILLEGAL_FILENAME_CHARS, "-")
				.replace(/\s+/g, " ")
				.trim() || "Untitled"
		);
	}

	private async getAvailablePath(
		date: string,
		title: string,
		currentPath?: string
	): Promise<string> {
		const folder = this.getDiaryFolderPath();
		const base = `${date} ${this.sanitizeTitle(title)}`;
		return uniqueNotePath(this.app, folder, base, {
			separator: " ",
			ignorePath: currentPath,
		});
	}
}
