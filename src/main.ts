import {
	Events,
	Plugin,
	Notice,
	Platform,
	TFile,
	normalizePath,
	type Command,
	type View,
	type WorkspaceLeaf,
} from "obsidian";
import {
	FriendTrackerSettings,
	DEFAULT_SETTINGS,
	SomedayInfo,
	EventInfo,
	type ContactWithCountdown,
} from "@/types";
import { asArray, fieldOf, isRecord, toText } from "@/utils/fm";
import { classifyExistingEvent } from "@/utils/eventRow";
import { eventPlanSeed, type EventPlanSeed } from "@/utils/eventToPlan";
import { adoptNotes } from "@/utils/notesMarkdown";
import { joinFrontmatter, splitFrontmatter } from "@/utils/markdownSection";
import {
	IdeaCategory,
	RIBBON_ACTIONS,
	type RibbonActionKey,
} from "@/constants";
import { calendarEventColor, categoryColors } from "@/utils/categoryColor";
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
import { EventOperations } from "@/services/EventOperations";
import { EventMigration } from "@/services/EventMigration";
import {
	FriendTrackerView,
	VIEW_TYPE_FRIEND_TRACKER,
} from "@/views/FriendTrackerView";
import {
	ContactPageView,
	VIEW_TYPE_CONTACT_PAGE,
} from "@/views/ContactPageView";
import { FriendTrackerSettingTab } from "@/views/FriendTrackerView/settings";
import { ContactOperations } from "@/services/ContactOperations";
import { DiaryOperations } from "@/services/DiaryOperations";
import { DiaryView, VIEW_TYPE_DIARY } from "@/views/DiaryView";
import { DashboardView, VIEW_TYPE_DASHBOARD } from "@/views/DashboardView";
import { SomedaysView, VIEW_TYPE_SOMEDAYS } from "@/views/SomedaysView";
import { EventsView, VIEW_TYPE_EVENTS } from "@/views/EventsView";
import { CalendarView, VIEW_TYPE_CALENDAR } from "@/views/CalendarView";
import { PlansView, VIEW_TYPE_PLANS } from "@/views/PlansView";
import { DiaryEntryModal } from "@/modals/DiaryEntryModal";
import { AddContactModal } from "@/modals/AddContactModal";
import { GlanceModal } from "@/modals/GlanceModal";
import { GroupEventModal } from "@/modals/GroupEventModal";
import { IdeaSearchModal } from "@/modals/IdeaSearchModal";
import { SomedayModal } from "@/modals/SomedayModal";
import { ConvertSomedayModal } from "@/modals/ConvertSomedayModal";
import { PlanModal } from "@/modals/PlanModal";
import { EventModal } from "@/modals/EventModal";
import { todayISO } from "@/utils/flexdate";
import { MS_PER_HOUR } from "@/utils/dates";
import { capitalize, formatCount } from "@/utils/text";
import { BIRTHDAY_ICS_PATH, birthdayCalendar } from "@/utils/ics";
import { buildYearRecap } from "@/utils/yearRecap";
import {
	birthdayNotificationBody,
	birthdayStatusLabel,
	birthdaysToday,
	metAnniversaryNotices,
	todayBirthdayNotice,
	upcomingBirthdayDigest,
} from "@/utils/birthdayReminders";
import { type SomedayPlanSeed, somedayPlanSeed } from "@/utils/somedayToPlan";
import { singleFlight } from "@/utils/singleFlight";
import { installKeyboardInsetTracking } from "@/plugin/keyboardInset";
import { installMarkdownIntercept } from "@/plugin/markdownIntercept";
import { type MarkdownRouteRule } from "@/utils/markdownRoute";
import { runStartupTasks } from "@/plugin/startup";
import { runLogged } from "@/utils/async";

/** How long "open as markdown" bypasses the view intercept: one navigation. */
const MARKDOWN_BYPASS_TTL_MS = 1000;
/** A logged diary entry re-syncs its timeline events this long after its
 * last edit. */
const DIARY_SYNC_DEBOUNCE_MS = 1500;
/** Birthdays are re-checked this often while Obsidian stays open. */
const BIRTHDAY_CHECK_INTERVAL_MS = MS_PER_HOUR;
/** Birthday and anniversary reminders stay up long enough to read. */
const REMINDER_NOTICE_MS = 8000;
/** The export notice carries instructions, so it stays longest. */
const EXPORT_NOTICE_MS = 15000;

/** Every Callander view: its type, and how to build one in a leaf. */
const VIEWS: readonly [
	string,
	(leaf: WorkspaceLeaf, plugin: FriendTracker) => View,
][] = [
	[
		VIEW_TYPE_FRIEND_TRACKER,
		(leaf, plugin) => new FriendTrackerView(leaf, plugin),
	],
	[VIEW_TYPE_CONTACT_PAGE, (leaf, plugin) => new ContactPageView(leaf, plugin)],
	[VIEW_TYPE_DIARY, (leaf, plugin) => new DiaryView(leaf, plugin)],
	[VIEW_TYPE_DASHBOARD, (leaf, plugin) => new DashboardView(leaf, plugin)],
	[VIEW_TYPE_SOMEDAYS, (leaf, plugin) => new SomedaysView(leaf, plugin)],
	[VIEW_TYPE_EVENTS, (leaf, plugin) => new EventsView(leaf, plugin)],
	[VIEW_TYPE_CALENDAR, (leaf, plugin) => new CalendarView(leaf, plugin)],
	[VIEW_TYPE_PLANS, (leaf, plugin) => new PlansView(leaf, plugin)],
];

/** How to open a Callander page — see FriendTracker.openHere. */
export interface NavOptions {
	/** In the active tab, with back/forward history, as a link would. */
	here?: boolean;
}

export default class FriendTracker extends Plugin {
	// Assigned in onload, before anything can reach them.
	settings!: FriendTrackerSettings;
	public contactOperations!: ContactOperations;
	public diaryOperations!: DiaryOperations;
	public planOperations!: PlanOperations;
	public somedayOperations!: SomedayOperations;
	public eventOperations!: EventOperations;
	private eventMigration!: EventMigration;
	public lastQuickIdeaCategory: IdeaCategory = "gift";
	private statusBarEl: HTMLElement | null = null;
	/** Every ribbon icon this plugin owns, keyed by its settings key. Added
	 * once and then kept for the life of the plugin — refreshRibbonIcons()
	 * shows and hides them rather than adding and removing them. */
	private ribbonIcons = new Map<RibbonActionKey, HTMLElement>();

	async onload() {
		await this.loadSettings();
		this.contactOperations = new ContactOperations(this);
		this.diaryOperations = new DiaryOperations(this);
		this.planOperations = new PlanOperations(this);
		this.somedayOperations = new SomedayOperations(this);
		this.eventOperations = new EventOperations(this);
		this.eventMigration = new EventMigration(this);

		// On mobile, we should wait for layout-ready
		this.app.workspace.onLayoutReady(() => {
			void this.initialize();
		});
	}

	private async initialize() {
		// Dev installs carry the .hotreload marker in the plugin folder
		// (release installs never do) — surface the build stamp there so
		// it's unambiguous which bundle is actually running on a device.
		void this.app.vault.adapter
			.exists(`${this.manifest.dir ?? ""}/.hotreload`)
			.then((dev) => {
				if (dev) {
					new Notice(`Callander dev build ${__CALLANDER_BUILD__}`);
				}
			});
		try {
			// Register views
			for (const [type, create] of VIEWS) {
				this.registerView(type, (leaf) => create(leaf, this));
			}

			// Ribbon: the dashboard is the front door. Each icon is
			// individually toggleable from settings (Quick actions).
			this.refreshRibbonIcons();

			// Commands
			for (const command of this.commands()) this.addCommand(command);

			// Clicking a friend anywhere (file explorer, quick switcher,
			// links, graph) opens their Callander page, not raw markdown
			this.installContactViewIntercept();

			// Mobile: keep modal inputs visible above the on-screen keyboard
			installKeyboardInsetTracking(this);

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
						void this.eventOperations.retargetDiarySource(
							oldPath,
							file.path
						);
					}
				})
			);

			// Add settings tab
			this.addSettingTab(new FriendTrackerSettingTab(this.app, this));

			this.statusBarEl = this.addStatusBarItem();
		} catch (error) {
			console.error("Callander failed to load:", error);
			const message =
				error instanceof Error ? error.message : String(error);
			new Notice("Callander failed to load: " + message);
			return;
		}

		// Startup work on vault data, each step on its own: one that throws
		// is reported and the rest still run. Steps that must follow one
		// another share a task.
		const failed = await runStartupTasks([
			{
				// One-time data migration: birthplace values move to the new
				// hometown field (the birthplace field itself remains)
				name: "hometown migration",
				run: () => this.migrateBirthplaceValues(),
			},
			{
				name: "someday types migration",
				run: () => this.migrateSomedayTypes(),
			},
			{
				name: "drafts migration",
				run: async () => {
					// The idea inbox's old standalone file becomes the
					// dashboard file
					await this.contactOperations.migrateLegacyInboxFile();

					// Drafts move out of frontmatter into a checklist in the
					// dashboard note. After the inbox move above, which
					// decides which file that is. Re-run when the cache
					// settles, too, so a friend's note syncing in from a
					// device still writing the old way is carried over
					// rather than left behind.
					this.registerEvent(
						this.app.metadataCache.on("resolved", () => {
							runLogged("drafts migration", () =>
								this.contactOperations.migrateDraftsToDashboard()
							);
						})
					);
					await this.contactOperations.migrateDraftsToDashboard();
				},
			},
			{
				name: "events migration",
				run: async () => {
					// The reminders→events merge: move embedded person events
					// and reminder files into Events/. Detection-based, so
					// re-running on every cache settle is a cheap no-op once
					// done — and exactly what catches an old-format file
					// syncing in from a device that hasn't updated yet.
					this.registerEvent(
						this.app.metadataCache.on("resolved", () => {
							runLogged("events migration", () =>
								this.runEventMigration()
							);
						})
					);
					await this.runEventMigration();

					// Classify anything the reminders→events merge just landed
					// (and anything older) as a calendar entry or a person's
					// timeline record — must follow that merge, which creates
					// the files.
					await this.migrateEventVariants();
				},
			},
			{
				name: "birthday reminders",
				run: async () => {
					// Keep checking (hourly + on focus) so a Mac waking up
					// with Obsidian in the background still notifies. The
					// once-per-day guard inside makes repeats free.
					// Registered before the first check, so a failure in it
					// doesn't stop the later ones.
					this.registerInterval(
						window.setInterval(
							() =>
								runLogged("birthday check", () =>
									this.checkBirthdays()
								),
							BIRTHDAY_CHECK_INTERVAL_MS
						)
					);
					this.registerDomEvent(window, "focus", () =>
						runLogged("birthday check", () => this.checkBirthdays())
					);
					await this.checkBirthdays();
					await this.updateStatusBar();
				},
			},
		]);
		if (failed.length > 0) {
			new Notice(
				`Callander: ${formatCount(
					failed.length,
					"startup step"
				)} failed (${failed.join(", ")}) — see the console`
			);
		}
	}

	/** Every command, in the order the palette lists them. The ids are
	 * persisted in people's hotkey settings, so they never change. */
	private commands(): Command[] {
		return [
			{
				id: "open-dashboard",
				name: "Open dashboard",
				callback: () => this.activateDashboard(),
			},
			{
				id: "open-friends-table",
				name: "Open all friends",
				callback: () => this.activateFriendTracker(),
			},
			{
				id: "open-diary",
				name: "Open diary",
				callback: () => this.activateDiaryView(),
			},
			{
				id: "new-diary-entry",
				name: "New diary entry",
				callback: () => this.openNewDiaryEntry(),
			},
			{
				id: "add-idea",
				name: "Add idea for a friend",
				callback: () => this.openQuickIdeaCapture(),
			},
			{
				id: "open-somedays",
				name: "Open somedays",
				callback: () => this.activateSomedays(),
			},
			{
				id: "add-someday",
				name: "New someday",
				callback: () => this.openSomedayModal(),
			},
			{
				id: "open-events",
				name: "Open events",
				callback: () => this.activateEvents(),
			},
			{
				id: "add-event",
				name: "New event",
				callback: () => this.openEventModal(),
			},
			{
				id: "open-plans",
				name: "Open plans",
				callback: () => this.activatePlans(),
			},
			{
				id: "open-calendar",
				name: "Open calendar",
				callback: () => this.activateCalendar(),
			},
			{
				id: "quick-note",
				name: "Quick note (draft)",
				callback: () => this.openQuickNote(),
			},
			{
				id: "add-friend",
				name: "Add friend",
				callback: () => this.openAddContactModal(),
			},
			{
				id: "log-diary-to-timelines",
				name: "Log diary entry to friends' timelines",
				checkCallback: (checking) => {
					const file = this.app.workspace.getActiveFile();
					if (!file || !this.diaryOperations.isDiaryFile(file.path)) {
						return false;
					}
					if (!checking) {
						void this.logDiaryEntryToTimelines(file);
					}
					return true;
				},
			},
			{
				id: "glance",
				name: "Before seeing a friend (glance)",
				callback: () => this.openGlance(),
			},
			{
				id: "group-event",
				name: "Log a shared event (several friends)",
				callback: () => this.openGroupEvent(),
			},
			{
				id: "idea-search",
				name: "Search all ideas",
				callback: () => this.openIdeaSearch(),
			},
			{
				id: "export-birthday-calendar",
				name: "Export birthday calendar (.ics for Apple Calendar)",
				callback: () => this.exportBirthdayCalendar(),
			},
			{
				id: "year-recap",
				name: "Generate year in friendships",
				callback: () => this.generateYearRecap(),
			},
		];
	}

	// ---- Ribbon icons ----

	/** What each ribbon icon actually does — kept apart from RIBBON_ACTIONS'
	 * icon/label metadata since a callback isn't settings-tab data. */
	private ribbonCallbacks(): Record<RibbonActionKey, () => void | Promise<void>> {
		return {
			ribbonDashboard: () => this.activateDashboard(),
			ribbonDiary: () => this.activateDiaryView(),
			ribbonAddIdea: () => this.openQuickIdeaCapture(),
			ribbonSomedays: () => this.activateSomedays(),
			ribbonEvents: () => this.activateEvents(),
			ribbonReminder: () => this.openEventModal(),
		};
	}

	/**
	 * Brings the ribbon in line with the Quick actions settings. Called once
	 * at load, and again whenever one of those toggles changes.
	 *
	 * An icon is added the first time its action is switched on, and from
	 * then on hidden and shown with a class rather than added and removed.
	 * That looks like the long way round, and each half of it is load-bearing.
	 *
	 * `addRibbonIcon` registers an entry in `workspace.leftRibbon.items` and
	 * hands back its element. Detaching that element does not touch the
	 * entry, which goes on holding a `buttonEl` reference to the node we
	 * just took out of the document. The ribbon rebuilds its children from
	 * exactly those references — `setChildrenInPlace(items.map(i =>
	 * i.buttonEl))` — every time anything is added to it or the user
	 * reorders it. So a detached icon is put straight back: turn one action
	 * off and then another on, and the first reappears, because turning the
	 * second on is itself what triggers the rebuild. That is the reported
	 * bug, and it needs no other plugin's involvement to happen.
	 *
	 * Obsidian's own remove path (`removeRibbonAction`, which clears the
	 * entry's `buttonEl` so the rebuild skips it) is not part of the public
	 * API and only runs on unload. A class is: the rebuild's `show()` only
	 * clears an *inline* `display`, so a stylesheet rule survives it, where
	 * `el.hide()` would be undone on the next pass.
	 *
	 * The other half — not adding an icon until its action is first switched
	 * on — is for the phone. `showRibbonMenu` builds the toolbar's ribbon
	 * popup fresh from that same item list, reading each entry's title, icon
	 * and callback and skipping only the ones Obsidian's own ribbon config
	 * has hidden. It never looks at our element, so no class can reach it.
	 * An entry, once added, cannot be taken back out through the public API.
	 * So an action left off since install is never registered at all, and
	 * stays out of that popup.
	 *
	 * What survives is narrow and was already true: an action switched on
	 * and later off keeps its place in the phone's popup, exactly as it did
	 * when this detached the element, since the popup never read the DOM.
	 */
	public refreshRibbonIcons() {
		const callbacks = this.ribbonCallbacks();
		for (const action of RIBBON_ACTIONS) {
			const visible = this.settings[action.key];
			let el = this.ribbonIcons.get(action.key);
			if (!el) {
				// Nothing to hide yet, and registering it would put it in
				// the phone's ribbon popup for good — see above.
				if (!visible) continue;
				el = this.addRibbonIcon(action.icon, action.name, () =>
					void callbacks[action.key]()
				);
				this.ribbonIcons.set(action.key, el);
			}
			el.toggleClass("callander-ribbon-hidden", !visible);
		}
	}

	// ---- Mobile keyboard handling ----

	/**
	 * iOS: the on-screen keyboard overlays the layout viewport, clipping
	 * the bottom of open modals. Track the keyboard's height into a CSS
	 * variable (used to pad2 modal content) and scroll the focused input
	 * clear once the keyboard has animated in.
	 */
	// ---- Contact view intercept ----

	/** Paths temporarily allowed to open as raw markdown (escape hatch) */
	private markdownBypass = new Set<string>();

	private installContactViewIntercept() {
		installMarkdownIntercept(this, () => ({
			enabled: this.settings.openContactsInCallanderView,
			rules: this.markdownRoutes,
		}));
	}

	/** In order: the first rule whose path matches decides the view. */
	private readonly markdownRoutes: readonly MarkdownRouteRule[] = [
		{
			matches: (path) => this.shouldOpenAsDashboard(path),
			type: VIEW_TYPE_DASHBOARD,
			state: () => ({}),
		},
		{
			matches: (path) => this.shouldOpenAsSomeday(path),
			type: VIEW_TYPE_SOMEDAYS,
			state: (path) => ({ focusPath: path }),
		},
		{
			matches: (path) => this.shouldOpenAsEvent(path),
			type: VIEW_TYPE_EVENTS,
			state: (path) => ({ focusPath: path }),
		},
		{
			matches: (path) => this.shouldOpenAsContact(path),
			type: VIEW_TYPE_CONTACT_PAGE,
			state: (path) => ({ filePath: path }),
		},
	];

	public shouldOpenAsContact(path: string): boolean {
		if (this.markdownBypass.has(path)) return false;
		if (!path.endsWith(".md")) return false;
		// Callander pages are identified purely by folder: People/, Plans/
		// and Groups/ under the base folder. Everything else there —
		// Events, the Idea Inbox, recaps, diary entries — is a plain
		// note. No metadata-cache lookup, so freshly created files route
		// correctly before they're indexed.
		return (
			this.contactOperations.isPersonFile(path) ||
			path.startsWith(
				this.planOperations.getPlansFolderPath() + "/"
			) ||
			this.contactOperations.isGroupFile(path)
		);
	}

	/** Someday files route to the Somedays list view, not a contact page. */
	public shouldOpenAsSomeday(path: string): boolean {
		if (this.markdownBypass.has(path)) return false;
		return this.somedayOperations.isSomedayFile(path);
	}

	public shouldOpenAsEvent(path: string): boolean {
		if (this.markdownBypass.has(path)) return false;
		return this.eventOperations.isEventFile(path);
	}

	/** The dashboard file opens the dashboard view, not its raw markdown. */
	public shouldOpenAsDashboard(path: string): boolean {
		if (this.markdownBypass.has(path)) return false;
		return path === this.contactOperations.getDashboardFilePath();
	}

	/** Open a contact's underlying note as raw markdown, bypassing the intercept */
	public openPathAsMarkdown(path: string) {
		if (!path) return;
		this.markdownBypass.add(path);
		// The bypass is per-navigation, not permanent
		window.setTimeout(
			() => this.markdownBypass.delete(path),
			MARKDOWN_BYPASS_TTL_MS
		);
		void this.app.workspace.openLinkText(path, "", true);
	}

	// ---- View activation ----

	private async activateLeafOfType(
		type: string,
		existing: (view: unknown) => boolean
	) {
		const workspace = this.app.workspace;
		for (const leaf of workspace.getLeavesOfType(type)) {
			const view = leaf.view;
			if (existing(view)) {
				await workspace.revealLeaf(leaf);
				return;
			}
		}
		const leaf = workspace.getLeaf(true);
		await leaf.setViewState({ type, active: true });
		await workspace.revealLeaf(leaf);
	}

	/**
	 * Open a Callander page in the active tab, the way following a link
	 * does — so Obsidian's back and forward step between it and the page you
	 * came from. For links inside Callander's own pages; the ribbon and the
	 * commands still reveal an open tab or start a new one, rather than
	 * replacing whatever note you had open.
	 *
	 * Tab history is recorded by Obsidian itself when a tab moves from one
	 * kind of page to another, provided the pages opt into navigation — and
	 * every Callander page does.
	 */
	private async openHere(type: string, state?: Record<string, unknown>) {
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.setViewState({ type, active: true, state });
		await this.app.workspace.revealLeaf(leaf);
	}

	public async activateDashboard(opts: NavOptions = {}) {
		if (opts.here) return this.openHere(VIEW_TYPE_DASHBOARD);
		await this.activateLeafOfType(
			VIEW_TYPE_DASHBOARD,
			(v) => v instanceof DashboardView
		);
	}

	public async activateSomedays(focusPath?: string, opts: NavOptions = {}) {
		if (opts.here) {
			return this.openHere(
				VIEW_TYPE_SOMEDAYS,
				focusPath ? { focusPath } : undefined
			);
		}
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
					await view.setState({ focusPath }, { history: false });
					break;
				}
			}
		}
	}

	public async activateEvents(focusPath?: string, opts: NavOptions = {}) {
		// A fresh page, so its calendar opens on today of its own accord.
		if (opts.here) {
			return this.openHere(
				VIEW_TYPE_EVENTS,
				focusPath ? { focusPath } : undefined
			);
		}
		await this.activateLeafOfType(
			VIEW_TYPE_EVENTS,
			(v) => v instanceof EventsView
		);
		// The Calendar tab opens on today, for the reason activateCalendar
		// gives: a page that's already open is revealed, not rebuilt.
		for (const leaf of this.app.workspace.getLeavesOfType(
			VIEW_TYPE_EVENTS
		)) {
			if (leaf.view instanceof EventsView) leaf.view.goToToday();
		}
		if (focusPath) {
			for (const leaf of this.app.workspace.getLeavesOfType(
				VIEW_TYPE_EVENTS
			)) {
				const view = leaf.view;
				if (view instanceof EventsView) {
					await view.setState({ focusPath }, { history: false });
					break;
				}
			}
		}
	}

	/** The colour an event shows in on the Calendar page — see
	 * calendarEventColor. */
	public calendarColorFor(event: EventInfo): string {
		return calendarEventColor(event, {
			byGroup: this.settings.calendarColorByGroup,
			byCategory: this.settings.calendarCustomCategoryColors,
			byType: this.settings.calendarColorByType,
			custom: this.settings.calendarGroupColors,
			palette: categoryColors(this.eventOperations.getEventCategories()),
		});
	}

	/** Every plan, past and future — see PlansView. */
	public async activatePlans(opts: NavOptions = {}) {
		if (opts.here) return this.openHere(VIEW_TYPE_PLANS);
		await this.activateLeafOfType(
			VIEW_TYPE_PLANS,
			(v) => v instanceof PlansView
		);
	}

	/** The full Calendar page — events, plans and birthdays together. */
	public async activateCalendar(opts: NavOptions = {}) {
		if (opts.here) return this.openHere(VIEW_TYPE_CALENDAR);
		await this.activateLeafOfType(
			VIEW_TYPE_CALENDAR,
			(v) => v instanceof CalendarView
		);
		// An already-open page is revealed rather than rebuilt, and would
		// come back on whatever day it was left on — days ago, on a phone
		// that keeps its tabs alive. Opening the calendar means today.
		for (const leaf of this.app.workspace.getLeavesOfType(
			VIEW_TYPE_CALENDAR
		)) {
			if (leaf.view instanceof CalendarView) leaf.view.goToToday();
		}
	}

	public async activateDiaryView(opts: NavOptions = {}) {
		if (opts.here) return this.openHere(VIEW_TYPE_DIARY);
		await this.activateLeafOfType(
			VIEW_TYPE_DIARY,
			(v) => v instanceof DiaryView
		);
	}

	public async activateFriendTracker(opts: NavOptions = {}) {
		if (opts.here) return this.openHere(VIEW_TYPE_FRIEND_TRACKER);
		const workspace = this.app.workspace;
		for (const leaf of workspace.getLeavesOfType(
			VIEW_TYPE_FRIEND_TRACKER
		)) {
			// Ignore any leftover sidebar-docked copies from the old layout
			if (leaf.getRoot() !== workspace.rootSplit) continue;
			const view = leaf.view;
			if (view instanceof FriendTrackerView) {
				await workspace.revealLeaf(leaf);
				return;
			}
		}
		const leaf = workspace.getLeaf(true);
		await leaf.setViewState({
			type: VIEW_TYPE_FRIEND_TRACKER,
			active: true,
		});
		await workspace.revealLeaf(leaf);
	}

	// ---- Quick actions ----

	/**
	 * This plugin's page in Obsidian's settings. There's no public API for
	 * opening the settings window, so this uses the internal one every
	 * plugin reaches for — checked first, and a notice pointing the way if
	 * it's ever gone.
	 */
	public openPluginSettings() {
		const setting = (
			this.app as unknown as {
				setting?: { open?: () => void; openTabById?: (id: string) => void };
			}
		).setting;
		if (
			typeof setting?.open !== "function" ||
			typeof setting.openTabById !== "function"
		) {
			new Notice("Open Settings → Community plugins → Callander.");
			return;
		}
		setting.open();
		setting.openTabById(this.manifest.id);
	}

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
		contacts: ContactWithCountdown[]
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
					label: capitalize(g),
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
				getFile: () => this.contactOperations.ensureDashboardFile(),
			},
		];
	}

	/** Zero-structure capture: text + optional friend, triaged later */
	public async openQuickNote() {
		const contacts = await this.contactOperations.getContacts();
		new QuickNoteModal(this.app, contacts, async (text, contact) => {
			// Always the dashboard note's checklist; someone it's about is a
			// wikilink on the line rather than the file it's kept in.
			await this.contactOperations.addDraft(text, contact?.file);
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

	/**
	 * Promote a Someday into a full Plan: confirm first (with a mark-done
	 * choice), then open the New plan modal pre-filled. Nothing is created
	 * until that modal's own Create — cancelling leaves the someday alone.
	 */
	public convertSomedayToPlan(someday: SomedayInfo) {
		new ConvertSomedayModal(
			this.app,
			"Make a plan from this someday?",
			someday.name,
			(markDone) => {
				const seed = somedayPlanSeed(someday);
				new PlanModal(
					this.app,
					this,
					(plan) =>
						void this.seedPlanFromSomeday(plan, someday, seed, markDone),
					seed.prefill
				).open();
			}
		).open();
	}

	/** Carry a someday's substance into its freshly created plan. */
	private async seedPlanFromSomeday(
		plan: TFile,
		someday: SomedayInfo,
		{ items, members, brief }: SomedayPlanSeed,
		markDone: boolean
	) {
		// Sub-ideas become the plan's idea menu
		for (const item of items) {
			await this.planOperations.addItem(plan, item);
		}
		if (members) {
			await this.app.fileManager.processFrontMatter(
				plan,
				(fm: Record<string, unknown>) => {
					fm.members = members;
				}
			);
		}
		// Into the body's `## Notes`, where a page's notes live — not a
		// frontmatter `notes` key the plan page would only move there on
		// first open. Ahead of anything a template already put in the body.
		if (brief) {
			await this.app.vault.process(plan, (content) => {
				const { frontmatter, body } = splitFrontmatter(content);
				return joinFrontmatter(frontmatter, adoptNotes(body, brief));
			});
		}
		// Link the someday to the plan it became — a breadcrumb on both ends.
		await this.somedayOperations.markConverted(someday.file, plan.path);
		if (markDone) {
			await this.somedayOperations.setStatus(someday.file, "done");
		}
		await this.openContactPage(plan);
	}

	/**
	 * Grow a plan out of an event — its people, place and timing carried
	 * across, and the event itself as the first thing on the timeline.
	 *
	 * No confirmation step, unlike a someday: converting a someday asks
	 * whether to tick it off, because a someday is a wish that the plan
	 * fulfils. An event is a fixture on the calendar that a plan is built
	 * around, so there's nothing to ask and nothing to close off — it's
	 * left exactly as it was.
	 */
	public convertEventToPlan(event: EventInfo, peopleNames: string[] = []) {
		const seed = eventPlanSeed(event, peopleNames);
		new PlanModal(
			this.app,
			this,
			(plan) => void this.seedPlanFromEvent(plan, seed),
			seed.prefill
		).open();
	}

	/** Carry the event's substance into the plan it just became. */
	private async seedPlanFromEvent(plan: TFile, seed: EventPlanSeed) {
		await this.planOperations.addItem(plan, seed.item);
		const { location, members } = seed.fields;
		if (location || members) {
			await this.app.fileManager.processFrontMatter(
				plan,
				(fm: Record<string, unknown>) => {
					if (location) fm.location = location;
					if (members) fm.members = members;
				}
			);
		}
		await this.openContactPage(plan);
	}

	/** Create an event, then refresh any open dashboards. */
	public openEventModal() {
		new EventModal(this.app, this, null, () =>
			this.refreshDashboards()
		).open();
	}

	public refreshDashboards() {
		for (const leaf of this.app.workspace.getLeavesOfType(
			VIEW_TYPE_DASHBOARD
		)) {
			const view = leaf.view;
			if (view instanceof DashboardView) void view.refresh();
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
				void this.syncLoggedDiaryEntry(file);
			}, DIARY_SYNC_DEBOUNCE_MS)
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

		// Only entries logged before (one event carries their path) sync.
		const existing = this.eventOperations.findBySource(file.path);
		if (!existing) return;

		const fm = cache.frontmatter;
		const date = fm?.date ? String(fm.date) : "";
		const title = fm?.title ? String(fm.title) : file.basename;
		if (!date) return;

		const resolved = this.app.metadataCache.resolvedLinks[file.path] ?? {};
		const contacts = await this.contactOperations.getContacts();
		const mentioned = contacts.filter(
			(c) => (resolved[c.file.path] ?? 0) > 0
		);

		// One shared event carries the whole entry — added and removed
		// mentions are both just its people list changing.
		const before = this.eventOperations.peoplePaths(existing);
		await this.eventOperations.syncDiaryEvent(
			file.path,
			date,
			title,
			mentioned.map((m) => `[[${m.file.basename}]]`)
		);
		const touched = new Set([
			...before,
			...mentioned.map((m) => m.file.path),
		]);
		for (const path of touched) {
			const f = this.app.vault.getFileByPath(path);
			if (f) await this.refreshOpenContactPages(f);
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

		await this.eventOperations.syncDiaryEvent(
			file.path,
			date,
			title,
			mentioned.map((m) => `[[${m.file.basename}]]`)
		);
		for (const m of mentioned) {
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
			(contact) => new GlanceModal(this.app, this, contact).open(),
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
		new IdeaSearchModal(this.app, contacts, (hit) => {
			void this.openContactPage(hit.contact.file);
		}).open();
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
		await this.app.workspace.revealLeaf(leaf);
	}

	// ---- First-run seeding ----

	/**
	 * A missing base folder is the signal a fresh install hasn't touched
	 * the vault yet — create the folder structure so the dashboard isn't
	 * pointed at nothing the first time it opens. No-op once the base
	 * folder exists.
	 *
	 * Used to also drop in one example friend, retired once the dashboard's
	 * Getting started checklist gave a fresh vault something better than a
	 * placeholder to look at — a real first friend, added by hand, beats a
	 * fake one waiting to be deleted.
	 */
	public async seedStarterVault() {
		const base = normalizePath(this.settings.baseFolder);
		if (this.app.vault.getFolderByPath(base)) return;

		const ensureFolder = async (path: string) => {
			const normalized = normalizePath(path);
			if (!this.app.vault.getFolderByPath(normalized)) {
				await this.app.vault.createFolder(normalized);
			}
		};

		await ensureFolder(base);
		await ensureFolder(this.contactOperations.getPeopleFolderPath());
		await ensureFolder(this.contactOperations.getGroupsFolderPath());
		await ensureFolder(this.planOperations.getPlansFolderPath());
		await ensureFolder(this.somedayOperations.getSomedaysFolderPath());
		await ensureFolder(this.eventOperations.getEventsFolderPath());
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
		const { ics, count: eventCount } = birthdayCalendar(
			contacts.map((c) => ({
				basename: c.file.basename,
				displayName: c.displayName,
				birthday: c.birthday,
			})),
			new Date()
		);
		const path = BIRTHDAY_ICS_PATH;
		await this.app.vault.adapter.write(path, ics);
		new Notice(
			`📅 Saved "${path}" to your vault root (${eventCount} events — everyone's next birthday).\n\nOpen it in Finder and double-click to add to Apple Calendar — pick an iCloud calendar to get iPhone alerts too. Re-run and re-import yearly to top up.`,
			EXPORT_NOTICE_MS
		);
	}

	// ---- Year recap ----

	private async generateYearRecap() {
		const year = new Date().getFullYear();
		const contacts = await this.contactOperations.getContacts();
		const diaryEntries = await this.diaryOperations.getEntries();
		const text = buildYearRecap({
			year,
			generatedOn: todayISO(),
			contacts,
			diaryDates: diaryEntries.map((e) => e.date),
		});

		const path = `${this.settings.baseFolder}/Callander Recap ${year}.md`;
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, text);
			await this.app.workspace.getLeaf(true).openFile(existing);
		} else {
			const file = await this.app.vault.create(path, text);
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
			const view = leaf.view;
			if (
				view instanceof ContactPageView &&
				view.file?.path === file.path
			) {
				await view.setFile(file);
			}
		}
	}

	/**
	 * One file's write in a startup migration, kept from stopping the rest.
	 * A note whose YAML doesn't parse makes processFrontMatter throw, and
	 * a throw from a migration aborts the rest of startup: one broken note
	 * turned off birthday reminders and the status bar on every launch.
	 * The file is left as it is, to be tried again next start.
	 */
	/** The reminders→events merge, and a notice when it moved anything. One
	 * run at a time, so a settle mid-run joins it rather than notifying twice. */
	private readonly runEventMigration = singleFlight(async () => {
		const moved = await this.eventMigration.run();
		if (moved > 0) {
			new Notice(
				`📦 Callander moved ${formatCount(
					moved,
					"event"
				)} into ${this.eventOperations.getEventsFolderPath()}`
			);
			this.refreshDashboards();
		}
	});

	private async migrateFile(
		file: TFile,
		edit: (frontmatter: Record<string, unknown>) => void
	) {
		try {
			await this.app.fileManager.processFrontMatter(file, edit);
		} catch (error) {
			console.warn(
				`Callander: couldn't migrate ${file.path}, so it's unchanged.`,
				error
			);
		}
	}

	/**
	 * Existing "birthplace" values were really hometowns — move them to
	 * the new hometown field. Only touches files that need it; birthplace
	 * stays available as a field for genuine birthplaces.
	 */
	private async migrateBirthplaceValues() {
		const folder = this.app.vault.getFolderByPath(
			this.contactOperations.getPeopleFolderPath()
		);
		if (!folder) return;
		for (const child of folder.children) {
			if (!(child instanceof TFile) || child.extension !== "md") {
				continue;
			}
			const fm: unknown =
				this.app.metadataCache.getFileCache(child)?.frontmatter;
			if (fieldOf(fm, "birthplace") && !fieldOf(fm, "hometown")) {
				await this.migrateFile(child, (frontmatter) => {
					if (frontmatter.birthplace && !frontmatter.hometown) {
						frontmatter.hometown = frontmatter.birthplace;
						delete frontmatter.birthplace;
					}
				});
			}
		}
	}

	/**
	 * Someday types were regrouped into fewer, broader categories after
	 * real somedays already existed under the old ids — remap each one so
	 * an existing someday doesn't quietly lose its type (its emoji, its
	 * filter membership) the moment this ships. "Date" had no clean
	 * one-to-one replacement and was dropped as a concept entirely, so
	 * it's cleared rather than guessed at.
	 */
	private async migrateSomedayTypes() {
		const REMAP: Record<string, string | null> = {
			bar: "drinks",
			cafe: "food",
			hike: "activity",
			market: "shopping",
			movie: "show",
			park: "nature",
			sports: "game",
			date: null,
		};
		const folder = this.app.vault.getFolderByPath(
			this.somedayOperations.getSomedaysFolderPath()
		);
		if (!folder) return;
		for (const child of folder.children) {
			if (!(child instanceof TFile) || child.extension !== "md") {
				continue;
			}
			const fm: unknown =
				this.app.metadataCache.getFileCache(child)?.frontmatter;
			const current = fieldOf(fm, "type");
			if (typeof current !== "string" || !(current in REMAP)) continue;
			await this.migrateFile(child, (frontmatter) => {
				// Re-check against the live value — it may have changed
				// between the read above and this write actually landing.
				if (frontmatter.type !== current) return;
				const next = REMAP[current];
				if (next) frontmatter.type = next;
				else delete frontmatter.type;
			});
		}
	}

	/**
	 * Events gained a `variant` telling a calendar entry apart from a
	 * record of someone — see EventVariant. Everything written before it
	 * existed has to be classified from its shape, since the provenance
	 * that would have answered it is already gone.
	 *
	 * The absent field is the "not yet done" marker, so this writes the
	 * default out explicitly too and is a no-op on the second run.
	 */
	private async migrateEventVariants() {
		const folder = this.app.vault.getFolderByPath(
			this.eventOperations.getEventsFolderPath()
		);
		if (!folder) return;
		const now = new Date();
		for (const child of folder.children) {
			if (!(child instanceof TFile) || child.extension !== "md") {
				continue;
			}
			const fm: unknown =
				this.app.metadataCache.getFileCache(child)?.frontmatter;
			if (fieldOf(fm, "variant") !== undefined) continue;
			const variant = classifyExistingEvent(
				{
					date: toText(fieldOf(fm, "date")),
					type: toText(fieldOf(fm, "type")),
					people: asArray(fieldOf(fm, "people")).map(String),
					source: toText(fieldOf(fm, "source")),
					hideFromDashboard: !!fieldOf(fm, "hideFromDashboard"),
				},
				now
			);
			await this.migrateFile(child, (frontmatter) => {
				// Re-check the live value — another device may have
				// classified it between the read above and this write.
				if (frontmatter.variant !== undefined) return;
				frontmatter.variant = variant;
				delete frontmatter.hideFromDashboard;
			});
		}
	}

	// ---- Reminders ----

	private async checkBirthdays() {
		if (!this.settings.showBirthdayReminders) return;

		// Only remind once per day, however many times the vault is opened.
		// The local day, not UTC: "once a day" has to mean the day you're
		// having, or an evening in the US would tick tomorrow off early and
		// swallow tomorrow's digest.
		const today = todayISO();
		if (this.settings.lastBirthdayNoticeDate === today) return;
		this.settings.lastBirthdayNoticeDate = today;
		await this.saveSettings();

		const contacts = await this.contactOperations.getContacts();

		const todayNotice = todayBirthdayNotice(contacts);
		if (todayNotice) {
			new Notice(todayNotice, REMINDER_NOTICE_MS);

			// Real macOS notification too (Obsidian is Electron) — reaches
			// Notification Center even when Obsidian isn't focused
			if (Platform.isDesktopApp && typeof Notification === "function") {
				try {
					for (const c of birthdaysToday(contacts)) {
						new Notification("Callander", {
							body: birthdayNotificationBody(c),
						});
					}
				} catch (error) {
					console.error("Callander: system notification failed", error);
				}
			}
		}

		// One digest for everything coming up inside the reminder window
		const digest = upcomingBirthdayDigest(
			contacts,
			this.settings.birthdayReminderDays
		);
		if (digest) new Notice(digest, REMINDER_NOTICE_MS);

		// Met-anniversaries, at recorded precision (exact-day mets only)
		for (const notice of metAnniversaryNotices(contacts, new Date())) {
			new Notice(notice, REMINDER_NOTICE_MS);
		}
	}

	private async updateStatusBar() {
		if (!this.statusBarEl) return;
		const contacts = await this.contactOperations.getContacts();
		this.statusBarEl.setText(
			birthdayStatusLabel(contacts, this.settings.birthdayReminderDays)
		);
	}

	// ---- Settings ----

	async loadSettings() {
		const raw: unknown = await this.loadData();
		const data: Record<string, unknown> = isRecord(raw) ? raw : {};
		// Legacy tab ids: "gifts" became "ideas", "interactions" became "events"
		if (data.defaultActiveTab === "gifts") {
			data.defaultActiveTab = "ideas";
		}
		if (data.defaultActiveTab === "interactions") {
			data.defaultActiveTab = "events";
		}
		// "age" sort split into youngest/eldest
		if (data.friendListSort === "age") {
			data.friendListSort = "youngest";
		}
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
		// calendarGroupColors is a nested object, so the shallow merge above
		// keeps a saved one exactly as it was written — a vault saved before
		// "Color by type" added its `types` key would otherwise carry
		// forward without one, and every read of it (typeColorFor) would
		// throw on a plain object access, taking the whole calendar down
		// with it.
		this.settings.calendarGroupColors = {
			...DEFAULT_SETTINGS.calendarGroupColors,
			...this.settings.calendarGroupColors,
			categories: {
				...DEFAULT_SETTINGS.calendarGroupColors.categories,
				...this.settings.calendarGroupColors?.categories,
			},
			types: {
				...DEFAULT_SETTINGS.calendarGroupColors.types,
				...this.settings.calendarGroupColors?.types,
			},
		};
	}

	/**
	 * Anything that wants to know when settings change. Composed rather than
	 * inherited — a Plugin can't also extend Events — and deliberately
	 * Obsidian's own emitter, so `registerEvent` handles teardown and a view
	 * can't leak a listener past its own lifetime.
	 */
	public readonly events = new Events();

	async saveSettings() {
		await this.saveData(this.settings);
		// Open views read settings at render time but had no way to hear
		// about a change, so a new sort or a renamed folder only took effect
		// on the next reopen. They subscribe to this instead.
		this.events.trigger("settings-changed");
	}

	onunload() {
		// Remove the datalist from document.body if it exists
		const datalist = document.getElementById("relationship-types");
		if (datalist) {
			datalist.remove();
		}
	}
}
