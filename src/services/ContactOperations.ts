import { Notice, TFile, normalizePath } from "obsidian";
import type { ServiceHost } from "@/services/host";
import type {
	ContactWithCountdown,
	Draft,
	Expense,
	GroupInfo,
	Idea,
} from "@/types";
import { expensesOf } from "@/utils/expenseMath";
import type { IdeaCategory } from "@/constants";
import { parseFlexDate, todayISO } from "@/utils/flexdate";
import { nextBirthdayOccurrence } from "@/utils/friendTimeline";
import { asArray, fieldOf, fieldText, isRecord, toText } from "@/utils/fm";
import {
	joinFrontmatter,
	splitFrontmatter,
} from "@/utils/markdownSection";
import {
	parseIdeasSection,
	upsertIdeasSection,
} from "@/utils/ideasMarkdown";
import {
	draftsOf,
	findDraft,
	fromLegacyDrafts,
	type LedgerDraft,
	mergeLegacyDrafts,
	parseDraftsSection,
	upsertDraftsSection,
} from "@/utils/draftsMarkdown";
import { wholeDaysBetween } from "@/utils/dates";
import { capitalize, formatCount } from "@/utils/text";
import { linkpathOf } from "@/utils/linkField";
import { ensureFolder, markdownFilesIn } from "@/services/vaultFiles";

/** Where the inbox lived before it became the dashboard file's properties. */
const LEGACY_INBOX_BASENAME = "Idea Inbox";

export class ContactOperations {
	constructor(private plugin: ServiceHost) {}

	private get app() {
		return this.plugin.app;
	}

	/**
	 * processFrontMatter that also stamps person files' last-updated date.
	 * The same writers serve group pages and the idea inbox — only files
	 * under People/ get the stamp.
	 */
	private async writeFrontMatter(
		file: TFile,
		fn: (fm: Record<string, unknown>) => void
	): Promise<void> {
		const isPerson = this.isPersonFile(file.path);
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				fn(fm);
				if (isPerson) fm.updated = todayISO();
			}
		);
	}

	// ---- Ideas in the note body ----
	// Ideas live as markdown under `## Ideas` rather than in frontmatter.
	// Every reader and writer goes through the three methods below, so the
	// body stays the single source of truth and no caller has to know where
	// the data physically sits.

	/**
	 * A file's ideas. The body wins once the note has an `## Ideas`
	 * section; until then the frontmatter list still stands in, which is
	 * what makes the migration lazy rather than a vault-wide rewrite.
	 *
	 * Costs one `cachedRead` — cached by Obsidian per file until it
	 * changes, unlike frontmatter which comes free from the metadata cache.
	 */
	async readIdeas(file: TFile): Promise<Idea[]> {
		let body: string;
		try {
			body = splitFrontmatter(await this.app.vault.cachedRead(file)).body;
		} catch {
			return [];
		}
		const fromBody = parseIdeasSection(body);
		if (fromBody !== null) return fromBody;
		return ContactOperations.ideasOf(
			this.app.metadataCache.getFileCache(file)?.frontmatter
		);
	}

	/** Rewrite just the Ideas section, leaving the rest of the note —
	 * frontmatter included — exactly as it was. */
	async writeIdeas(file: TFile, ideas: Idea[]): Promise<void> {
		await this.app.vault.process(file, (content) => {
			const { frontmatter, body } = splitFrontmatter(content);
			return joinFrontmatter(
				frontmatter,
				upsertIdeasSection(body, ideas)
			);
		});
	}

	/**
	 * Add one idea to the end of a file's list, reading that list inside the
	 * same `vault.process` that writes it — so it's the file as it stands at
	 * that moment. Reading first (readIdeas) and writing after lost ideas two
	 * ways: a read that failed came back as no ideas at all, so the write
	 * replaced every idea the friend had with this one, and an idea saved in
	 * between (their open page autosaving) was written over.
	 *
	 * A note with no `## Ideas` yet falls back to its frontmatter list, as
	 * readIdeas does, so none of those are dropped: the stale key is cleared
	 * by the next migrateIdeasToBody, once the body holds them.
	 */
	private async appendIdea(file: TFile, idea: Idea): Promise<void> {
		await this.app.vault.process(file, (content) => {
			const { frontmatter, body } = splitFrontmatter(content);
			const ideas =
				parseIdeasSection(body) ??
				ContactOperations.ideasOf(
					this.app.metadataCache.getFileCache(file)?.frontmatter
				);
			return joinFrontmatter(
				frontmatter,
				upsertIdeasSection(body, [...ideas, idea])
			);
		});
	}

	/**
	 * Move a file's ideas out of frontmatter and into the body, once.
	 *
	 * Ordered so a failure is always recoverable: the body is written
	 * first, and only a successful write clears the frontmatter key. Die in
	 * between and the ideas exist in both places, the body wins on the next
	 * read, and the stale key is cleared then.
	 */
	async migrateIdeasToBody(file: TFile): Promise<void> {
		let content: string;
		try {
			content = await this.app.vault.cachedRead(file);
		} catch {
			return;
		}
		const alreadyMigrated =
			parseIdeasSection(splitFrontmatter(content).body) !== null;
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const stale =
			isRecord(fm) &&
			(fm.ideas !== undefined || fm.giftIdeas !== undefined);

		if (alreadyMigrated) {
			// A previous run may have died between the two writes.
			if (stale) await this.clearFrontmatterIdeas(file);
			return;
		}
		const ideas = ContactOperations.ideasOf(fm);
		if (ideas.length === 0) return;
		await this.writeIdeas(file, ideas);
		await this.clearFrontmatterIdeas(file);
	}

	/** Drop the migrated keys without stamping `updated` — moving a field
	 * between storage formats isn't a user edit. */
	private async clearFrontmatterIdeas(file: TFile): Promise<void> {
		await this.app.fileManager.processFrontMatter(
			file,
			(fm: Record<string, unknown>) => {
				delete fm.ideas;
				delete fm.giftIdeas;
			}
		);
	}

	/** Merge modern + legacy idea keys into one normalized list */
	static ideasOf(metadata: unknown): Idea[] {
		// Modern ideas pass through by reference so extra keys survive edits
		const ideas = asArray(fieldOf(metadata, "ideas")).filter(
			(i): i is Idea => isRecord(i) && typeof i.text === "string"
		);
		const legacy = asArray(fieldOf(metadata, "giftIdeas")).map(
			(g): Idea => {
				const text = fieldOf(g, "text");
				return {
					category: "gift" as const,
					text: text == null ? toText(g) : toText(text),
					done: !!fieldOf(g, "done"),
				};
			}
		);
		return [...ideas, ...legacy];
	}

	static draftsOf = draftsOf;

	// ---- Drafts: a checklist in the dashboard note ----
	// Every draft lives as a task line under `## Drafts` in the dashboard
	// file, a person it's about being a wikilink on the line. Handling one
	// ticks it rather than deleting it, so the note is a record of what was
	// captured. See draftsMarkdown for the format.

	/** Every draft, ticked ones included, in file order. Empty when the
	 * dashboard note doesn't exist yet or has no `## Drafts`. */
	async readDrafts(): Promise<LedgerDraft[]> {
		const file = this.dashboardFile();
		if (!file) return [];
		try {
			const body = splitFrontmatter(
				await this.app.vault.cachedRead(file)
			).body;
			return parseDraftsSection(body) ?? [];
		} catch {
			return [];
		}
	}

	/**
	 * Read-modify-write on the checklist, inside one `process` so what's
	 * changed is the file as it is at that moment rather than a copy read a
	 * while ago. `null` from the callback means nothing to write.
	 */
	private async changeDrafts(
		fn: (drafts: LedgerDraft[]) => LedgerDraft[] | null
	): Promise<boolean> {
		const file = await this.ensureDashboardFile();
		let changed = false;
		await this.app.vault.process(file, (content) => {
			const { frontmatter, body } = splitFrontmatter(content);
			const next = fn(parseDraftsSection(body) ?? []);
			if (next === null) return content;
			changed = true;
			return joinFrontmatter(frontmatter, upsertDraftsSection(body, next));
		});
		return changed;
	}

	/** Capture a raw thought, optionally about someone, for later triage. */
	async addDraft(text: string, about?: TFile | null): Promise<void> {
		const draft: LedgerDraft = {
			text: text.trim(),
			...(about && { person: about.basename }),
			created: todayISO(),
			done: false,
		};
		if (!draft.text) return;
		await this.changeDrafts((list) => [...list, draft]);
	}

	/**
	 * Tick a draft off, stamping the day. It stays in the note: that's the
	 * record. `index` and `text` say which — see findDraft for why both.
	 */
	async completeDraft(index: number, text: string): Promise<void> {
		await this.changeDrafts((list) => {
			const at = findDraft(list, index, text);
			if (at < 0) return null;
			const next = [...list];
			next[at] = { ...next[at], done: true, doneDate: todayISO() };
			return next;
		});
	}

	/**
	 * Reword a draft in place, leaving its date and box as they were.
	 *
	 * `about` reassigns who it's about: a `TFile` links to them, `null`
	 * clears the link, and `undefined` (the default) leaves it as it was —
	 * so a caller that only ever reworded text doesn't have to start
	 * passing its person back in too.
	 */
	async updateDraft(
		index: number,
		text: string,
		newText: string,
		about?: TFile | null
	): Promise<void> {
		const reworded = newText.trim();
		if (!reworded) return;
		await this.changeDrafts((list) => {
			const at = findDraft(list, index, text);
			if (at < 0) return null;
			const next = [...list];
			const { person, ...rest } = next[at];
			next[at] =
				about === undefined
					? { ...next[at], text: reworded }
					: { ...rest, text: reworded, ...(about && { person: about.basename }) };
			return next;
		});
	}

	/** The note a draft is about, or null: no link, or one that leads
	 * nowhere. Resolved the way any wikilink in the dashboard note is. */
	draftAbout(draft: LedgerDraft): TFile | null {
		if (!draft.person) return null;
		const linktext = draft.person.split("|")[0].trim();
		return (
			this.app.metadataCache.getFirstLinkpathDest(
				linktext,
				this.getDashboardFilePath()
			) ?? null
		);
	}

	private migratingDrafts: Promise<number> | null = null;

	/**
	 * Move drafts out of frontmatter — the dashboard note's own, and each
	 * friend's — into the checklist, once. Returns how many it carried.
	 *
	 * Checklist first, keys cleared only on success, like the other moves:
	 * a run that dies in between leaves the drafts in both places, and the
	 * next one recognises the ones already carried (mergeLegacyDrafts)
	 * rather than adding them twice. Safe to run on every start, and on
	 * notes that sync in from a device still writing the old way.
	 *
	 * The old keys go without stamping `updated`: moving a field between
	 * storage formats isn't an edit to the friend.
	 */
	migrateDraftsToDashboard(): Promise<number> {
		// One at a time — the dashboard refreshes on every vault event, and
		// this touches the very files that fire them.
		if (this.migratingDrafts) return this.migratingDrafts;
		const run = this.moveDraftsToChecklist().finally(() => {
			this.migratingDrafts = null;
		});
		this.migratingDrafts = run;
		return run;
	}

	private async moveDraftsToChecklist(): Promise<number> {
		const sources: Array<{
			file: TFile;
			drafts: Draft[];
			about: string | undefined;
		}> = [];
		const collect = (file: TFile, about: string | undefined) => {
			const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
			const drafts = ContactOperations.draftsOf(fm);
			// A key that's there but empty still wants clearing.
			const has = isRecord(fm) && fm.drafts !== undefined;
			if (drafts.length > 0 || has) sources.push({ file, drafts, about });
		};
		const dashboard = this.dashboardFile();
		if (dashboard) collect(dashboard, undefined);
		for (const path of [
			this.getPeopleFolderPath(),
			this.getGroupsFolderPath(),
		]) {
			for (const child of markdownFilesIn(this.app, path)) {
				collect(child, child.basename);
			}
		}
		if (sources.length === 0) return 0;

		// The cache lags a write by a beat, so right after this clears a key
		// it can still show it — and the dashboard, refreshing on that very
		// write, would run this again against a stale picture. Each
		// candidate is checked against the file itself before anything is
		// carried or cleared.
		const live: typeof sources = [];
		for (const source of sources) {
			try {
				const { frontmatter } = splitFrontmatter(
					await this.app.vault.read(source.file)
				);
				if (/^drafts\s*:/m.test(frontmatter ?? "")) live.push(source);
			} catch {
				// Unreadable now; the next run will try again.
			}
		}
		if (live.length === 0) return 0;

		const legacy = live.flatMap((s) =>
			s.drafts.map((d) => ({
				text: d.text,
				created: d.created,
				generated: d.generated,
				person: s.about,
			}))
		);
		if (legacy.length > 0) {
			await this.changeDrafts((list) => {
				const merged = mergeLegacyDrafts(list, fromLegacyDrafts(legacy));
				return merged.length === list.length ? null : merged;
			});
		}
		for (const { file } of live) {
			await this.app.fileManager.processFrontMatter(
				file,
				(fm: Record<string, unknown>) => {
					delete fm.drafts;
				}
			);
		}
		return legacy.length;
	}

	/**
	 * A person's groups, as bare lowercase names.
	 *
	 * Stored as `[[Wikilinks]]` so each one is a real link to its group page
	 * — graph edges, backlinks and rename-safety come free, the same as plan
	 * members. The brackets are stripped on the way in, so everything
	 * downstream keeps comparing bare names and none of the matching had to
	 * learn about links.
	 *
	 * Plain names still read correctly, which is what makes this need no
	 * migration pass: a vault written before this converts itself the next
	 * time each person is saved.
	 */
	static groupsOf(metadata: unknown): string[] {
		const raw = fieldOf(metadata, "groups");
		const list = Array.isArray(raw) ? (raw as unknown[]) : raw ? [raw] : [];
		return [
			...new Set(
				list
					.map((g) => ContactOperations.groupName(String(g)))
					.filter((g) => g.length > 0)
			),
		];
	}

	/**
	 * `"[[Uni friends]]"` or `"Uni friends"` → `"uni friends"`.
	 *
	 * Strips only the outer `[[`/`]]`, wherever it ends — not a capture
	 * group that refuses to cross a `]`. That stricter form used to fall
	 * through to the raw, still-bracketed value for any name containing one
	 * (a group called "Sci-Fi [Book Club]"), which then matched nothing
	 * anywhere else in the app: not the group's own page, not another
	 * member's copy of the same link. Every other wikilink unwrapped in
	 * this codebase already uses this simpler form.
	 */
	static groupName(value: string): string {
		// An aliased link points at the note on the left; the label is only
		// for display and would be the wrong thing to match on.
		return linkpathOf(value.trim()).toLowerCase();
	}

	/**
	 * A group name as it should be stored: a link to its page.
	 *
	 * Uses the pretty form inside the brackets so the link names the file
	 * that exists (`Groups/Uni friends.md`). Obsidian resolves links
	 * case-insensitively either way, but a lowercase link beside a
	 * capitalised note reads like a mistake.
	 */
	static groupLink(name: string, display?: string): string {
		const bare = ContactOperations.groupName(name);
		if (!bare) return "";
		// `display` is the group page's own basename, so the link matches
		// the file rather than a guess. Without it the fallback capitalises
		// the first letter only, which mangles anything multi-word —
		// "run n' chug" became "[[Run n' chug]]" beside a page actually
		// called "Run n' Chug". Obsidian resolves that case-insensitively so
		// it still worked, but it read like a typo and would break the day
		// anything compared link text to a file name.
		const label =
			display?.trim() || capitalize(bare);
		return `[[${label}]]`;
	}

	// ---- Folders ----

	/** Person files live in People/ under the base folder — nothing else
	 * in the base folder (Reminders, Idea Inbox, recaps) is a person. */
	getPeopleFolderPath(): string {
		return normalizePath(`${this.plugin.settings.baseFolder}/People`);
	}

	/** Creates the base and People folders on first use. */
	async ensurePeopleFolder(): Promise<void> {
		const base = normalizePath(this.plugin.settings.baseFolder);
		if (!this.app.vault.getFolderByPath(base)) {
			await this.app.vault.createFolder(base);
		}
		const people = this.getPeopleFolderPath();
		if (!this.app.vault.getFolderByPath(people)) {
			await this.app.vault.createFolder(people);
		}
	}

	// ---- Groups ----

	getGroupsFolderPath(): string {
		return normalizePath(
			`${this.plugin.settings.baseFolder}/Groups`
		);
	}

	/** Anywhere under People/, by path alone: no cache lookup, so a file
	 * not yet indexed still counts. */
	isPersonFile(path: string): boolean {
		return path.startsWith(this.getPeopleFolderPath() + "/");
	}

	/** Anywhere under Groups/, by path alone. */
	isGroupFile(path: string): boolean {
		return path.startsWith(this.getGroupsFolderPath() + "/");
	}

	/** Union of groups used on friends + existing group pages */
	getGroupNames(contacts: ContactWithCountdown[]): string[] {
		const names = new Set<string>();
		contacts.forEach((c) => c.groups.forEach((g) => names.add(g)));
		for (const f of markdownFilesIn(this.app, this.getGroupsFolderPath())) {
			names.add(f.basename.toLowerCase());
		}
		return [...names].sort();
	}

	/**
	 * All known groups: pages in Groups/ (with colors) plus any group
	 * names used on friends that don't have a page yet.
	 */
	getGroupInfos(contacts?: ContactWithCountdown[]): GroupInfo[] {
		const infos = new Map<string, GroupInfo>();
		for (const f of markdownFilesIn(this.app, this.getGroupsFolderPath())) {
			const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
			infos.set(f.basename.toLowerCase(), {
				name: f.basename.toLowerCase(),
				file: f,
				color: fm?.color ? String(fm.color) : null,
			});
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
		return capitalize(name);
	}

	/**
	 * Lowercased group key → the capitalisation its own page uses.
	 *
	 * Groups are keyed lowercase everywhere so membership compares cleanly,
	 * which means the display spelling only survives on the page's file
	 * name. `prettyGroupName` is a lossy stand-in for that — fine for a
	 * single word, wrong for "Run n' Chug" — so anything shown to the
	 * reader, or written into a link, should come from here when a page
	 * exists.
	 *
	 * One folder walk per call, so build it once and reuse it across a loop
	 * rather than asking per chip.
	 */
	groupDisplayNames(): Map<string, string> {
		return new Map(
			this.getGroupInfos().map((info) => [info.name, this.labelOf(info)])
		);
	}

	/** The same spelling, when you already hold the info and need no walk. */
	labelOf(info: GroupInfo): string {
		return info.file ? info.file.basename : this.prettyGroupName(info.name);
	}

	/** One group's display spelling — see groupDisplayNames. */
	groupLabel(name: string): string {
		const key = ContactOperations.groupName(name);
		return this.groupDisplayNames().get(key) ?? this.prettyGroupName(key);
	}

	async setGroupColor(name: string, color: string): Promise<TFile> {
		const file = await this.ensureGroupFile(name);
		await this.writeFrontMatter(file, (fm) => {
				fm.color = color;
			}
		);
		return file;
	}

	/**
	 * A group's own page, found by its key — the page's basename lowercased,
	 * the rule getGroupInfos files pages under. Not rebuilt as a path from
	 * the key: the key is lowercase, so that could only guess the page's
	 * capitalisation, and "BJJ.md" or "Run n' Chug.md" was never found.
	 */
	groupPageOf(name: string): TFile | null {
		const key = ContactOperations.groupName(name);
		return (
			markdownFilesIn(this.app, this.getGroupsFolderPath()).find(
				(f) => f.basename.toLowerCase() === key
			) ?? null
		);
	}

	/**
	 * Rename a group everywhere: its page and every member's frontmatter.
	 *
	 * Refuses a name another group's page already has, before touching
	 * anything — members would otherwise be moved across and then the page
	 * rename fail on the taken name, leaving the job half done.
	 */
	async renameGroup(oldName: string, newName: string): Promise<void> {
		const normalized = newName.trim().toLowerCase();
		if (!normalized || normalized === oldName) return;

		const oldFile = this.groupPageOf(oldName);
		const taken = this.groupPageOf(normalized);
		if (taken && taken !== oldFile) {
			throw new Error(`A group called "${taken.basename}" already exists`);
		}

		// Built once, outside the per-file loop — each call walks the
		// Groups folder. The renamed group's page hasn't moved yet, so its
		// new spelling comes from `newName` rather than the map.
		const display = this.groupDisplayNames();
		display.set(normalized, newName.trim());

		await this.editMembersOf(oldName, (fm, groups) => {
			fm.groups = [
				...new Set(groups.map((g) => (g === oldName ? normalized : g))),
			].map((g) => ContactOperations.groupLink(g, display.get(g)));
		});

		const newPath = normalizePath(
			`${this.getGroupsFolderPath()}/${this.prettyGroupName(
				normalized
			)}.md`
		);
		if (oldFile) {
			await this.writeFrontMatter(oldFile, (fm) => {
					fm.name = this.prettyGroupName(normalized);
				}
			);
			if (oldFile.path !== newPath) {
				await this.app.fileManager.renameFile(oldFile, newPath);
			}
		}
	}

	/** Remove the group from every member and trash its page */
	async deleteGroup(name: string): Promise<void> {
		const display = this.groupDisplayNames();
		await this.editMembersOf(name, (fm, groups) => {
			const kept = groups.filter((g) => g !== name);
			if (kept.length > 0) {
				fm.groups = kept.map((g) =>
					ContactOperations.groupLink(g, display.get(g))
				);
			} else delete fm.groups;
		});
		const file = this.groupPageOf(name);
		if (file) await this.app.fileManager.trashFile(file);
	}

	async addFriendToGroup(file: TFile, group: string): Promise<void> {
		const display = this.groupDisplayNames();
		await this.writeFrontMatter(file, (fm) => {
				fm.groups = [
					...new Set([
						...ContactOperations.groupsOf(fm),
						ContactOperations.groupName(group),
					]),
				].map((g) => ContactOperations.groupLink(g, display.get(g)));
			}
		);
	}

	async removeFriendFromGroup(file: TFile, group: string): Promise<void> {
		const display = this.groupDisplayNames();
		await this.writeFrontMatter(file, (fm) => {
				const groups = ContactOperations.groupsOf(fm).filter(
					(g) => g !== group
				);
				if (groups.length > 0) {
					fm.groups = groups.map((g) =>
						ContactOperations.groupLink(g, display.get(g))
					);
				} else delete fm.groups;
			}
		);
	}

	/**
	 * Edit the frontmatter of each person in `group`, and no one else.
	 *
	 * Members are picked from the metadata cache first: writing every friend's
	 * file stamped them all as updated today and made a sync re-upload the
	 * whole People folder, just to rename one group. The edit is still only
	 * applied if the file, as written, lists the group. A note the cache
	 * hasn't indexed yet can't be ruled out, so it's left to that check.
	 */
	private async editMembersOf(
		group: string,
		edit: (frontmatter: Record<string, unknown>, groups: string[]) => void
	): Promise<void> {
		const people = markdownFilesIn(this.app, this.getPeopleFolderPath());
		for (const file of people) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (
				cache &&
				!ContactOperations.groupsOf(cache.frontmatter).includes(group)
			) {
				continue;
			}
			await this.writeFrontMatter(file, (fm) => {
				const groups = ContactOperations.groupsOf(fm);
				if (groups.includes(group)) edit(fm, groups);
			});
		}
	}

	async ensureGroupFile(name: string): Promise<TFile> {
		const folderPath = this.getGroupsFolderPath();
		await ensureFolder(this.app, folderPath);
		const existing = this.groupPageOf(name);
		if (existing) return existing;
		const pretty = capitalize(name);
		const path = normalizePath(`${folderPath}/${pretty}.md`);
		return await this.app.vault.create(
			path,
			`---\nname: ${JSON.stringify(pretty)}\n---\n`
		);
	}

	// ---- Dashboard file (carries the idea inbox in its properties) ----

	/** The dashboard note, when it exists. */
	private dashboardFile(): TFile | null {
		return this.app.vault.getFileByPath(this.getDashboardFilePath());
	}

	getDashboardFilePath(): string {
		const name =
			this.plugin.settings.dashboardFileName.trim() || "Dashboard";
		return normalizePath(`${this.plugin.settings.baseFolder}/${name}.md`);
	}

	async ensureDashboardFile(): Promise<TFile> {
		const path = this.getDashboardFilePath();
		const existing = this.app.vault.getFileByPath(path);
		if (existing) return existing;
		return await this.app.vault.create(
			path,
			`---\nkind: dashboard\n---\n`
		);
	}

	/** One-time: the old "Idea Inbox.md" becomes the dashboard file. */
	async migrateLegacyInboxFile(): Promise<void> {
		if (this.app.vault.getAbstractFileByPath(this.getDashboardFilePath())) {
			return;
		}
		const legacy = this.app.vault.getFileByPath(
			normalizePath(
				`${this.plugin.settings.baseFolder}/${LEGACY_INBOX_BASENAME}.md`
			)
		);
		if (!legacy) return;
		await this.app.fileManager.renameFile(
			legacy,
			this.getDashboardFilePath()
		);
		const renamed = this.dashboardFile();
		if (renamed) {
			await this.writeFrontMatter(renamed, (fm) => {
				delete fm.name; // was "Idea Inbox" — no longer meaningful
				fm.kind = "dashboard";
			});
		}
	}

	async getInboxIdeas(): Promise<Idea[]> {
		const file = this.dashboardFile();
		if (!file) return [];
		const metadata =
			this.app.metadataCache.getFileCache(file)?.frontmatter;
		return ContactOperations.ideasOf(metadata);
	}

	// ---- Ad-hoc expenses (also on the dashboard file) ----

	/**
	 * One-off shared expenses, kept under `expenses` on the dashboard file —
	 * separate from the `costs` key a trip carries, so the two never collide
	 * if a dashboard note is ever reused for something else.
	 */
	async getExpenses(): Promise<Expense[]> {
		const file = this.dashboardFile();
		if (!file) return [];
		const metadata =
			this.app.metadataCache.getFileCache(file)?.frontmatter;
		return expensesOf(metadata, "expenses");
	}

	/**
	 * Read-modify-write the expense list. Creates the dashboard file if it
	 * isn't there yet, so the first expense doesn't need one to exist, and
	 * drops the key entirely once the last expense goes — an empty list is
	 * noise in a note you might actually open.
	 */
	async writeExpenses(
		mutate: (list: Expense[]) => void
	): Promise<void> {
		const file = await this.ensureDashboardFile();
		await this.writeFrontMatter(file, (fm) => {
			const list = expensesOf(fm, "expenses");
			mutate(list);
			if (list.length > 0) fm.expenses = list;
			else delete fm.expenses;
		});
	}

	/**
	 * File an inbox idea onto a friend.
	 *
	 * Loss-ordered, like every move here: the idea is added to the friend
	 * first and only then taken out of the inbox, so a write that fails in
	 * between leaves it in both places — visible, and fixable — rather than
	 * in neither. The inbox copy is matched by content as well as position,
	 * in case the list moved while the friend's note was being written.
	 */
	async moveInboxIdea(index: number, target: TFile): Promise<Idea | null> {
		const inbox = this.dashboardFile();
		if (!inbox) return null;
		const idea = ContactOperations.ideasOf(
			this.app.metadataCache.getFileCache(inbox)?.frontmatter
		)[index];
		if (!idea) return null;

		// The inbox itself stays in the dashboard's frontmatter — it's a
		// queue, not a person's record — but the friend it lands on keeps
		// its ideas in the body like any other.
		await this.migrateIdeasToBody(target);
		await this.appendIdea(target, idea);
		await this.writeFrontMatter(target, () => undefined);

		const same = (i: Idea) => JSON.stringify(i) === JSON.stringify(idea);
		await this.writeFrontMatter(inbox, (fm) => {
				const ideas = ContactOperations.ideasOf(fm);
				const at =
					ideas[index] && same(ideas[index])
						? index
						: ideas.findIndex(same);
				if (at !== -1) ideas.splice(at, 1);
				delete fm.giftIdeas;
				fm.ideas = ideas;
			}
		);
		return idea;
	}

	/** Record that this year's birthday wish was sent (dashboard "Missed") */
	async markBirthdayWished(file: TFile, occurrence: string): Promise<void> {
		await this.writeFrontMatter(file, (fm) => {
				fm.birthdayWished = occurrence;
			}
		);
	}

	/**
	 * Append an idea to a contact file without needing the contact page to
	 * be open. Migrates the file's ideas into the body first, so a friend
	 * captured against from the dashboard ends up in the same shape as one
	 * edited on their own page.
	 */
	async addIdea(
		file: TFile,
		category: IdeaCategory,
		text: string
	): Promise<void> {
		await this.migrateIdeasToBody(file);
		await this.appendIdea(file, { category, text, done: false });
		// The body write doesn't touch frontmatter, so the person's
		// last-updated stamp has to be set on its own.
		await this.writeFrontMatter(file, () => undefined);
	}

	async getContacts(): Promise<ContactWithCountdown[]> {
		const folder = this.app.vault.getFolderByPath(
			this.getPeopleFolderPath()
		);

		if (!folder) {
			new Notice("Callander People folder not found.");
			return [];
		}

		const files = folder.children.filter(
			(file) => file instanceof TFile
		);
		const contacts: ContactWithCountdown[] = [];

		// Events live as files now — one pass over the Events folder builds
		// everyone's list, instead of resolving links per contact.
		const eventsByPerson =
			this.plugin.eventOperations.eventsByPersonPath();

		for (const file of files) {
			if (!(file instanceof TFile)) continue;

			try {
				// The metadata cache already holds parsed frontmatter —
				// no file I/O (critical on cloud-synced vaults, where a
				// cold read can mean a network download)
				const metadata: unknown =
					this.app.metadataCache.getFileCache(file)?.frontmatter;

				if (isRecord(metadata)) {
					const str = (key: string) => fieldText(metadata, key);

					const events = eventsByPerson.get(file.path) ?? [];

					// Ideas live in the note body, so unlike everything else
					// here they cost a read. Obsidian caches it per file
					// until the file changes — one read per edit, not one
					// per render.
					const ideas = await this.readIdeas(file);
					const openIdeas = ideas.filter((i) => !i.done).length;
					const birthday = str("birthday");

					contacts.push({
						name: str("name") || "Unknown",
						displayName:
							str("displayName") || str("name") || "Unknown",
						shortName: str("shortName"),
						birthday,
						relationship: str("relationship"),
						age: this.calculateAge(birthday),
						daysUntilBirthday:
							this.calculateDaysUntilBirthday(birthday),
						daysSinceBirthday:
							this.calculateDaysSinceBirthday(birthday),
						met: str("met"),
						openIdeas,
						birthdayWished: str("birthdayWished"),
						groups: ContactOperations.groupsOf(metadata),
						ideas,
						events,
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
			parts.push(formatCount(years, "year"));
		}
		if (months > 0) {
			parts.push(formatCount(months, "month"));
		}
		if (parts.length === 0) return "0 months old";
		return parts.join(" ") + " old";
	}

	/**
	 * Days to the next birthday, or null when it isn't known to the day.
	 *
	 * The rule itself lives in `nextBirthdayOccurrence` so the All friends
	 * timeline and this countdown can't drift apart on which day a birthday
	 * next falls — they are the same question asked twice.
	 */
	public calculateDaysUntilBirthday(birthday: string): number | null {
		return nextBirthdayOccurrence(birthday)?.days ?? null;
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

		return wholeDaysBetween(lastBirthday, today);
	}
}
