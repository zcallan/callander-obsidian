import { Notice, TFile, TFolder, normalizePath, parseYaml } from "obsidian";
import type FriendTracker from "@/main";
import type {
	ContactWithCountdown,
	Draft,
	FriendEvent,
	GroupInfo,
	Idea,
} from "@/types";
import type { EventType, IdeaCategory } from "@/constants";
import { REMINDERS_BASENAME } from "@/constants";
import { parseFlexDate, formatFlexDate } from "@/utils/flexdate";

export const INBOX_BASENAME = "Idea Inbox";

export class ContactOperations {
	constructor(private plugin: FriendTracker) {}

	private get app() {
		return this.plugin.app;
	}

	/** Merge modern + legacy idea keys into one normalized list */
	static ideasOf(metadata: any): Idea[] {
		const ideas: Idea[] = Array.isArray(metadata?.ideas)
			? metadata.ideas.filter((i: any) => i && typeof i.text === "string")
			: [];
		const legacy: Idea[] = Array.isArray(metadata?.giftIdeas)
			? metadata.giftIdeas.map((g: any) => ({
					category: "gift" as const,
					text: g?.text ?? String(g),
					done: !!g?.done,
			  }))
			: [];
		return [...ideas, ...legacy];
	}

	/** Merge modern + legacy event keys into one normalized list */
	static eventsOf(metadata: any): FriendEvent[] {
		const events: FriendEvent[] = Array.isArray(metadata?.events)
			? metadata.events
			: [];
		const legacy: FriendEvent[] = Array.isArray(metadata?.interactions)
			? metadata.interactions
			: [];
		return [...events, ...legacy];
	}

	static draftsOf(metadata: any): Draft[] {
		if (!Array.isArray(metadata?.drafts)) return [];
		return metadata.drafts
			.map((d: any) =>
				typeof d === "string"
					? { text: d, created: "" }
					: { text: d?.text ?? "", created: d?.created ?? "" }
			)
			.filter((d: Draft) => d.text.length > 0);
	}

	/** Capture a raw thought onto a friend (or the inbox) for later triage */
	async addDraft(file: TFile, text: string): Promise<void> {
		const created = new Date().toISOString().split("T")[0];
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			fm.drafts = [
				...ContactOperations.draftsOf(fm),
				{ text, created },
			];
		});
	}

	async removeDraft(file: TFile, index: number): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const drafts = ContactOperations.draftsOf(fm);
			if (index >= 0 && index < drafts.length) {
				drafts.splice(index, 1);
			}
			if (drafts.length > 0) fm.drafts = drafts;
			else delete fm.drafts;
		});
	}

	async getInboxDrafts(): Promise<Draft[]> {
		const file = this.app.vault.getAbstractFileByPath(this.getInboxPath());
		if (!(file instanceof TFile)) return [];
		const metadata =
			this.app.metadataCache.getFileCache(file)?.frontmatter;
		return ContactOperations.draftsOf(metadata);
	}

	static groupsOf(metadata: any): string[] {
		const raw = metadata?.groups;
		const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
		return [
			...new Set(
				list
					.map((g: any) => String(g).trim().toLowerCase())
					.filter((g: string) => g.length > 0)
			),
		];
	}

	// ---- Groups ----

	getGroupsFolderPath(): string {
		return normalizePath(
			`${this.plugin.settings.contactsFolder}/Groups`
		);
	}

	/** Union of groups used on friends + existing group pages */
	getGroupNames(contacts: ContactWithCountdown[]): string[] {
		const names = new Set<string>();
		contacts.forEach((c) => c.groups.forEach((g) => names.add(g)));
		const folder = this.app.vault.getAbstractFileByPath(
			this.getGroupsFolderPath()
		);
		if (folder instanceof TFolder) {
			folder.children.forEach((f) => {
				if (f instanceof TFile && f.extension === "md") {
					names.add(f.basename.toLowerCase());
				}
			});
		}
		return [...names].sort();
	}

	/**
	 * All known groups: pages in Groups/ (with colors) plus any group
	 * names used on friends that don't have a page yet.
	 */
	getGroupInfos(contacts?: ContactWithCountdown[]): GroupInfo[] {
		const infos = new Map<string, GroupInfo>();
		const folder = this.app.vault.getAbstractFileByPath(
			this.getGroupsFolderPath()
		);
		if (folder instanceof TFolder) {
			for (const f of folder.children) {
				if (f instanceof TFile && f.extension === "md") {
					const fm =
						this.app.metadataCache.getFileCache(f)?.frontmatter;
					infos.set(f.basename.toLowerCase(), {
						name: f.basename.toLowerCase(),
						file: f,
						color: fm?.color ? String(fm.color) : null,
					});
				}
			}
		}
		contacts?.forEach((c) =>
			c.groups.forEach((g) => {
				if (!infos.has(g)) {
					infos.set(g, { name: g, file: null, color: null });
				}
			})
		);
		return [...infos.values()].sort((a, b) =>
			a.name.localeCompare(b.name)
		);
	}

	prettyGroupName(name: string): string {
		return name.charAt(0).toUpperCase() + name.slice(1);
	}

	async setGroupColor(name: string, color: string): Promise<TFile> {
		const file = await this.ensureGroupFile(name);
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			fm.color = color;
		});
		return file;
	}

	/** Rename a group everywhere: its page and every member's frontmatter */
	async renameGroup(oldName: string, newName: string): Promise<void> {
		const normalized = newName.trim().toLowerCase();
		if (!normalized || normalized === oldName) return;

		await this.forEachContactFile(async (file, fm) => {
			const groups = ContactOperations.groupsOf(fm);
			if (groups.includes(oldName)) {
				fm.groups = [
					...new Set(
						groups.map((g) => (g === oldName ? normalized : g))
					),
				];
			}
		});

		const oldFile = this.app.vault.getAbstractFileByPath(
			normalizePath(
				`${this.getGroupsFolderPath()}/${this.prettyGroupName(
					oldName
				)}.md`
			)
		);
		const newPath = normalizePath(
			`${this.getGroupsFolderPath()}/${this.prettyGroupName(
				normalized
			)}.md`
		);
		if (oldFile instanceof TFile) {
			await this.app.fileManager.processFrontMatter(oldFile, (fm) => {
				fm.name = this.prettyGroupName(normalized);
			});
			if (oldFile.path !== newPath) {
				await this.app.fileManager.renameFile(oldFile, newPath);
			}
		}
	}

	/** Remove the group from every member and trash its page */
	async deleteGroup(name: string): Promise<void> {
		await this.forEachContactFile(async (file, fm) => {
			const groups = ContactOperations.groupsOf(fm);
			if (groups.includes(name)) {
				fm.groups = groups.filter((g) => g !== name);
				if (fm.groups.length === 0) delete fm.groups;
			}
		});
		const file = this.app.vault.getAbstractFileByPath(
			normalizePath(
				`${this.getGroupsFolderPath()}/${this.prettyGroupName(
					name
				)}.md`
			)
		);
		if (file instanceof TFile) {
			await this.app.fileManager.trashFile(file);
		}
	}

	async addFriendToGroup(file: TFile, group: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			fm.groups = [
				...new Set([...ContactOperations.groupsOf(fm), group]),
			];
		});
	}

	async removeFriendFromGroup(file: TFile, group: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const groups = ContactOperations.groupsOf(fm).filter(
				(g) => g !== group
			);
			if (groups.length > 0) fm.groups = groups;
			else delete fm.groups;
		});
	}

	private async forEachContactFile(
		fn: (file: TFile, frontmatter: any) => Promise<void> | void
	): Promise<void> {
		const folder = this.app.vault.getFolderByPath(
			this.plugin.settings.contactsFolder
		);
		if (!folder) return;
		for (const file of folder.children) {
			if (!(file instanceof TFile) || file.extension !== "md") continue;
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				fn(file, fm);
			});
		}
	}

	async ensureGroupFile(name: string): Promise<TFile> {
		const folderPath = this.getGroupsFolderPath();
		if (!this.app.vault.getAbstractFileByPath(folderPath)) {
			await this.app.vault.createFolder(folderPath);
		}
		const pretty = name.charAt(0).toUpperCase() + name.slice(1);
		const path = normalizePath(`${folderPath}/${pretty}.md`);
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) return existing;
		return await this.app.vault.create(
			path,
			`---\nname: ${JSON.stringify(pretty)}\n---\n`
		);
	}

	// ---- Idea inbox ----

	getInboxPath(): string {
		return normalizePath(
			`${this.plugin.settings.contactsFolder}/${INBOX_BASENAME}.md`
		);
	}

	async ensureInboxFile(): Promise<TFile> {
		const path = this.getInboxPath();
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) return existing;
		return await this.app.vault.create(
			path,
			`---\nname: ${INBOX_BASENAME}\n---\n`
		);
	}

	async getInboxIdeas(): Promise<Idea[]> {
		const file = this.app.vault.getAbstractFileByPath(this.getInboxPath());
		if (!(file instanceof TFile)) return [];
		const metadata =
			this.app.metadataCache.getFileCache(file)?.frontmatter;
		return ContactOperations.ideasOf(metadata);
	}

	/** Move an inbox idea onto a friend (or group) file */
	async moveInboxIdea(index: number, target: TFile): Promise<Idea | null> {
		const inbox = this.app.vault.getAbstractFileByPath(this.getInboxPath());
		if (!(inbox instanceof TFile)) return null;
		let moved: Idea | null = null;
		await this.app.fileManager.processFrontMatter(inbox, (fm) => {
			const ideas = ContactOperations.ideasOf(fm);
			if (index >= 0 && index < ideas.length) {
				moved = ideas.splice(index, 1)[0];
			}
			delete fm.giftIdeas;
			fm.ideas = ideas;
		});
		if (moved) {
			await this.app.fileManager.processFrontMatter(target, (fm) => {
				const ideas = ContactOperations.ideasOf(fm);
				delete fm.giftIdeas;
				fm.ideas = [...ideas, moved];
			});
		}
		return moved;
	}

	// ---- Events ----

	/** Append an event to any file's frontmatter (friend or group) */
	async addEventToFile(
		file: TFile,
		date: string,
		text: string,
		type: EventType = "hangout",
		location?: string
	): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const events = ContactOperations.eventsOf(fm);
			delete fm.interactions;
			fm.events = [
				...events,
				{ date, text, type, ...(location && { location }) },
			];
		});
	}

	/**
	 * Add or update a timeline event that originates from a diary entry.
	 * Keyed by source path, so re-logging updates rather than duplicates.
	 */
	async upsertDiaryEvent(
		file: TFile,
		source: string,
		date: string,
		text: string
	): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const events = ContactOperations.eventsOf(fm);
			const existing = events.findIndex((e) => e.source === source);
			if (existing >= 0) {
				// Update in place; a manually adjusted type is preserved
				events[existing] = { ...events[existing], date, text };
			} else {
				events.push({ date, text, type: "hangout", source });
			}
			delete fm.interactions;
			fm.events = events;
		});
	}

	/** Remove the event that came from a given diary entry, if present */
	async removeDiaryEvent(file: TFile, source: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const events = ContactOperations.eventsOf(fm);
			const kept = events.filter((e) => e.source !== source);
			if (kept.length !== events.length) {
				delete fm.interactions;
				if (kept.length > 0) fm.events = kept;
				else delete fm.events;
			}
		});
	}

	/** Update an event on a friend/group file, matched by deep equality */
	async updateEventInFile(
		file: TFile,
		original: FriendEvent,
		updated: {
			date: string;
			text: string;
			type: EventType;
			location?: string;
			link?: string;
		}
	): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const events = ContactOperations.eventsOf(fm);
			const index = events.findIndex(
				(e) => JSON.stringify(e) === JSON.stringify(original)
			);
			if (index === -1) return;
			events[index] = {
				...events[index],
				date: updated.date,
				text: updated.text,
				type: updated.type,
			};
			if (updated.location) events[index].location = updated.location;
			else delete events[index].location;
			if (updated.link) events[index].link = updated.link;
			else delete events[index].link;
			delete fm.interactions;
			fm.events = events;
		});
	}

	/** Delete an event from a friend/group file, matched by deep equality */
	async deleteEventFromFile(file: TFile, target: FriendEvent): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const events = ContactOperations.eventsOf(fm);
			const kept = events.filter(
				(e) => JSON.stringify(e) !== JSON.stringify(target)
			);
			if (kept.length !== events.length) {
				delete fm.interactions;
				if (kept.length > 0) fm.events = kept;
				else delete fm.events;
			}
		});
	}

	/**
	 * Hide an event from the dashboard's Upcoming section only — the
	 * timeline on the person's page is unaffected. Matched by deep equality.
	 */
	async hideEventFromUpcoming(file: TFile, target: FriendEvent): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			const events = ContactOperations.eventsOf(fm);
			const index = events.findIndex(
				(e) => JSON.stringify(e) === JSON.stringify(target)
			);
			if (index === -1) return;
			events[index] = { ...events[index], hiddenFromUpcoming: true };
			delete fm.interactions;
			fm.events = events;
		});
	}

	/** A diary entry was renamed — keep event source links pointing at it */
	async retargetDiarySource(
		oldPath: string,
		newPath: string
	): Promise<void> {
		await this.forEachContactFile(async (file, fm) => {
			const events = ContactOperations.eventsOf(fm);
			if (events.some((e) => e.source === oldPath)) {
				delete fm.interactions;
				fm.events = events.map((e) =>
					e.source === oldPath ? { ...e, source: newPath } : e
				);
			}
		});
	}

	/** Record that this year's birthday wish was sent (dashboard "Missed") */
	async markBirthdayWished(file: TFile, occurrence: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm) => {
			fm.birthdayWished = occurrence;
		});
	}

	// ---- Merge duplicates ----

	/** Merge `duplicate` into `keep`: fill gaps, concat lists, append body, trash duplicate */
	async mergeFriends(keep: TFile, duplicate: TFile): Promise<void> {
		const dupMeta = await this.readFrontmatter(duplicate);
		const dupContent = await this.app.vault.read(duplicate);
		const dupBody = dupContent
			.replace(/^---\n[\s\S]*?\n---\n?/, "")
			.trim();

		await this.app.fileManager.processFrontMatter(keep, (fm) => {
			// Fill scalar gaps only — the kept friend always wins conflicts
			for (const [key, value] of Object.entries(dupMeta)) {
				if (
					value != null &&
					value !== "" &&
					!Array.isArray(value) &&
					(fm[key] == null || fm[key] === "") &&
					key !== "name"
				) {
					fm[key] = value;
				}
			}
			fm.ideas = [
				...ContactOperations.ideasOf(fm),
				...ContactOperations.ideasOf(dupMeta),
			];
			fm.events = [
				...ContactOperations.eventsOf(fm),
				...ContactOperations.eventsOf(dupMeta),
			];
			delete fm.giftIdeas;
			delete fm.interactions;
			const groups = [
				...ContactOperations.groupsOf(fm),
				...ContactOperations.groupsOf(dupMeta),
			];
			if (groups.length > 0) fm.groups = [...new Set(groups)];
			if (dupMeta.notes) {
				fm.notes = fm.notes
					? `${fm.notes}\n\n${dupMeta.notes}`
					: dupMeta.notes;
			}
		});

		if (dupBody) {
			const keepContent = await this.app.vault.read(keep);
			await this.app.vault.modify(
				keep,
				keepContent.replace(/\s*$/, "") + "\n\n" + dupBody + "\n"
			);
		}

		await this.app.fileManager.trashFile(duplicate);
	}

	private async readFrontmatter(file: TFile): Promise<any> {
		try {
			const content = await this.app.vault.read(file);
			const match = content.match(/^---\n([\s\S]*?)\n---/);
			return match ? parseYaml(match[1]) ?? {} : {};
		} catch {
			return {};
		}
	}

	/**
	 * Append an idea to a contact file's frontmatter without needing the
	 * contact page to be open. Also folds in any legacy giftIdeas.
	 */
	async addIdea(
		file: TFile,
		category: IdeaCategory,
		text: string
	): Promise<void> {
		await this.plugin.app.fileManager.processFrontMatter(
			file,
			(frontmatter) => {
				const ideas: Idea[] = Array.isArray(frontmatter.ideas)
					? frontmatter.ideas
					: [];
				if (Array.isArray(frontmatter.giftIdeas)) {
					ideas.push(
						...frontmatter.giftIdeas.map((g: any) => ({
							category: "gift" as const,
							text: g?.text ?? String(g),
							done: !!g?.done,
						}))
					);
				}
				delete frontmatter.giftIdeas;
				ideas.push({ category, text, done: false });
				frontmatter.ideas = ideas;
			}
		);
	}

	async getContacts(): Promise<ContactWithCountdown[]> {
		const folder = this.plugin.settings.contactsFolder;
		const vault = this.plugin.app.vault;
		const folderPath = vault.getFolderByPath(folder);

		if (!folderPath) {
			new Notice("Callander folder not found.");
			return [];
		}

		const files = folderPath.children.filter(
			(file) => file instanceof TFile
		);
		const contacts: ContactWithCountdown[] = [];

		for (const file of files) {
			if (!(file instanceof TFile)) continue;
			// The idea inbox / reminders store live beside contacts, not friends
			if (
				file.basename === INBOX_BASENAME ||
				file.basename === REMINDERS_BASENAME
			) {
				continue;
			}

			try {
				// The metadata cache already holds parsed frontmatter —
				// no file I/O (critical on cloud-synced vaults, where a
				// cold read can mean a network download)
				const metadata =
					this.app.metadataCache.getFileCache(file)?.frontmatter;

				if (metadata) {

					// Events are stored newest-first; fall back to the legacy
					// interactions key for contacts not yet migrated
					const latest =
						(Array.isArray(metadata.events) &&
							metadata.events[0]) ||
						(Array.isArray(metadata.interactions) &&
							metadata.interactions[0]) ||
						null;
					const lastInteraction = latest
						? this.formatDaysAgo(latest.date)
						: null;

					const ideas = ContactOperations.ideasOf(metadata);
					const openIdeas = ideas.filter((i) => !i.done).length;

					contacts.push({
						name: metadata.name || "Unknown",
						displayName: String(
							metadata.displayName || metadata.name || "Unknown"
						),
						birthday: metadata.birthday || "",
						formattedBirthday: this.formatBirthday(
							metadata.birthday
						),
						relationship: metadata.relationship || "",
						age: this.calculateAge(metadata.birthday),
						daysUntilBirthday: this.calculateDaysUntilBirthday(
							metadata.birthday
						),
						daysSinceBirthday: this.calculateDaysSinceBirthday(
							metadata.birthday
						),
						lastInteraction,
						met: metadata.met ? String(metadata.met) : "",
						openIdeas,
						birthdayWished: metadata.birthdayWished
							? String(metadata.birthdayWished)
							: "",
						groups: ContactOperations.groupsOf(metadata),
						ideas,
						events: ContactOperations.eventsOf(metadata),
						drafts: ContactOperations.draftsOf(metadata),
						file,
					});
				}
			} catch (error) {
				console.error(
					`Error reading contact file ${file.path}:`,
					error
				);
			}
		}

		return contacts;
	}

	private calculateAge(birthday: string): number | null {
		// Age needs at least a year and month ("03-14" has no age)
		const parsed = parseFlexDate(birthday);
		if (!parsed || parsed.year === null || parsed.month === null) {
			return null;
		}

		// Day unknown: exact except during the birth month itself, where we
		// show the age they turn this month
		if (parsed.day === null) {
			const today = new Date();
			let age = today.getFullYear() - parsed.year;
			if (today.getMonth() + 1 < parsed.month) age--;
			return age;
		}

		const birthDate = new Date(parsed.year, parsed.month - 1, parsed.day);
		birthDate.setHours(0, 0, 0, 0);

		const today = new Date();
		today.setHours(0, 0, 0, 0);

		let age = today.getFullYear() - birthDate.getFullYear();
		const monthDiff = today.getMonth() - birthDate.getMonth();

		if (
			monthDiff < 0 ||
			(monthDiff === 0 && today.getDate() < birthDate.getDate())
		) {
			age--;
		}

		return age;
	}

	/** Years + months only, e.g. "66 years 11 months old" */
	public calculateDetailedAge(birthday: string): string {
		const parsed = parseFlexDate(birthday);
		if (!parsed || parsed.year === null || parsed.month === null) {
			return "";
		}

		const today = new Date();
		today.setHours(0, 0, 0, 0);
		let years: number;
		let months: number;

		if (parsed.day === null) {
			// Day unknown: month precision, honest during the birth month
			years = today.getFullYear() - parsed.year;
			months = today.getMonth() + 1 - parsed.month;
			if (months < 0) {
				years--;
				months += 12;
			}
			if (months === 0) {
				return `turns ${years} this month`;
			}
		} else {
			const birthDate = new Date(
				parsed.year,
				parsed.month - 1,
				parsed.day
			);
			birthDate.setHours(0, 0, 0, 0);
			years = today.getFullYear() - birthDate.getFullYear();
			months = today.getMonth() - birthDate.getMonth();
			if (today.getDate() < birthDate.getDate()) months--;
			if (months < 0) {
				years--;
				months += 12;
			}
		}

		const parts = [];
		if (years > 0) {
			parts.push(`${years} ${years === 1 ? "year" : "years"}`);
		}
		if (months > 0) {
			parts.push(`${months} ${months === 1 ? "month" : "months"}`);
		}
		if (parts.length === 0) return "0 months old";
		return parts.join(" ") + " old";
	}

	private formatBirthday(dateStr: string): string {
		if (!dateStr) return "";

		const parsed = parseFlexDate(dateStr);
		if (!parsed || parsed.month === null) {
			return String(dateStr);
		}

		// Month (+ day if known), at recorded precision — no year in the table
		return formatFlexDate({ ...parsed, year: null });
	}

	public calculateDaysUntilBirthday(birthday: string): number | null {
		// Only month + day are needed — works for year-less birthdays too
		const parsed = parseFlexDate(birthday);
		if (!parsed || parsed.month === null || parsed.day === null) {
			return null;
		}

		// Get today at local midnight
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		// Create this year's birthday at local midnight
		const thisYearBirthday = new Date(
			today.getFullYear(),
			parsed.month - 1,
			parsed.day
		);
		thisYearBirthday.setHours(0, 0, 0, 0);

		// If this year's birthday has already passed, use next year's birthday
		if (thisYearBirthday < today) {
			thisYearBirthday.setFullYear(today.getFullYear() + 1);
		}

		// Calculate days difference
		const diffTime = thisYearBirthday.getTime() - today.getTime();
		return Math.round(diffTime / (1000 * 60 * 60 * 24));
	}

	/**
	 * Days since the most recent birthday occurrence (0 = today).
	 * Powers the belated window: "birthday was 5 days ago".
	 */
	public calculateDaysSinceBirthday(birthday: string): number | null {
		const parsed = parseFlexDate(birthday);
		if (!parsed || parsed.month === null || parsed.day === null) {
			return null;
		}

		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const lastBirthday = new Date(
			today.getFullYear(),
			parsed.month - 1,
			parsed.day
		);
		lastBirthday.setHours(0, 0, 0, 0);

		// If this year's occurrence is still ahead, the last one was last year
		if (lastBirthday > today) {
			lastBirthday.setFullYear(today.getFullYear() - 1);
		}

		const diffTime = today.getTime() - lastBirthday.getTime();
		return Math.round(diffTime / (1000 * 60 * 60 * 24));
	}

	private formatDaysAgo(dateStr: string): string {
		const parsed = parseFlexDate(dateStr);
		if (!parsed) return "";

		// Imprecise event dates show at their own precision ("May 2026")
		if (parsed.month === null || parsed.day === null) {
			return formatFlexDate(parsed);
		}

		const date = new Date(parsed.year!, parsed.month - 1, parsed.day);
		const today = new Date();
		const diffTime = today.getTime() - date.getTime();
		const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

		return `${diffDays} days`;
	}
}
