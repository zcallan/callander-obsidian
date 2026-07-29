import {
	Plugin,
	Notice,
	Platform,
	TFile,
	WorkspaceLeaf,
	ViewState,
} from "obsidian";
import { FriendTrackerSettings, DEFAULT_SETTINGS, SomedayInfo } from "./types";
import { IdeaCategory, formatSomedaySeasons, formatSomedayDays } from "@/constants";
import {
	CaptureTargetModal,
	CaptureTarget,
	ContactSuggestModal,
	QuickIdeaModal,
} from "@/modals/QuickIdeaModal";
import { QuickNoteModal } from "@/modals/QuickNoteModal";
import { PlanItemModal } from "@/modals/PlanItemModal";
import { PlanOperations } from "@/services/PlanOperations";
import { SomedayOperations } from "@/services/SomedayOperations";
import { ReminderOperations } from "@/services/ReminderOperations";
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
import { SomedaysView, VIEW_TYPE_SOMEDAYS } from "@/views/SomedaysView";
import { DiaryEntryModal } from "@/modals/DiaryEntryModal";
import { AddContactModal } from "@/modals/AddContactModal";
import { GlanceModal } from "@/modals/GlanceModal";
import { GroupEventModal } from "@/modals/GroupEventModal";
import { IdeaSearchModal } from "@/modals/IdeaSearchModal";
import { MergeFriendsModal } from "@/modals/MergeFriendsModal";
import { SomedayModal } from "@/modals/SomedayModal";
import { ConvertSomedayModal } from "@/modals/ConvertSomedayModal";
import { ReminderModal } from "@/modals/ReminderModal";
import { parseFlexDate } from "@/utils/flexdate";

export default class FriendTracker extends Plugin {
	settings: FriendTrackerSettings;
	public contactOperations: ContactOperations;
	public diaryOperations: DiaryOperations;
	public planOperations: PlanOperations;
	public somedayOperations: SomedayOperations;
	public reminderOperations: ReminderOperations;
	public lastQuickIdeaCategory: IdeaCategory = "gift";
	private statusBarEl: HTMLElement | null = null;

	async onload() {
		await this.loadSettings();
		this.contactOperations = new ContactOperations(this);
		this.diaryOperations = new DiaryOperations(this);
		this.planOperations = new PlanOperations(this);
		this.somedayOperations = new SomedayOperations(this);
		this.reminderOperations = new ReminderOperations(this);

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
			this.registerView(
				VIEW_TYPE_SOMEDAYS,
				(leaf) => new SomedaysView(leaf, this)
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
			this.addRibbonIcon("sparkles", "Open somedays", () =>
				this.activateSomedays()
			);
			this.addRibbonIcon("bell", "New reminder", () =>
				this.openReminderModal()
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
				id: "open-somedays",
				name: "Open somedays",
				callback: () => this.activateSomedays(),
			});
			this.addCommand({
				id: "add-someday",
				name: "New someday",
				callback: () => this.openSomedayModal(),
			});
			this.addCommand({
				id: "add-reminder",
				name: "New reminder",
				callback: () => this.openReminderModal(),
			});
			this.addCommand({
				id: "quick-note",
				name: "Quick note (draft)",
				callback: () => this.openQuickNote(),
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
						this.logDiaryEntryToTimelines(file);
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
				id: "export-birthday-calendar",
				name: "Export birthday calendar (.ics for Apple Calendar)",
				callback: () => this.exportBirthdayCalendar(),
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

			// Mobile: keep modal inputs visible above the on-screen keyboard
			this.installKeyboardInsetTracking();

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

			// One-time data migration: birthplace values move to the new
			// hometown field (the birthplace field itself remains)
			await this.migrateBirthplaceValues();

			// Check for birthdays after everything is initialized — and
			// keep checking (hourly + on focus) so a Mac waking up with
			// Obsidian in the background still notifies. The once-per-day
			// guard inside makes repeats free.
			await this.checkBirthdays();
			await this.updateStatusBar();
			this.registerInterval(
				window.setInterval(() => this.checkBirthdays(), 60 * 60 * 1000)
			);
			this.registerDomEvent(window, "focus", () =>
				this.checkBirthdays()
			);
		} catch (error) {
			console.error("Callander failed to load:", error);
			new Notice("Callander failed to load: " + error.message);
		}
	}

	// ---- Mobile keyboard handling ----

	/**
	 * iOS: the on-screen keyboard overlays the layout viewport, clipping
	 * the bottom of open modals. Track the keyboard's height into a CSS
	 * variable (used to pad modal content) and scroll the focused input
	 * clear once the keyboard has animated in.
	 */
	private installKeyboardInsetTracking() {
		if (!Platform.isMobile) return;

		const setInset = (px: number) => {
			const value = Math.max(0, Math.round(px));
			document.body.style.setProperty(
				"--callander-keyboard-inset",
				`${value}px`
			);
		};
		const currentInset = () =>
			parseInt(
				document.body.style.getPropertyValue(
					"--callander-keyboard-inset"
				)
			) || 0;

		// Primary: Capacitor's native keyboard events (Obsidian mobile is
		// Capacitor; on iOS the webview often does NOT resize for the
		// keyboard, so visualViewport alone sees nothing)
		const onShow = (event: Event) => {
			const height = Number((event as any)?.keyboardHeight);
			setInset(
				Number.isFinite(height) && height > 0
					? height
					: Math.round(window.innerHeight * 0.42)
			);
		};
		const onHide = () => setInset(0);
		for (const type of ["keyboardWillShow", "keyboardDidShow"]) {
			window.addEventListener(type, onShow);
		}
		for (const type of ["keyboardWillHide", "keyboardDidHide"]) {
			window.addEventListener(type, onHide);
		}
		this.register(() => {
			for (const type of ["keyboardWillShow", "keyboardDidShow"]) {
				window.removeEventListener(type, onShow);
			}
			for (const type of ["keyboardWillHide", "keyboardDidHide"]) {
				window.removeEventListener(type, onHide);
			}
			document.body.style.removeProperty(
				"--callander-keyboard-inset"
			);
		});

		// Secondary: visualViewport, when the webview does resize
		const vv = window.visualViewport;
		if (vv) {
			const update = () => {
				const inset =
					window.innerHeight - vv.height - vv.offsetTop;
				if (inset > 30) setInset(inset);
			};
			vv.addEventListener("resize", update);
			this.register(() =>
				vv.removeEventListener("resize", update)
			);
		}

		// Focus assist + last-resort fallback: if nothing reported a
		// keyboard by the time the animation is done, assume one
		this.registerDomEvent(document, "focusin", (event) => {
			const target = event.target as HTMLElement | null;
			if (
				target &&
				target.closest(".modal") &&
				["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
			) {
				window.setTimeout(() => {
					if (currentInset() < 30) {
						setInset(Math.round(window.innerHeight * 0.42));
					}
					target.scrollIntoView({
						block: "center",
						behavior: "smooth",
					});
				}, 350);
			}
		});

		// Drop the inset when focus leaves modal inputs entirely
		this.registerDomEvent(document, "focusout", () => {
			window.setTimeout(() => {
				const active = document.activeElement as HTMLElement | null;
				const stillTyping =
					active &&
					active.closest(".modal") &&
					["INPUT", "TEXTAREA", "SELECT"].includes(
						active.tagName
					);
				if (!stillTyping) setInset(0);
			}, 150);
		});
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
				plugin.shouldOpenAsSomeday(path)
			) {
				return original.call(
					this,
					{
						...viewState,
						type: VIEW_TYPE_SOMEDAYS,
						state: { focusPath: path },
					},
					eventState
				);
			}
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
					},
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
		// Somedays have their own list view, not a contact page
		if (this.somedayOperations.isSomedayFile(path)) {
			return false;
		}
		// Plans and Groups are Callander pages by construction — don't
		// wait for the metadata cache (freshly created files aren't
		// indexed yet, which would bounce them to the markdown editor)
		if (
			path.startsWith(
				this.planOperations.getPlansFolderPath() + "/"
			) ||
			path.startsWith(
				this.contactOperations.getGroupsFolderPath() + "/"
			)
		) {
			return true;
		}
		// Contacts (and the inbox) are identified by a name frontmatter
		// field — generated notes like recaps don't have one
		const frontmatter =
			this.app.metadataCache.getCache(path)?.frontmatter;
		return !!frontmatter && typeof frontmatter.name === "string";
	}

	/** Someday files route to the Somedays list view, not a contact page. */
	private shouldOpenAsSomeday(path: string): boolean {
		if (this.markdownBypass.has(path)) return false;
		return this.somedayOperations.isSomedayFile(path);
	}

	/** Open a contact's underlying note as raw markdown, bypassing the intercept */
	public openPathAsMarkdown(path: string) {
		if (!path) return;
		this.markdownBypass.add(path);
		// The bypass is per-navigation, not permanent
		window.setTimeout(() => this.markdownBypass.delete(path), 1000);
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

	public async activateSomedays(focusPath?: string) {
		await this.activateLeafOfType(
			VIEW_TYPE_SOMEDAYS,
			(v) => v instanceof SomedaysView
		);
		if (focusPath) {
			for (const leaf of this.app.workspace.getLeavesOfType(
				VIEW_TYPE_SOMEDAYS
			)) {
				const view = leaf.view;
				if (view instanceof SomedaysView) {
					await view.setState({ focusPath }, {});
					break;
				}
			}
		}
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
			// Ignore any leftover sidebar-docked copies from the old layout
			if (leaf.getRoot() !== workspace.rootSplit) continue;
			const view = await leaf.view;
			if (view instanceof FriendTrackerView) {
				workspace.revealLeaf(leaf);
				return;
			}
		}
		const leaf = workspace.getLeaf(true);
		await leaf.setViewState({
			type: VIEW_TYPE_FRIEND_TRACKER,
			active: true,
		});
		workspace.revealLeaf(leaf);
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

	/** Everywhere an idea can be captured to: friends, groups, the inbox */
	public buildCaptureTargets(
		contacts: import("@/types").ContactWithCountdown[]
	): CaptureTarget[] {
		return [
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
			...this.planOperations
				.getPlans()
				.filter((p) => p.status !== "done")
				.map(
					(p): CaptureTarget => ({
						kind: "plan",
						label: p.name,
						getFile: async () => p.file,
					})
				),
			{
				kind: "inbox",
				label: "📥 Idea inbox (file to a friend later)",
				getFile: () => this.contactOperations.ensureInboxFile(),
			},
		];
	}

	/** Zero-structure capture: text + optional friend, triaged later */
	public async openQuickNote() {
		const contacts = await this.contactOperations.getContacts();
		new QuickNoteModal(this.app, contacts, async (text, contact) => {
			const file = contact
				? contact.file
				: await this.contactOperations.ensureInboxFile();
			await this.contactOperations.addDraft(file, text);
			new Notice(
				contact
					? `✏️ Draft saved for ${contact.displayName}`
					: "✏️ Draft saved — file it from the dashboard"
			);
			if (contact) await this.refreshOpenContactPages(contact.file);
		}).open();
	}

	public async openQuickIdeaCapture() {
		const contacts = await this.contactOperations.getContacts();
		const targets = this.buildCaptureTargets(contacts);

		new CaptureTargetModal(this.app, targets, (target) => {
			// Plans take categorized ideas (activity/food/sightseeing)
			if (target.kind === "plan") {
				new PlanItemModal(
					this.app,
					target.label,
					async (value) => {
						const file = await target.getFile();
						await this.planOperations.addItem(file, value);
						new Notice(`🗺️ Added to ${target.label}`);
						await this.refreshOpenContactPages(file);
					}
				).open();
				return;
			}
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

	/** Create a new Someday, then jump to (and highlight) it on the Somedays page. */
	public openSomedayModal() {
		new SomedayModal(this.app, this, null, async (file) => {
			await this.activateSomedays(file.path);
		}).open();
	}

	/** Promote a Someday into a full Plan, seeding it from the idea's fields. */
	public async convertSomedayToPlan(someday: SomedayInfo) {
		const plan = await this.planOperations.createPlan(
			someday.name,
			someday.date,
			""
		);
		// Sub-ideas become the plan's idea menu
		for (const sub of someday.subIdeas) {
			await this.planOperations.addItem(plan, {
				text: sub.text,
				category: "activity",
				priority: "maybe",
			});
		}
		// Fuzzy fields (timeframe, days, budget, notes) don't fit a plan's
		// concrete model — seed them into the plan's notes as a starting brief.
		const seed: string[] = [];
		const seasonLabel = formatSomedaySeasons(someday.seasons);
		if (seasonLabel) seed.push(`Season: ${seasonLabel}`);
		const daysLabel = formatSomedayDays(someday.days);
		if (daysLabel) seed.push(`Good days: ${daysLabel}`);
		if (someday.cost !== null) seed.push(`Rough budget: ~$${someday.cost}`);
		if (someday.notes) seed.push(someday.notes);
		if (seed.length > 0) {
			await this.app.fileManager.processFrontMatter(plan, (fm) => {
				fm.notes = seed.join("\n");
			});
		}
		// Link the someday to the plan it became — a breadcrumb if kept.
		await this.somedayOperations.markConverted(someday.file, plan.path);

		new ConvertSomedayModal(this.app, someday.name, async (keep) => {
			if (!keep) {
				await this.somedayOperations.deleteSomeday(someday.file);
			}
			await this.openContactPage(plan);
		}).open();
	}

	/** Create a reminder, then refresh any open dashboards. */
	public openReminderModal() {
		new ReminderModal(this.app, this, null, () =>
			this.refreshDashboards()
		).open();
	}

	public refreshDashboards() {
		for (const leaf of this.app.workspace.getLeavesOfType(
			VIEW_TYPE_DASHBOARD
		)) {
			const view = leaf.view;
			if (view instanceof DashboardView) view.refresh();
		}
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

	// ---- Birthday calendar export ----

	/**
	 * Export birthdays as an .ics file covering the next year — one event
	 * per friend with the age they turn in its title, and a 9am alert.
	 * Imported into an iCloud calendar, this gives native notifications
	 * on Mac AND iPhone, even with Obsidian closed.
	 */
	private async exportBirthdayCalendar() {
		const contacts = await this.contactOperations.getContacts();
		const now = new Date();
		const stamp =
			now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
		const pad = (n: number) => String(n).padStart(2, "0");
		const escape = (s: string) =>
			s.replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => "\\" + m);

		const lines: string[] = [
			"BEGIN:VCALENDAR",
			"VERSION:2.0",
			"PRODID:-//Callander//Birthday Calendar//EN",
			"CALSCALE:GREGORIAN",
			"X-WR-CALNAME:Callander Birthdays",
		];

		let eventCount = 0;
		for (const c of contacts) {
			const parsed = parseFlexDate(c.birthday);
			// A calendar event needs a month and a day
			if (!parsed || parsed.month === null || parsed.day === null) {
				continue;
			}
			const uidBase = c.file.basename
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-");

			// The next occurrence only — one year of coverage
			{
				const today = new Date();
				today.setHours(0, 0, 0, 0);
				let year = now.getFullYear();
				let occurrence = new Date(year, parsed.month - 1, parsed.day);
				occurrence.setHours(0, 0, 0, 0);
				if (occurrence < today) {
					year++;
					occurrence = new Date(year, parsed.month - 1, parsed.day);
				}

				const title =
					parsed.year !== null
						? `🎂 ${c.displayName} turns ${year - parsed.year}`
						: `🎂 ${c.displayName}'s birthday`;

				lines.push(
					"BEGIN:VEVENT",
					`UID:callander-${uidBase}-${year}@callander`,
					`DTSTAMP:${stamp}`,
					`DTSTART;VALUE=DATE:${year}${pad(parsed.month)}${pad(
						parsed.day
					)}`,
					`SUMMARY:${escape(title)}`,
					"BEGIN:VALARM",
					"ACTION:DISPLAY",
					`DESCRIPTION:${escape(title)}`,
					"TRIGGER:PT9H",
					"END:VALARM",
					"END:VEVENT"
				);
				eventCount++;
			}
		}
		lines.push("END:VCALENDAR");

		const path = "Callander Birthdays.ics";
		await this.app.vault.adapter.write(path, lines.join("\r\n"));
		new Notice(
			`📅 Saved "${path}" to your vault root (${eventCount} events — everyone's next birthday).\n\nOpen it in Finder and double-click to add to Apple Calendar — pick an iCloud calendar to get iPhone alerts too. Re-run and re-import yearly to top up.`,
			15000
		);
	}

	/**
	 * Export a plan as one all-day calendar block spanning its dates, so the
	 * whole time is reserved in Apple Calendar. The itinerary itself stays in
	 * Callander — this just marks off the days.
	 */
	public async exportPlanCalendar(metadata: any, name: string) {
		const start = parseFlexDate(metadata?.date);
		if (
			!start ||
			start.year === null ||
			start.month === null ||
			start.day === null
		) {
			new Notice(
				"Add an exact start date to export this plan to calendar."
			);
			return;
		}

		const pad = (n: number) => String(n).padStart(2, "0");
		const asDate = (d: Date) =>
			`${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

		// An all-day DTEND is exclusive, so cover through the day after the last.
		const endFlex = parseFlexDate(metadata?.endDate);
		const last =
			endFlex &&
			endFlex.year !== null &&
			endFlex.month !== null &&
			endFlex.day !== null
				? new Date(endFlex.year, endFlex.month - 1, endFlex.day)
				: new Date(start.year, start.month - 1, start.day);
		last.setHours(0, 0, 0, 0);
		const endExclusive = new Date(last);
		endExclusive.setDate(endExclusive.getDate() + 1);

		const now = new Date();
		const stamp =
			now.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
		const escape = (s: string) =>
			s
				.replace(/\\/g, "\\\\")
				.replace(/[,;]/g, (m) => "\\" + m)
				.replace(/\n/g, "\\n");

		const members = PlanOperations.membersOf(metadata);
		const headcount =
			members.length > 0
				? `${members.length} ${
						members.length === 1 ? "person" : "people"
				  }. `
				: "";
		const uidBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

		const lines: string[] = [
			"BEGIN:VCALENDAR",
			"VERSION:2.0",
			"PRODID:-//Callander//Plans//EN",
			"CALSCALE:GREGORIAN",
			"BEGIN:VEVENT",
			`UID:callander-plan-${uidBase}@callander`,
			`DTSTAMP:${stamp}`,
			`DTSTART;VALUE=DATE:${asDate(
				new Date(start.year, start.month - 1, start.day)
			)}`,
			`DTEND;VALUE=DATE:${asDate(endExclusive)}`,
			`SUMMARY:${escape("🗺️ " + name)}`,
			`DESCRIPTION:${escape(
				`${headcount}Open Callander for the itinerary.`
			)}`,
		];
		if (metadata?.location) {
			lines.push(`LOCATION:${escape(String(metadata.location))}`);
		}
		lines.push("END:VEVENT", "END:VCALENDAR");

		const safe =
			name.replace(/[\\/:*?"<>|#^[\]]/g, "-").trim() || "Plan";
		const path = `${safe}.ics`;
		await this.app.vault.adapter.write(path, lines.join("\r\n"));
		new Notice(
			`📅 Saved "${path}" to your vault root.\n\nOpen it (double-click on desktop, or tap on iPhone) and add it to an iCloud calendar to block off the time.`,
			12000
		);
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
		const yearEvents = contacts.flatMap((c) =>
			c.events.filter((e) => parseFlexDate(e.date)?.year === year)
		);
		const hangouts = yearEvents.filter(
			(e) => e.type === "hangout"
		).length;
		const lifeMoments = yearEvents.filter(
			(e) => e.type === "life"
		).length;
		lines.push(
			"",
			`**${totalEvents} events across everyone** — ${hangouts} hangout${
				hangouts === 1 ? "" : "s"
			}, ${lifeMoments} of their life moments witnessed.`,
			""
		);

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
	public async refreshOpenContactPages(file: TFile) {
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

	/**
	 * Existing "birthplace" values were really hometowns — move them to
	 * the new hometown field. Only touches files that need it; birthplace
	 * stays available as a field for genuine birthplaces.
	 */
	private async migrateBirthplaceValues() {
		const folder = this.app.vault.getFolderByPath(
			this.settings.contactsFolder
		);
		if (!folder) return;
		for (const child of folder.children) {
			if (!(child instanceof TFile) || child.extension !== "md") {
				continue;
			}
			const fm = this.app.metadataCache.getFileCache(child)?.frontmatter;
			if (fm?.birthplace && !fm?.hometown) {
				await this.app.fileManager.processFrontMatter(
					child,
					(frontmatter) => {
						if (
							frontmatter.birthplace &&
							!frontmatter.hometown
						) {
							frontmatter.hometown = frontmatter.birthplace;
							delete frontmatter.birthplace;
						}
					}
				);
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

			// Real macOS notification too (Obsidian is Electron) — reaches
			// Notification Center even when Obsidian isn't focused
			if (Platform.isDesktopApp && typeof Notification === "function") {
				try {
					for (const c of todayBirthdays) {
						// On the day itself, age is the age they turn
						const turning =
							c.age !== null ? ` — turning ${c.age}` : "";
						new Notification("Callander", {
							body: `🎂 It's ${c.displayName}'s birthday today${turning}!`,
						});
					}
				} catch (error) {
					console.error("Callander: system notification failed", error);
				}
			}
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
		// "age" sort split into youngest/eldest
		if (data?.friendListSort === "age") {
			data.friendListSort = "youngest";
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
