import { Plugin, Notice, TFile, WorkspaceLeaf, ViewState } from "obsidian";
import { FriendTrackerSettings, DEFAULT_SETTINGS } from "./types";
import { IdeaCategory } from "@/constants";
import {
	CaptureTargetModal,
	CaptureTarget,
	ContactSuggestModal,
	QuickIdeaModal,
} from "@/modals/QuickIdeaModal";
import {
	FriendTrackerView,
	VIEW_TYPE_FRIEND_TRACKER,
} from "./views/FriendTrackerView";
import {
	ContactPageView,
	VIEW_TYPE_CONTACT_PAGE,
} from "@/views/ContactPageView";
import { FriendTrackerSettingTab } from "./views/FriendTrackerView/settings";
import { ContactOperations } from "@/services/ContactOperations";
import { DiaryOperations } from "@/services/DiaryOperations";
import { DiaryView, VIEW_TYPE_DIARY } from "@/views/DiaryView";
import { DashboardView, VIEW_TYPE_DASHBOARD } from "@/views/DashboardView";
import { DiaryEntryModal } from "@/modals/DiaryEntryModal";
import { AddContactModal } from "@/modals/AddContactModal";
import { GlanceModal } from "@/modals/GlanceModal";
import { GroupEventModal } from "@/modals/GroupEventModal";
import { IdeaSearchModal } from "@/modals/IdeaSearchModal";
import { MergeFriendsModal } from "@/modals/MergeFriendsModal";
import { parseFlexDate } from "@/utils/flexdate";

export default class FriendTracker extends Plugin {
	settings: FriendTrackerSettings;
	public contactOperations: ContactOperations;
	public diaryOperations: DiaryOperations;
	private lastQuickIdeaCategory: IdeaCategory = "gift";
	private statusBarEl: HTMLElement | null = null;

	async onload() {
		await this.loadSettings();
		this.contactOperations = new ContactOperations(this);
		this.diaryOperations = new DiaryOperations(this);

		// On mobile, we should wait for layout-ready
		this.app.workspace.onLayoutReady(() => {
			this.initialize();
		});
	}

	private async initialize() {
		try {
			// Register views
			this.registerView(
				VIEW_TYPE_FRIEND_TRACKER,
				(leaf) => new FriendTrackerView(leaf, this)
			);
			this.registerView(
				VIEW_TYPE_CONTACT_PAGE,
				(leaf) => new ContactPageView(leaf, this)
			);
			this.registerView(
				VIEW_TYPE_DIARY,
				(leaf) => new DiaryView(leaf, this)
			);
			this.registerView(
				VIEW_TYPE_DASHBOARD,
				(leaf) => new DashboardView(leaf, this)
			);

			// Ribbon: the dashboard is the front door
			this.addRibbonIcon("heart-handshake", "Open Callander", () =>
				this.activateDashboard()
			);
			this.addRibbonIcon("book-open", "Open diary", () =>
				this.activateDiaryView()
			);
			this.addRibbonIcon("lightbulb", "Add idea for a friend", () =>
				this.openQuickIdeaCapture()
			);

			// Commands
			this.addCommand({
				id: "open-dashboard",
				name: "Open dashboard",
				callback: () => this.activateDashboard(),
			});
			this.addCommand({
				id: "open-friends-table",
				name: "Open all friends",
				callback: () => this.activateFriendTracker(),
			});
			this.addCommand({
				id: "open-diary",
				name: "Open diary",
				callback: () => this.activateDiaryView(),
			});
			this.addCommand({
				id: "new-diary-entry",
				name: "New diary entry",
				callback: () => this.openNewDiaryEntry(),
			});
			this.addCommand({
				id: "add-idea",
				name: "Add idea for a friend",
				callback: () => this.openQuickIdeaCapture(),
			});
			this.addCommand({
				id: "add-friend",
				name: "Add friend",
				callback: () => this.openAddContactModal(),
			});
			this.addCommand({
				id: "log-diary-to-timelines",
				name: "Log diary entry to friends' timelines",
				checkCallback: (checking) => {
					const file = this.app.workspace.getActiveFile();
					const ok =
						!!file && this.diaryOperations.isDiaryFile(file.path);
					if (!checking && ok) {
						this.logDiaryEntryToTimelines(file!);
					}
					return ok;
				},
			});
			this.addCommand({
				id: "glance",
				name: "Before seeing a friend (glance)",
				callback: () => this.openGlance(),
			});
			this.addCommand({
				id: "group-event",
				name: "Log a shared event (several friends)",
				callback: () => this.openGroupEvent(),
			});
			this.addCommand({
				id: "idea-search",
				name: "Search all ideas",
				callback: () => this.openIdeaSearch(),
			});
			this.addCommand({
				id: "year-recap",
				name: "Generate year in friendships",
				callback: () => this.generateYearRecap(),
			});
			this.addCommand({
				id: "merge-friends",
				name: "Merge duplicate friends",
				callback: () => this.openMergeFriends(),
			});

			// Clicking a friend anywhere (file explorer, quick switcher,
			// links, graph) opens their Callander page, not raw markdown
			this.installContactViewIntercept();

			// Diary entries that were logged to timelines stay in sync:
			// later edits to the entry update the derived events
			this.registerEvent(
				this.app.metadataCache.on("changed", (file) => {
					if (this.diaryOperations.isDiaryFile(file.path)) {
						this.scheduleDiarySync(file);
					}
				})
			);
			this.registerEvent(
				this.app.vault.on("rename", (file, oldPath) => {
					if (
						file instanceof TFile &&
						this.diaryOperations.isDiaryFile(file.path)
					) {
						this.contactOperations.retargetDiarySource(
							oldPath,
							file.path
						);
					}
				})
			);

			// Add settings tab
			this.addSettingTab(new FriendTrackerSettingTab(this.app, this));

			this.statusBarEl = this.addStatusBarItem();

			// Check for birthdays after everything is initialized
			await this.checkBirthdays();
			await this.updateStatusBar();
		} catch (error) {
			console.error("Callander failed to load:", error);
			new Notice("Callander failed to load: " + error.message);
		}
	}

	// ---- Contact view intercept ----

	/** Paths temporarily allowed to open as raw markdown (escape hatch) */
	private markdownBypass = new Set<string>();

	private installContactViewIntercept() {
		const plugin = this;
		const original = WorkspaceLeaf.prototype.setViewState;
		WorkspaceLeaf.prototype.setViewState = function (
			viewState: ViewState,
			eventState?: unknown
		) {
			const path = (viewState.state as any)?.file;
			if (
				plugin.settings.openContactsInCallanderView &&
				viewState.type === "markdown" &&
				typeof path === "string" &&
				plugin.shouldOpenAsContact(path)
			) {
				return original.call(
					this,
					{
						...viewState,
						type: VIEW_TYPE_CONTACT_PAGE,
						state: { filePath: path },
					} as ViewState,
					eventState
				);
			}
			return original.call(this, viewState, eventState);
		};
		this.register(() => {
			WorkspaceLeaf.prototype.setViewState = original;
		});
	}

	private shouldOpenAsContact(path: string): boolean {
		if (this.markdownBypass.has(path)) return false;
		const folder = this.settings.contactsFolder + "/";
		if (!path.startsWith(folder) || !path.endsWith(".md")) return false;
		// Diary entries are meant to be edited as plain notes
		if (
			path.startsWith(this.diaryOperations.getDiaryFolderPath() + "/")
		) {
			return false;
		}
		// Contacts (and groups/inbox) are identified by a name frontmatter
		// field — generated notes like recaps don't have one
		const frontmatter =
			this.app.metadataCache.getCache(path)?.frontmatter;
		return !!frontmatter && typeof frontmatter.name === "string";
	}

	/** Open a contact's underlying note as raw markdown, bypassing the intercept */
	public openPathAsMarkdown(path: string) {
		if (!path) return;
		this.markdownBypass.add(path);
		// The bypass is per-navigation, not permanent
		setTimeout(() => this.markdownBypass.delete(path), 1000);
		this.app.workspace.openLinkText(path, "", true);
	}

	// ---- View activation ----

	private async activateLeafOfType(
		type: string,
		existing: (view: unknown) => boolean
	) {
		const workspace = this.app.workspace;
		for (const leaf of workspace.getLeavesOfType(type)) {
			const view = await leaf.view;
			if (existing(view)) {
				workspace.revealLeaf(leaf);
				return;
			}
		}
		const leaf = workspace.getLeaf(true);
		await leaf.setViewState({ type, active: true });
		workspace.revealLeaf(leaf);
	}

	public async activateDashboard() {
		await this.activateLeafOfType(
			VIEW_TYPE_DASHBOARD,
			(v) => v instanceof DashboardView
		);
	}

	public async activateDiaryView() {
		await this.activateLeafOfType(
			VIEW_TYPE_DIARY,
			(v) => v instanceof DiaryView
		);
	}

	public async activateFriendTracker() {
		const workspace = this.app.workspace;
		for (const leaf of workspace.getLeavesOfType(
			VIEW_TYPE_FRIEND_TRACKER
		)) {
			const view = await leaf.view;
			if (view instanceof FriendTrackerView) {
				workspace.revealLeaf(leaf);
				return;
			}
		}
		const leaf = workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({
				type: VIEW_TYPE_FRIEND_TRACKER,
				active: true,
			});
			workspace.revealLeaf(leaf);
		} else {
			new Notice("Could not create Callander view");
		}
	}

	// ---- Quick actions ----

	public openAddContactModal() {
		new AddContactModal(this.app, this).open();
	}

	public openNewDiaryEntry() {
		new DiaryEntryModal(this.app, null, async (title, date) => {
			const file = await this.diaryOperations.createEntry(title, date);
			// Straight into writing: open the new entry for editing
			await this.app.workspace.getLeaf(true).openFile(file);
		}).open();
	}

	public async openQuickIdeaCapture() {
		const contacts = await this.contactOperations.getContacts();
		const targets: CaptureTarget[] = [
			...contacts.map(
				(c): CaptureTarget => ({
					kind: "friend",
					label:
						c.displayName !== c.name
							? `${c.displayName} (${c.name})`
							: c.displayName,
					getFile: async () => c.file,
				})
			),
			...this.contactOperations.getGroupNames(contacts).map(
				(g): CaptureTarget => ({
					kind: "group",
					label: g.charAt(0).toUpperCase() + g.slice(1),
					getFile: () => this.contactOperations.ensureGroupFile(g),
				})
			),
			{
				kind: "inbox",
				label: "📥 Idea inbox (file to a friend later)",
				getFile: () => this.contactOperations.ensureInboxFile(),
			},
		];

		new CaptureTargetModal(this.app, targets, (target) => {
			new QuickIdeaModal(
				this.app,
				target.kind === "inbox" ? "the inbox" : target.label,
				this.lastQuickIdeaCategory,
				async (category, text) => {
					this.lastQuickIdeaCategory = category;
					const file = await target.getFile();
					await this.contactOperations.addIdea(
						file,
						category,
						text
					);
					new Notice(`💡 Saved`);
					await this.refreshOpenContactPages(file);
				}
			).open();
		}).open();
	}

	private diarySyncTimers = new Map<string, number>();

	/** Debounced: editor saves fire on every pause while typing */
	private scheduleDiarySync(file: TFile) {
		const existing = this.diarySyncTimers.get(file.path);
		if (existing) window.clearTimeout(existing);
		this.diarySyncTimers.set(
			file.path,
			window.setTimeout(() => {
				this.diarySyncTimers.delete(file.path);
				this.syncLoggedDiaryEntry(file);
			}, 1500)
		);
	}

	/**
	 * If this diary entry was previously logged to timelines, bring the
	 * derived events back in line: update title/date, add newly mentioned
	 * friends, remove friends no longer mentioned. Entries never logged
	 * are left alone — logging once is the opt-in.
	 */
	private async syncLoggedDiaryEntry(file: TFile) {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache) return; // not indexed yet — don't act on partial data

		const contacts = await this.contactOperations.getContacts();
		const loggedTo = contacts.filter((c) =>
			c.events.some((e) => e.source === file.path)
		);
		if (loggedTo.length === 0) return;

		const fm = cache.frontmatter;
		const date = fm?.date ? String(fm.date) : "";
		const title = fm?.title ? String(fm.title) : file.basename;
		if (!date) return;

		const resolved = this.app.metadataCache.resolvedLinks[file.path] ?? {};
		const mentioned = contacts.filter(
			(c) => (resolved[c.file.path] ?? 0) > 0
		);

		for (const m of mentioned) {
			await this.contactOperations.upsertDiaryEvent(
				m.file,
				file.path,
				date,
				title
			);
			await this.refreshOpenContactPages(m.file);
		}
		// Mentions that were removed from the entry come off the timeline
		const mentionedPaths = new Set(mentioned.map((m) => m.file.path));
		for (const gone of loggedTo) {
			if (!mentionedPaths.has(gone.file.path)) {
				await this.contactOperations.removeDiaryEvent(
					gone.file,
					file.path
				);
				await this.refreshOpenContactPages(gone.file);
			}
		}
	}

	/**
	 * Put a diary entry on the timeline of every friend it [[links]] to:
	 * date = the entry's about-date, text = the entry's title.
	 * Idempotent — re-logging updates the existing events.
	 */
	public async logDiaryEntryToTimelines(file: TFile) {
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		const date = fm?.date ? String(fm.date) : "";
		const title = fm?.title ? String(fm.title) : file.basename;
		if (!date) {
			new Notice("This diary entry has no date yet.");
			return;
		}

		const resolved = this.app.metadataCache.resolvedLinks[file.path] ?? {};
		const contacts = await this.contactOperations.getContacts();
		const mentioned = contacts.filter(
			(c) => (resolved[c.file.path] ?? 0) > 0
		);
		if (mentioned.length === 0) {
			new Notice(
				"No friends linked — mention them with [[Name]] wikilinks first."
			);
			return;
		}

		for (const m of mentioned) {
			await this.contactOperations.upsertDiaryEvent(
				m.file,
				file.path,
				date,
				title
			);
			await this.refreshOpenContactPages(m.file);
		}
		new Notice(
			`🪧 Logged to ${mentioned
				.map((m) => m.displayName)
				.join(", ")}`
		);
	}

	private async openGlance() {
		const contacts = await this.contactOperations.getContacts();
		new ContactSuggestModal(
			this.app,
			contacts,
			(contact) => new GlanceModal(this.app, contact).open(),
			"Who are you about to see?"
		).open();
	}

	private async openGroupEvent() {
		const contacts = await this.contactOperations.getContacts();
		if (contacts.length === 0) {
			new Notice("No friends yet — add one in Callander first.");
			return;
		}
		new GroupEventModal(this.app, this, contacts).open();
	}

	private async openIdeaSearch() {
		const contacts = await this.contactOperations.getContacts();
		new IdeaSearchModal(this.app, contacts, async (hit) => {
			await this.openContactPage(hit.contact.file);
		}).open();
	}

	private async openMergeFriends() {
		const contacts = await this.contactOperations.getContacts();
		if (contacts.length < 2) {
			new Notice("Need at least two friends to merge.");
			return;
		}
		new ContactSuggestModal(
			this.app,
			contacts,
			(keep) => {
				new ContactSuggestModal(
					this.app,
					contacts.filter((c) => c.file.path !== keep.file.path),
					(duplicate) => {
						new MergeFriendsModal(
							this.app,
							keep,
							duplicate,
							async () => {
								await this.contactOperations.mergeFriends(
									keep.file,
									duplicate.file
								);
								new Notice(
									`Merged into ${keep.displayName}`
								);
								await this.refreshOpenContactPages(keep.file);
							}
						).open();
					},
					"Which duplicate should merge into them?"
				).open();
			},
			"Which friend do you want to KEEP?"
		).open();
	}

	public async openContactPage(file: TFile) {
		// Navigate in the active main-area tab, exactly like clicking a
		// link — so "back" returns to wherever you actually came from
		// (dashboard, another friend, a note). The old model of one shared
		// contact tab gave every navigation someone else's history.
		const leaf = this.app.workspace.getLeaf(false);
		if (this.settings.openContactsInCallanderView) {
			// openFile records tab history, and the contact-view intercept
			// swaps the markdown view for the Callander page
			await leaf.openFile(file);
		} else {
			await leaf.setViewState({
				type: VIEW_TYPE_CONTACT_PAGE,
				state: { filePath: file.path },
			});
		}
		this.app.workspace.setActiveLeaf(leaf, { focus: true });
		this.app.workspace.revealLeaf(leaf);
	}

	// ---- Year recap ----

	private async generateYearRecap() {
		const year = new Date().getFullYear();
		const contacts = await this.contactOperations.getContacts();
		const diaryEntries = await this.diaryOperations.getEntries();

		const lines: string[] = [
			`# Your friendships in ${year}`,
			"",
			`*Generated ${new Date().toISOString().split("T")[0]}. Counts, not scores — Callander doesn't grade friendships.*`,
			"",
		];

		const newFriends = contacts.filter(
			(c) => parseFlexDate(c.met)?.year === year
		);
		if (newFriends.length > 0) {
			lines.push(`## New this year`);
			newFriends.forEach((c) => lines.push(`- [[${c.name}]]`));
			lines.push("");
		}

		lines.push(`## Moments logged`);
		let totalEvents = 0;
		for (const c of contacts) {
			const count = c.events.filter(
				(e) => parseFlexDate(e.date)?.year === year
			).length;
			totalEvents += count;
			if (count > 0) {
				lines.push(
					`- [[${c.name}]] — ${count} event${count > 1 ? "s" : ""}`
				);
			}
		}
		lines.push("", `**${totalEvents} events across everyone.**`, "");

		const ideasDone = contacts.reduce(
			(n, c) => n + c.ideas.filter((i) => i.done).length,
			0
		);
		const ideasOpen = contacts.reduce((n, c) => n + c.openIdeas, 0);
		lines.push(
			`## Ideas`,
			`- ${ideasDone} idea${ideasDone === 1 ? "" : "s"} checked off all-time`,
			`- ${ideasOpen} still open — fuel for next year`,
			""
		);

		const diaryCount = diaryEntries.filter((e) =>
			e.date.startsWith(String(year))
		).length;
		lines.push(`## Diary`, `- ${diaryCount} entries about ${year}`, "");

		const path = `${this.settings.contactsFolder}/Callander Recap ${year}.md`;
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, lines.join("\n"));
			await this.app.workspace.getLeaf(true).openFile(existing);
		} else {
			const file = await this.app.vault.create(path, lines.join("\n"));
			await this.app.workspace.getLeaf(true).openFile(file);
		}
	}

	// ---- Refresh helpers ----

	// If this contact's page is open anywhere, reload it so the in-memory
	// copy doesn't go stale (and later overwrite frontmatter changes)
	private async refreshOpenContactPages(file: TFile) {
		const leaves = this.app.workspace.getLeavesOfType(
			VIEW_TYPE_CONTACT_PAGE
		);
		for (const leaf of leaves) {
			const view = await leaf.view;
			if (
				view instanceof ContactPageView &&
				view.file?.path === file.path
			) {
				await view.setFile(file);
			}
		}
	}

	// ---- Reminders ----

	private async checkBirthdays() {
		if (!this.settings.showBirthdayReminders) return;

		// Only remind once per day, however many times the vault is opened
		const today = new Date().toISOString().split("T")[0];
		if (this.settings.lastBirthdayNoticeDate === today) return;
		this.settings.lastBirthdayNoticeDate = today;
		await this.saveSettings();

		const contacts = await this.contactOperations.getContacts();

		const todayBirthdays = contacts.filter(
			(c) => c.daysUntilBirthday === 0
		);
		if (todayBirthdays.length > 0) {
			const names = todayBirthdays.map((c) => c.displayName);
			const lastPerson = names.pop();
			const nameList =
				names.length > 0
					? names.join(", ") + " and " + lastPerson
					: lastPerson;
			new Notice(`🎂 It's ${nameList}'s birthday today!`, 8000);
		}

		// One digest for everything coming up inside the reminder window
		const upcoming = contacts
			.filter(
				(c) =>
					c.daysUntilBirthday !== null &&
					c.daysUntilBirthday >= 1 &&
					c.daysUntilBirthday <= this.settings.birthdayReminderDays
			)
			.sort((a, b) => a.daysUntilBirthday! - b.daysUntilBirthday!);
		if (upcoming.length > 0) {
			const parts = upcoming.map((c) =>
				c.daysUntilBirthday === 1
					? `${c.displayName} tomorrow`
					: `${c.displayName} in ${c.daysUntilBirthday} days`
			);
			new Notice(`🎈 Upcoming birthdays: ${parts.join(" · ")}`, 8000);
		}

		// Met-anniversaries, at recorded precision (exact-day mets only)
		const now = new Date();
		for (const c of contacts) {
			const met = parseFlexDate(c.met);
			if (
				met?.year != null &&
				met.month === now.getMonth() + 1 &&
				met.day === now.getDate()
			) {
				const years = now.getFullYear() - met.year;
				if (years > 0) {
					new Notice(
						`🤝 ${years} year${
							years > 1 ? "s" : ""
						} since you met ${c.displayName} today!`,
						8000
					);
				}
			}
		}
	}

	private async updateStatusBar() {
		if (!this.statusBarEl) return;
		const contacts = await this.contactOperations.getContacts();
		const next = contacts
			.filter(
				(c) =>
					c.daysUntilBirthday !== null &&
					c.daysUntilBirthday <= this.settings.birthdayReminderDays
			)
			.sort((a, b) => a.daysUntilBirthday! - b.daysUntilBirthday!)[0];
		if (next) {
			this.statusBarEl.setText(
				next.daysUntilBirthday === 0
					? `🎂 ${next.displayName} today!`
					: `🎂 ${next.displayName} ${next.daysUntilBirthday}d`
			);
		} else {
			this.statusBarEl.setText("");
		}
	}

	// ---- Settings ----

	async loadSettings() {
		const data = await this.loadData();
		// Legacy tab ids: "gifts" became "ideas", "interactions" became "events"
		if (data?.defaultActiveTab === "gifts") {
			data.defaultActiveTab = "ideas";
		}
		if (data?.defaultActiveTab === "interactions") {
			data.defaultActiveTab = "events";
		}
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async onunload() {
		// Remove the datalist from document.body if it exists
		const datalist = document.getElementById("relationship-types");
		if (datalist) {
			datalist.remove();
		}
	}
}
