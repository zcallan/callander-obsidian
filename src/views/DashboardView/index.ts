import { ItemView, WorkspaceLeaf, Notice, TFile, setIcon } from "obsidian";
import type FriendTracker from "@/main";
import type {
	ContactWithCountdown,
	Draft,
	FriendEvent,
	Idea,
	Reminder,
	SomedayInfo,
} from "@/types";
import {
	IDEA_CATEGORIES,
	EVENT_TYPES,
	REMINDER_TYPES,
	formatSomedayDays,
	formatSomedaySeasons,
} from "@/constants";
import { SomedayModal } from "@/modals/SomedayModal";
import { SomedayViewModal } from "@/modals/SomedayViewModal";
import { ReminderModal } from "@/modals/ReminderModal";
import { ReminderViewModal } from "@/modals/ReminderViewModal";
import { EventViewModal } from "@/modals/EventViewModal";
import { splitLeadingEmoji } from "@/components/EventTimeline";
import {
	CaptureTargetModal,
	ContactSuggestModal,
	QuickIdeaModal,
} from "@/modals/QuickIdeaModal";
import { GroupModal } from "@/modals/GroupModal";
import { ConfirmModal } from "@/modals/ConfirmModal";
import {
	parseFlexDate,
	formatFlexDate,
	flexSortKey,
	isFlexUpcoming,
	monthName,
} from "@/utils/flexdate";
import { PlanModal } from "@/modals/PlanModal";
import { formatDate } from "@/utils/dateFormat";
import { PlanOperations } from "@/services/PlanOperations";

/**
 * Emphasis for a row's relative-time text: "soon" is today/tomorrow, "past"
 * is anything already gone by. Derived from the day count, never by reading
 * the rendered string back.
 */
type RowTone = "soon" | "past";

export const VIEW_TYPE_DASHBOARD = "callander-dashboard";

export class DashboardView extends ItemView {
	private contacts: ContactWithCountdown[] = [];
	private searchQuery = "";
	private showAllUpcomingEvents = false;

	constructor(leaf: WorkspaceLeaf, private plugin: FriendTracker) {
		super(leaf);
		// Participate in tab history so back/forward arrows work
		this.navigation = true;
	}

	getViewType(): string {
		return VIEW_TYPE_DASHBOARD;
	}

	getDisplayText(): string {
		return "Callander";
	}

	getIcon(): string {
		return "heart-handshake";
	}

	async onOpen() {
		// No-ops once the base folder exists — only a fresh install ever
		// actually creates anything here.
		await this.plugin.seedStarterVault();

		const inScope = (path: string) =>
			path.startsWith(this.plugin.settings.baseFolder + "/");
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (inScope(file.path)) void this.refresh();
			})
		);
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (inScope(file.path)) void this.refresh();
			})
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (inScope(file.path)) void this.refresh();
			})
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (inScope(file.path) || inScope(oldPath)) void this.refresh();
			})
		);
		await this.refresh();
	}

	async refresh() {
		this.contacts = await this.plugin.contactOperations.getContacts();
		await this.render();
	}

	private async openContact(file: TFile) {
		await this.plugin.openContactPage(file);
	}

	private async render() {
		const container = this.containerEl.children[1] as HTMLElement;
		const scrollTop = container.scrollTop;
		container.empty();
		container.addClass("dashboard-container");

		// Header + quick actions
		const header = container.createDiv({ cls: "dashboard-header" });
		header.createEl("h2", { text: "Callander" });
		const actions = header.createDiv({ cls: "dashboard-actions" });
		const action = (
			icon: string,
			label: string,
			onClick: () => void | Promise<void>
		) => {
			const btn = actions.createEl("button", {
				cls: "callander-button",
			});
			setIcon(btn, icon);
			btn.createSpan({ text: label });
			btn.addEventListener("click", () => void onClick());
		};
		action("user-plus", "Add friend", () =>
			this.plugin.openAddContactModal()
		);
		action("lightbulb", "Add idea", () =>
			this.plugin.openQuickIdeaCapture()
		);
		action("pencil-line", "Quick note", () => this.plugin.openQuickNote());
		action("table", "All friends", () =>
			this.plugin.activateFriendTracker()
		);

		// Search
		const searchWrap = container.createDiv({
			cls: "dashboard-search",
		});
		const searchInput = searchWrap.createEl("input", {
			attr: { type: "text", placeholder: "Find a friend…" },
			cls: "contact-field-input",
		});
		searchInput.value = this.searchQuery;
		searchInput.addEventListener("input", () => {
			this.searchQuery = searchInput.value;
			this.renderFriendList(friendList);
		});

		const friendList = container.createDiv({
			cls: "dashboard-friend-list",
		});
		this.renderFriendList(friendList);

		// Drafts to triage — kept high so they don't rot
		await this.renderDrafts(container);

		// Birthdays: upcoming + missed (not yet wished)
		const upcomingSection = container.createDiv({
			cls: "dashboard-section",
		});
		upcomingSection.createEl("h3", { text: "🎂 Upcoming birthdays" });
		this.renderUpcomingBirthdays(upcomingSection);
		this.renderMissedBirthdays(container);

		// Future-dated events + reminders coming up
		this.renderUpcoming(container);

		// Anniversaries — events from this same day in past years
		this.renderOnThisDay(container);

		// Upcoming plans
		this.renderPlans(container);

		// Somedays: the wishlist of not-yet-plans
		this.renderSomedays(container);

		// Diary: the latest entries
		this.renderDiary(container);

		// Groups
		this.renderGroups(container);

		// Resurfacing ideas
		const due = this.dueResurfacedIdeas();
		if (due.length > 0) {
			const section = container.createDiv({
				cls: "dashboard-section",
			});
			section.createEl("h3", { text: "⏰ Resurfacing now" });
			for (const { contact, idea } of due) {
				const row = section.createDiv({
					cls: "dashboard-row dashboard-row-clickable",
				});
				const cat = IDEA_CATEGORIES.find((c) => c.id === idea.category);
				row.createSpan({
					text: `${cat?.emoji ?? "✨"} ${idea.text}`,
				});
				row.createSpan({
					cls: "dashboard-row-meta",
					text: contact.displayName,
				});
				row.addEventListener("click", () =>
					void this.openContact(contact.file)
				);
			}
		}

		// Idea inbox
		await this.renderInbox(container);

		container.scrollTop = scrollTop;
	}

	private renderFriendList(listEl: HTMLElement) {
		listEl.empty();
		const q = this.searchQuery.trim().toLowerCase();
		let matches: ContactWithCountdown[];
		if (q) {
			// Searching covers everyone, alphabetically
			matches = this.contacts
				.filter(
					(c) =>
						c.displayName.toLowerCase().includes(q) ||
						c.name.toLowerCase().includes(q) ||
						c.groups.some((g) => g.includes(q))
				)
				.sort((a, b) => a.displayName.localeCompare(b.displayName));
		} else {
			// Browsing shows the 10 most recently interacted-with friends:
			// any idea/event/draft/edit touches their file's mtime
			matches = [...this.contacts]
				.sort((a, b) => b.file.stat.mtime - a.file.stat.mtime)
				.slice(0, 10);
		}

		for (const contact of matches) {
			const chip = listEl.createEl("button", {
				cls: "dashboard-friend-chip",
			});
			chip.createSpan({ text: contact.displayName });
			if (contact.openIdeas > 0) {
				chip.createSpan({
					cls: "dashboard-chip-badge",
					text: `💡${contact.openIdeas}`,
				});
			}
			chip.addEventListener("click", () =>
				void this.openContact(contact.file)
			);
		}
		if (matches.length === 0) {
			listEl.createDiv({
				cls: "section-helper-text",
				text: q ? "No friends match." : "No friends yet.",
			});
		}
	}

	private async renderDrafts(container: HTMLElement) {
		const ops = this.plugin.contactOperations;
		const inboxFile = this.app.vault.getAbstractFileByPath(
			ops.getDashboardFilePath()
		);
		const inboxDrafts = await ops.getInboxDrafts();

		const all: Array<{
			draft: Draft;
			index: number;
			contact: ContactWithCountdown | null;
			holder: TFile;
		}> = [
			...this.contacts.flatMap((c) =>
				c.drafts.map((draft, index) => ({
					draft,
					index,
					contact: c,
					holder: c.file,
				}))
			),
			...(inboxFile instanceof TFile
				? inboxDrafts.map((draft, index) => ({
						draft,
						index,
						contact: null,
						holder: inboxFile,
				  }))
				: []),
		].sort((a, b) =>
			(b.draft.created || "").localeCompare(a.draft.created || "")
		);

		if (all.length === 0) return;

		const section = container.createDiv({
			cls: "dashboard-section",
		});
		section.createEl("h3", { text: "✏️ Drafts" });

		for (const item of all) {
			const row = section.createDiv({ cls: "dashboard-row" });
			const label = row.createSpan({
				cls: item.contact ? "dashboard-row-clickable-label" : undefined,
				text: item.draft.text,
			});
			label.createSpan({
				cls: "dashboard-row-date",
				text: ` · ${
					item.contact?.displayName ?? "unfiled"
				}${this.draftAge(item.draft.created)}`,
			});
			if (item.contact) {
				const file = item.contact.file;
				label.addEventListener("click", () =>
					void this.openContact(file)
				);
			}

			const ideaButton = row.createEl("button", {
				cls: "callander-button dashboard-row-action",
				text: "Make idea",
			});
			ideaButton.addEventListener("click", () =>
				this.categorizeDraft(
					item.holder,
					item.index,
					item.draft,
					item.contact
				)
			);

			const deleteButton = row.createEl("button", {
				cls: "callander-button button-icon button-danger dashboard-row-action dashboard-draft-delete",
				attr: { "aria-label": "Discard draft" },
			});
			setIcon(deleteButton, "trash");
			deleteButton.addEventListener("click", () => {
				const preview =
					item.draft.text.length > 80
						? item.draft.text.slice(0, 80) + "…"
						: item.draft.text;
				new ConfirmModal(
					this.app,
					"Discard draft",
					`Discard "${preview}"?`,
					"Discard",
					async () => {
						await ops.removeDraft(item.holder, item.index);
						await this.plugin.refreshOpenContactPages(item.holder);
						await this.refresh();
					}
				).open();
			});
		}
	}

	private draftAge(created: string): string {
		if (!created) return "";
		const [y, m, d] = created.split("-").map(Number);
		if (!y || !m || !d) return "";
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const days = Math.round(
			(today.getTime() - new Date(y, m - 1, d).getTime()) / 86400000
		);
		if (days <= 0) return " · today";
		if (days === 1) return " · yesterday";
		return ` · ${days}d ago`;
	}

	/** Turn a draft into a proper categorized idea, then remove the draft */
	private categorizeDraft(
		holder: TFile,
		index: number,
		draft: Draft,
		contact: ContactWithCountdown | null
	) {
		const ops = this.plugin.contactOperations;
		const finish = async (targetFile: TFile) => {
			await ops.removeDraft(holder, index);
			await this.plugin.refreshOpenContactPages(holder);
			await this.plugin.refreshOpenContactPages(targetFile);
			new Notice("💡 Filed as idea");
			await this.refresh();
		};

		if (contact) {
			new QuickIdeaModal(
				this.app,
				contact.displayName,
				this.plugin.lastQuickIdeaCategory,
				async (category, text) => {
					this.plugin.lastQuickIdeaCategory = category;
					await ops.addIdea(contact.file, category, text);
					await finish(contact.file);
				},
				draft.text
			).open();
		} else {
			// Ideas carry categories; plans take bucketed items — exclude
			// plans from draft categorization to keep the shapes straight
			const targets = this.plugin
				.buildCaptureTargets(this.contacts)
				.filter((t) => t.kind !== "plan");
			new CaptureTargetModal(this.app, targets, (target) => {
				new QuickIdeaModal(
					this.app,
					target.kind === "inbox" ? "the inbox" : target.label,
					this.plugin.lastQuickIdeaCategory,
					async (category, text) => {
						this.plugin.lastQuickIdeaCategory = category;
						const file = await target.getFile();
						await ops.addIdea(file, category, text);
						await finish(file);
					},
					draft.text
				).open();
			}).open();
		}
	}

	/** Future events + reminders, merged and sorted; soonest (and undated) first. */
	private renderUpcoming(container: HTMLElement) {
		const now = new Date();
		type Item = (
			| {
					kind: "event";
					contact: ContactWithCountdown;
					event: FriendEvent;
			  }
			| { kind: "reminder"; reminder: Reminder }
		) & {
			key: number;
			/** Days from today; null when the date is too coarse to count. */
			days: number | null;
		};
		const items: Item[] = [];

		for (const c of this.contacts) {
			for (const event of c.events) {
				if (event.hiddenFromUpcoming) continue;
				const p = parseFlexDate(event.date);
				if (p && isFlexUpcoming(p, now)) {
					items.push({
						kind: "event",
						contact: c,
						event,
						key: flexSortKey(p),
						days: this.daysUntilFlex(event.date, now),
					});
				}
			}
		}
		for (const r of this.plugin.reminderOperations.getReminders()) {
			if (r.status === "done") continue;
			const p = parseFlexDate(r.date);
			if (!p || p.year === null) {
				// Undated ("Anytime") — actionable now, so never out of window.
				items.push({ kind: "reminder", reminder: r, key: 0, days: null });
				continue;
			}
			if (isFlexUpcoming(p, now)) {
				items.push({
					kind: "reminder",
					reminder: r,
					key: flexSortKey(p),
					days: this.daysUntilFlex(r.date, now),
				});
				continue;
			}
			// Recently passed (≤7 days) so it can still be dismissed
			if (p.month !== null && p.day !== null) {
				const target = new Date(p.year, p.month - 1, p.day);
				target.setHours(0, 0, 0, 0);
				const today = new Date(now);
				today.setHours(0, 0, 0, 0);
				const passed = Math.round(
					(today.getTime() - target.getTime()) / 86400000
				);
				if (passed >= 0 && passed <= 7) {
					items.push({
						kind: "reminder",
						reminder: r,
						key: flexSortKey(p),
						days: -passed,
					});
				}
			}
		}
		items.sort((a, b) => a.key - b.key);

		const section = container.createDiv({
			cls: "dashboard-section dashboard-upcoming-section",
		});
		const header = section.createDiv({
			cls: "dashboard-section-header",
		});
		header.createEl("h3", { text: "📌 Upcoming" });
		const addButton = header.createEl("button", {
			cls: "callander-button",
			text: "Add reminder",
		});
		addButton.addEventListener("click", () => {
			new ReminderModal(this.app, this.plugin, null, () =>
				this.refresh()
			).open();
		});

		// Reminders moved from the single Reminders.md store to one file
		// each under Reminders/. Old rows still work, but nudge people to
		// move across. TODO(~2026-09): remove along with the legacy store.
		const legacyCount =
			this.plugin.reminderOperations.legacyReminderCount();
		if (legacyCount > 0) {
			section.createDiv({
				cls: "section-helper-text dashboard-migration-note",
				text: `⚠️ Reminders now live in their own folder, and ${
					legacyCount === 1
						? "1 of yours is"
						: `${legacyCount} of yours are`
				} still in the old Reminders.md. Re-add each with "Add reminder", delete the old one here, then remove Reminders.md.`,
			});
		}

		if (items.length === 0) {
			section.createDiv({
				cls: "section-helper-text",
				text: "Nothing coming up. Add a reminder — a birthday, a booking, anything worth keeping in view.",
			});
			return;
		}

		// Default to a near horizon; anything further out waits behind the
		// toggle, so a booking eight months away doesn't crowd out this week.
		const windowDays = this.plugin.settings.upcomingDays;
		const near = items.filter((i) => i.days === null || i.days <= windowDays);
		const shown = this.showAllUpcomingEvents ? items : near.slice(0, 10);

		if (shown.length === 0) {
			section.createDiv({
				cls: "section-helper-text",
				text: `Nothing in the next ${windowDays} days.`,
			});
		}
		for (const item of shown) {
			if (item.kind === "event") {
				const lead = splitLeadingEmoji(item.event.text);
				const type = EVENT_TYPES.find((t) => t.id === item.event.type);
				const { date, relative, tone } = this.upcomingWhen(
					item.event.date,
					now
				);
				this.renderUpcomingRow(section, {
					icon: lead ? lead.emoji : type ? type.emoji : "",
					date,
					name: lead ? lead.rest : item.event.text,
					suffix: item.contact.displayName,
					relative,
					tone,
					onClick: () =>
						new EventViewModal(
							this.app,
							this.plugin,
							item.contact,
							item.event,
							() => this.render()
						).open(),
				});
			} else {
				const r = item.reminder;
				const lead = splitLeadingEmoji(r.name);
				const { date, relative, tone } = this.upcomingWhen(
					r.date ?? "",
					now
				);
				// Legacy Reminders.md rows wear the migration warning instead
				// of their own icon (goes away with the legacy store)
				const legacy = !r.file;
				const typeEmoji = REMINDER_TYPES.find(
					(t) => t.id === r.type
				)?.emoji;
				this.renderUpcomingRow(section, {
					icon: legacy ? "⚠️" : lead ? lead.emoji : typeEmoji ?? "⏰",
					date: date || "Anytime",
					time: r.time ? this.formatReminderTime(r.time) : "",
					name: legacy || !lead ? r.name : lead.rest,
					suffix: r.location ?? "",
					relative,
					tone,
					onClick: () =>
						new ReminderViewModal(this.app, this.plugin, r, () =>
							this.refresh()
						).open(),
				});
			}
		}

		if (items.length > shown.length || this.showAllUpcomingEvents) {
			const hidden = items.length - shown.length;
			const toggle = section.createEl("button", {
				cls: "callander-button",
				text: this.showAllUpcomingEvents
					? "Show fewer"
					: `Show all (${items.length})`,
				attr: {
					"aria-label": `${hidden} further ahead`,
				},
			});
			toggle.addEventListener("click", () => {
				this.showAllUpcomingEvents = !this.showAllUpcomingEvents;
				void this.render();
			});
		}
	}

	private renderUpcomingRow(
		section: HTMLElement,
		opts: {
			icon: string;
			date: string;
			time?: string;
			name: string;
			suffix: string;
			relative: string;
			/** Emphasis for the relative text (right-hand side) */
			tone?: RowTone;
			/** Emphasis for the suffix — rows whose timing lives there */
			suffixTone?: RowTone;
			onClick: () => void;
			/** Right-hand button, shown in place of the relative text */
			action?: {
				icon: string;
				label: string;
				ariaLabel: string;
				onClick: (e: MouseEvent) => void;
			};
		}
	) {
		const row = section.createDiv({
			cls: "dashboard-row dashboard-row-clickable dashboard-upcoming-row",
		});
		const mainCol = row.createDiv({ cls: "dashboard-upcoming-main" });
		// Rows without a date (missed birthdays) are single-line — skip the
		// when line entirely rather than leaving an empty gap above the name
		if (opts.icon || opts.date || opts.time) {
			mainCol.createDiv({
				cls: "dashboard-upcoming-when",
				text: `${opts.icon ? opts.icon + " " : ""}${opts.date}${
					opts.time ? " · " + opts.time : ""
				}`,
			});
		}
		const nameEl = mainCol.createDiv({
			cls: "dashboard-upcoming-name",
		});
		nameEl.createSpan({ text: opts.name });
		if (opts.suffix) {
			nameEl.createSpan({
				cls: `dashboard-upcoming-person${
					opts.suffixTone ? ` dashboard-rel-${opts.suffixTone}` : ""
				}`,
				text: ` • ${opts.suffix}`,
			});
		}
		if (opts.action) {
			const button = row.createEl("button", {
				cls: "callander-button dashboard-row-action",
				attr: { "aria-label": opts.action.ariaLabel },
			});
			setIcon(button, opts.action.icon);
			button.createSpan({ text: opts.action.label });
			button.addEventListener("click", opts.action.onClick);
		} else if (opts.relative) {
			row.createSpan({
				cls: `dashboard-upcoming-rel${
					opts.tone ? ` dashboard-rel-${opts.tone}` : ""
				}`,
				text: opts.relative,
			});
		}
		row.addEventListener("click", opts.onClick);
	}

	private formatReminderTime(t: string): string {
		const [h, m] = t.split(":").map(Number);
		if (Number.isNaN(h)) return t;
		const period = h < 12 ? "AM" : "PM";
		const hr = h % 12 === 0 ? 12 : h % 12;
		return `${hr}:${String(m || 0).padStart(2, "0")} ${period}`;
	}

	/** Split "when" into a date ("Friday Aug 21") and a relative ("in 25 days"). */
	/**
	 * Days from today to a flex date. Coarse dates anchor to the start of
	 * their period (a bare "August 2026" counts from the 1st) — good enough
	 * for a window test, where being a few days out never flips the answer.
	 * Null when there's no year at all, which the caller treats as "always
	 * show": an undated reminder is actionable now, not far off.
	 */
	private daysUntilFlex(dateStr: string | undefined, now: Date): number | null {
		const p = parseFlexDate(dateStr ?? "");
		if (!p || p.year === null) return null;
		const target = new Date(p.year, (p.month ?? 1) - 1, p.day ?? 1);
		target.setHours(0, 0, 0, 0);
		const today = new Date(now);
		today.setHours(0, 0, 0, 0);
		return Math.round((target.getTime() - today.getTime()) / 86400000);
	}

	/** "today" / "4 days ago" / "in 12 days" (etc.) and its tone, from an
	 * exact day offset — the piece day-precision dates and a plan's end
	 * date both need. */
	private relativeFromDays(days: number): {
		relative: string;
		tone?: RowTone;
	} {
		let relative: string;
		if (days === 0) relative = "today";
		else if (days === 1) relative = "tomorrow";
		else if (days === -1) relative = "yesterday";
		else if (days < 0) relative = `${-days} days ago`;
		else if (days <= 90) relative = `in ${days} days`;
		else relative = `in ${Math.round(days / 30)} months`;
		const tone: RowTone | undefined =
			days < 0 ? "past" : days <= 1 ? "soon" : undefined;
		return { relative, tone };
	}

	private upcomingWhen(
		dateStr: string,
		now: Date
	): { date: string; relative: string; tone?: RowTone } {
		const p = parseFlexDate(dateStr);
		if (!p) return { date: "", relative: "" };
		if (p.year !== null && p.month !== null && p.day !== null) {
			const target = new Date(p.year, p.month - 1, p.day);
			target.setHours(0, 0, 0, 0);
			const today = new Date(now);
			today.setHours(0, 0, 0, 0);
			const days = Math.round(
				(target.getTime() - today.getTime()) / 86400000
			);
			// Intl's en-AU "short" month doesn't actually abbreviate (renders
			// "July" in full) — build the short form ourselves rather than
			// trust it, the same way TableView's birthdayDate() does.
			const weekday = formatDate(target, { weekday: "long" });
			const year =
				p.year !== now.getFullYear() ? ` ${p.year}` : "";
			const date = `${weekday} ${p.day} ${monthName(p.month).slice(
				0,
				3
			)}${year}`;
			return { date, ...this.relativeFromDays(days) };
		}
		// Month precision ("August 2026"): counting days would imply a
		// precision we don't have, so compare whole months instead.
		if (p.year !== null && p.month !== null) {
			const months =
				(p.year - now.getFullYear()) * 12 +
				(p.month - (now.getMonth() + 1));
			let relative: string;
			if (months === 0) relative = "this month";
			else if (months === 1) relative = "next month";
			else if (months === -1) relative = "last month";
			else if (months < 0) relative = `${-months} months ago`;
			else relative = `in ${months} months`;
			// A whole month is never "today" — only the past end gets emphasis.
			return {
				date: formatFlexDate(p),
				relative,
				tone: months < 0 ? "past" : undefined,
			};
		}
		return { date: formatFlexDate(p), relative: "" };
	}

	/** Events from this same calendar day in earlier years — a warm callback. */
	private renderOnThisDay(container: HTMLElement) {
		const now = new Date();
		const month = now.getMonth() + 1;
		const day = now.getDate();
		const thisYear = now.getFullYear();

		const hits: Array<{
			contact: ContactWithCountdown;
			text: string;
			yearsAgo: number;
		}> = [];
		for (const c of this.contacts) {
			for (const event of c.events) {
				const p = parseFlexDate(event.date);
				if (p?.year == null || p.month == null || p.day == null) {
					continue;
				}
				if (p.month === month && p.day === day && p.year < thisYear) {
					hits.push({
						contact: c,
						text: event.text,
						yearsAgo: thisYear - p.year,
					});
				}
			}
		}
		if (hits.length === 0) return;
		hits.sort((a, b) => a.yearsAgo - b.yearsAgo);

		const section = container.createDiv({ cls: "dashboard-section" });
		section.createEl("h3", { text: "🕰️ On this day" });
		for (const hit of hits) {
			const row = section.createDiv({
				cls: "dashboard-row dashboard-row-clickable",
			});
			row.createSpan({ text: hit.text });
			row.createSpan({
				cls: "dashboard-row-meta",
				text: `${hit.yearsAgo} year${
					hit.yearsAgo === 1 ? "" : "s"
				} ago · ${hit.contact.displayName}`,
			});
			row.addEventListener("click", () =>
				void this.openContact(hit.contact.file)
			);
		}
	}

	private renderPlans(container: HTMLElement) {
		const plans = this.plugin.planOperations
			.getPlans()
			.filter((p) => p.status !== "done")
			.sort((a, b) => {
				const keyA = parseFlexDate(a.date)
					? flexSortKey(parseFlexDate(a.date)!)
					: Number.MAX_SAFE_INTEGER;
				const keyB = parseFlexDate(b.date)
					? flexSortKey(parseFlexDate(b.date)!)
					: Number.MAX_SAFE_INTEGER;
				return keyA - keyB;
			});

		const section = container.createDiv({
			cls: "dashboard-section",
		});
		const header = section.createDiv({
			cls: "dashboard-section-header",
		});
		header.createEl("h3", { text: "🗺️ Plans" });
		const newButton = header.createEl("button", {
			cls: "callander-button",
			text: "New plan",
		});
		newButton.addEventListener("click", () => {
			new PlanModal(this.app, this.plugin, (file) =>
				void this.plugin.openContactPage(file)
			).open();
		});

		if (plans.length === 0) {
			section.createDiv({
				cls: "section-helper-text",
				text: "Something brewing? A weekend away, a dinner — plan it with the people it's for.",
			});
			return;
		}

		const now = new Date();
		const today = new Date(now);
		today.setHours(0, 0, 0, 0);
		for (const plan of plans) {
			// A leading emoji in the plan name stands in as the row icon
			const lead = splitLeadingEmoji(plan.name);
			const { date, relative, tone } = this.upcomingWhen(plan.date, now);

			const startFlex = parseFlexDate(plan.date);
			const endFlex = parseFlexDate(plan.endDate);

			// Multi-day plans read as a range: "Saturday 16 Aug - 17 Aug"
			let when = date;
			let endDay: Date | null = null;
			if (endFlex && endFlex.month !== null && endFlex.day !== null) {
				const endYear =
					endFlex.year ?? startFlex?.year ?? now.getFullYear();
				endDay = new Date(endYear, endFlex.month - 1, endFlex.day);
				if (when) {
					// Self-built short month — see the note in upcomingWhen.
					when += ` - ${endFlex.day} ${monthName(
						endFlex.month
					).slice(0, 3)}`;
				}
			}

			// A plan that's underway reads as "today" for its whole span: the
			// start date's "3 days ago" would suggest it had passed. And once
			// it's fully over, the end date is the relevant "ago" — a 4-day
			// trip that finished yesterday should say "1 day ago", not "4".
			let relativeText = relative;
			let relativeTone = tone;
			if (
				endDay &&
				startFlex &&
				startFlex.year !== null &&
				startFlex.month !== null &&
				startFlex.day !== null
			) {
				const startDay = new Date(
					startFlex.year,
					startFlex.month - 1,
					startFlex.day
				);
				if (today >= startDay && today <= endDay) {
					relativeText = "today";
					relativeTone = "soon";
				} else if (today > endDay) {
					// relativeFromDays takes "target minus today" (negative
					// = past), same convention as upcomingWhen's own target
					// date — endDay is already in the past here, so this
					// comes out negative and reads "N days ago".
					const daysUntilEnd = Math.round(
						(endDay.getTime() - today.getTime()) / 86400000
					);
					({ relative: relativeText, tone: relativeTone } =
						this.relativeFromDays(daysUntilEnd));
				}
			}

			// Location and rough budget sit beside the name
			const details: string[] = [];
			if (plan.location) details.push(plan.location);
			const est = PlanOperations.estimate({ items: plan.items });
			if (est > 0) details.push(`~$${est}`);

			this.renderUpcomingRow(section, {
				icon: lead ? lead.emoji : "🗺️",
				date: when || "No date yet",
				name: lead ? lead.rest : plan.name,
				suffix: details.join(" • "),
				relative: relativeText,
				tone: relativeTone,
				onClick: () => void this.openContact(plan.file),
			});
		}
	}

	private renderSomedays(container: HTMLElement) {
		const somedays = this.plugin.somedayOperations
			.getSomedays()
			.filter((s) => s.status !== "done" && !s.convertedTo)
			.sort((a, b) => {
				const fa = parseFlexDate(a.date);
				const fb = parseFlexDate(b.date);
				const ka =
					fa && fa.year !== null
						? flexSortKey(fa)
						: Number.MAX_SAFE_INTEGER;
				const kb =
					fb && fb.year !== null
						? flexSortKey(fb)
						: Number.MAX_SAFE_INTEGER;
				if (ka !== kb) return ka - kb;
				return a.name.localeCompare(b.name);
			});

		const section = container.createDiv({
			cls: "dashboard-section",
		});
		const header = section.createDiv({
			cls: "dashboard-section-header",
		});
		header.createEl("h3", { text: "💭 Somedays" });
		const buttons = header.createDiv({
			cls: "dashboard-section-buttons",
		});
		const newButton = buttons.createEl("button", {
			cls: "callander-button",
			text: "New someday",
		});
		newButton.addEventListener("click", () => {
			new SomedayModal(this.app, this.plugin, null, async (file) => {
				await this.plugin.activateSomedays(file.path);
			}).open();
		});
		const allButton = buttons.createEl("button", {
			cls: "callander-button",
			text: "See all",
		});
		allButton.addEventListener("click", () =>
			void this.plugin.activateSomedays()
		);

		if (somedays.length === 0) {
			section.createDiv({
				cls: "section-helper-text",
				text: "A park to visit, a bar to try, a trip you keep meaning to take — jot it before it slips.",
			});
			return;
		}

		for (const s of somedays.slice(0, 5)) {
			const row = section.createDiv({
				cls: "dashboard-row dashboard-row-clickable",
			});
			row.createSpan({ text: s.name });
			const metaParts: string[] = [];
			const when = this.somedayWhen(s);
			if (when) metaParts.push(when);
			const daysLabel = formatSomedayDays(s.days);
			if (daysLabel) metaParts.push(daysLabel);
			if (s.cost !== null) metaParts.push(`~$${s.cost}`);
			if (metaParts.length > 0) {
				row.createSpan({
					cls: "dashboard-row-meta",
					text: metaParts.join(" · "),
				});
			}
			row.addEventListener("click", () => {
				new SomedayViewModal(this.app, this.plugin, s, () =>
					this.refresh()
				).open();
			});
		}
		if (somedays.length > 5) {
			const more = section.createDiv({
				cls: "section-helper-text dashboard-row-clickable",
				text: `+${somedays.length - 5} more on the Somedays page`,
			});
			more.addEventListener("click", () =>
				void this.plugin.activateSomedays()
			);
		}
	}

	private somedayWhen(s: SomedayInfo): string {
		const f = parseFlexDate(s.date);
		if (f) return formatFlexDate(f);
		return formatSomedaySeasons(s.seasons);
	}

	private renderDiary(container: HTMLElement) {
		const section = container.createDiv({
			cls: "dashboard-section",
		});
		const header = section.createDiv({
			cls: "dashboard-section-header",
		});
		header.createEl("h3", { text: "📖 Diary" });
		const buttons = header.createDiv({
			cls: "dashboard-section-buttons",
		});
		const newButton = buttons.createEl("button", {
			cls: "callander-button",
			text: "New entry",
		});
		newButton.addEventListener("click", () =>
			this.plugin.openNewDiaryEntry()
		);
		const openButton = buttons.createEl("button", {
			cls: "callander-button",
			text: "Open diary",
		});
		openButton.addEventListener("click", () =>
			void this.plugin.activateDiaryView()
		);

		const entries = this.plugin.diaryOperations
			.getEntriesMeta()
			.slice(0, 3);
		if (entries.length === 0) {
			section.createDiv({
				cls: "section-helper-text",
				text: "No entries yet — each one files under the date it's about.",
			});
			return;
		}

		const resolvedLinks = this.app.metadataCache.resolvedLinks;
		for (const entry of entries) {
			const row = section.createDiv({
				cls: "dashboard-row dashboard-row-clickable dashboard-diary-row",
			});
			const main = row.createDiv({
				cls: "dashboard-diary-main",
			});
			main.createSpan({ text: entry.title });

			// Second line: tagged friends (when any), then the date
			const links = resolvedLinks[entry.file.path] ?? {};
			const tagged = this.contacts
				.filter((c) => (links[c.file.path] ?? 0) > 0)
				.map((c) => c.displayName);
			const detailParts: string[] = [];
			if (tagged.length > 0) {
				detailParts.push(`with ${tagged.join(", ")}`);
			}
			const dateLabel = this.formatEntryDate(entry.date);
			if (dateLabel) detailParts.push(dateLabel);
			if (detailParts.length > 0) {
				row.createDiv({
					cls: "dashboard-diary-tagged",
					text: detailParts.join(" · "),
				});
			}

			row.addEventListener("click", () =>
				void this.app.workspace.getLeaf(false).openFile(entry.file)
			);
		}
	}

	private formatEntryDate(dateStr: string): string {
		const [y, m, d] = dateStr.split("-").map(Number);
		if (!y || !m || !d) return dateStr;
		const date = new Date(y, m - 1, d);
		return date.toLocaleDateString("en-AU", {
			weekday: "short",
			day: "numeric",
			month: "long",
			...(y !== new Date().getFullYear() && { year: "numeric" }),
		});
	}

	private renderGroups(container: HTMLElement) {
		const ops = this.plugin.contactOperations;
		const infos = ops.getGroupInfos(this.contacts);

		const section = container.createDiv({
			cls: "dashboard-section",
		});
		const header = section.createDiv({
			cls: "dashboard-section-header",
		});
		header.createEl("h3", { text: "👥 Groups" });
		const newButton = header.createEl("button", {
			cls: "callander-button",
			text: "New group",
		});
		newButton.addEventListener("click", () => {
			new GroupModal(this.app, this.plugin, null, async () => {
				await this.refresh();
			}).open();
		});

		if (infos.length === 0) {
			section.createDiv({
				cls: "section-helper-text",
				text: "Sort friends into circles — Family, Basketball… Groups can hold their own ideas too.",
			});
			return;
		}

		for (const info of infos) {
			const count = this.contacts.filter((c) =>
				c.groups.includes(info.name)
			).length;
			const row = section.createDiv({ cls: "dashboard-row" });

			const label = row.createSpan({
				cls: "dashboard-row-clickable-label dashboard-group-label",
			});
			const dot = label.createSpan({ cls: "group-dot" });
			dot.style.backgroundColor =
				info.color ?? "var(--background-modifier-border)";
			label.createSpan({ text: ops.prettyGroupName(info.name) });
			label.createSpan({
				cls: "dashboard-row-date",
				text: ` · ${count} member${count === 1 ? "" : "s"}`,
			});
			const handleOpenGroup = async () => {
				const file =
					info.file ?? (await ops.ensureGroupFile(info.name));
				await this.openContact(file);
			};
			label.addEventListener("click", () => void handleOpenGroup());

			const manageButton = row.createEl("button", {
				cls: "callander-button button-icon dashboard-row-action",
				attr: { "aria-label": "Manage group" },
			});
			setIcon(manageButton, "settings-2");
			manageButton.addEventListener("click", () => {
				new GroupModal(this.app, this.plugin, info, async () => {
					await this.refresh();
				}).open();
			});
		}
	}

	private renderUpcomingBirthdays(section: HTMLElement) {
		const HORIZON = 30;

		const upcoming = this.contacts
			.filter(
				(c) =>
					c.daysUntilBirthday !== null &&
					c.daysUntilBirthday <= HORIZON
			)
			.sort((a, b) => a.daysUntilBirthday! - b.daysUntilBirthday!);

		if (upcoming.length === 0) {
			section.createDiv({
				cls: "section-helper-text",
				text: `Nothing in the next ${HORIZON} days.`,
			});
			return;
		}

		for (const c of upcoming) {
			const days = c.daysUntilBirthday!;
			const giftCount = c.ideas.filter(
				(i) => !i.done && i.category === "gift"
			).length;
			this.renderUpcomingRow(section, {
				icon: "",
				date: this.formatDayDate(days),
				name: c.displayName,
				suffix:
					giftCount > 0
						? `${giftCount} gift idea${giftCount > 1 ? "s" : ""}`
						: "no gift ideas yet",
				relative:
					days === 0
						? "today! 🎂"
						: days === 1
						? "tomorrow"
						: `in ${days} days`,
				// This list is upcoming-only — never a past day — so soon is
				// the only tone that applies here.
				tone: days <= 1 ? "soon" : undefined,
				onClick: () => void this.openContact(c.file),
			});
		}
	}

	/** Human date offset from today, e.g. "Monday 16 Aug" */
	private formatDayDate(offsetDays: number): string {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		d.setDate(d.getDate() + offsetDays);
		// Self-built short month — Intl's en-AU "short" doesn't actually
		// abbreviate (renders "August" in full). See upcomingWhen's note.
		const weekday = formatDate(d, { weekday: "long" });
		return `${weekday} ${d.getDate()} ${monthName(d.getMonth() + 1).slice(
			0,
			3
		)}`;
	}

	/** The date (YYYY-MM-DD, local) of this contact's most recent birthday */
	private lastOccurrenceDate(daysSince: number): string {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		d.setDate(d.getDate() - daysSince);
		const pad = (n: number) => String(n).padStart(2, "0");
		return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
			d.getDate()
		)}`;
	}

	private renderMissedBirthdays(container: HTMLElement) {
		// How long a missed birthday stays worth acting on — the belated
		// window from settings, not a fixed horizon.
		const horizon = this.plugin.settings.belatedBirthdayDays;

		// Missed = passed within the window and not yet marked as wished
		const missed = this.contacts
			.filter(
				(c) =>
					c.daysSinceBirthday !== null &&
					c.daysSinceBirthday > 0 &&
					c.daysSinceBirthday <= horizon &&
					c.birthdayWished !==
						this.lastOccurrenceDate(c.daysSinceBirthday)
			)
			.sort((a, b) => a.daysSinceBirthday! - b.daysSinceBirthday!);

		if (missed.length === 0) return;

		const section = container.createDiv({
			cls: "dashboard-section dashboard-missed-section",
		});
		section.createEl("h3", { text: "🕯️ Missed birthdays" });

		for (const c of missed) {
			const daysSince = c.daysSinceBirthday!;
			const handleWished = async (e: MouseEvent) => {
				// Don't also open the contact page behind the modal
				e.stopPropagation();
				await this.plugin.contactOperations.markBirthdayWished(
					c.file,
					this.lastOccurrenceDate(daysSince)
				);
				new Notice(`🎈 Nice — ${c.displayName} checked off`);
				await this.refresh();
			};
			this.renderUpcomingRow(section, {
				icon: "",
				date: "",
				name: c.displayName,
				suffix:
					daysSince === 1
						? "yesterday"
						: `${daysSince} days ago`,
				// Every row here is already-passed by the section's own
				// filter (daysSinceBirthday > 0), so always red.
				suffixTone: "past",
				relative: "",
				onClick: () => void this.openContact(c.file),
				action: {
					icon: "check",
					label: "Done",
					ariaLabel: "Mark as wished",
					onClick: (e) => void handleWished(e),
				},
			});
		}
	}

	private dueResurfacedIdeas(): Array<{
		contact: ContactWithCountdown;
		idea: Idea;
	}> {
		const now = new Date();
		const todayKey =
			now.getFullYear() * 10000 +
			(now.getMonth() + 1) * 100 +
			now.getDate();
		const due: Array<{ contact: ContactWithCountdown; idea: Idea }> = [];
		for (const contact of this.contacts) {
			for (const idea of contact.ideas) {
				if (idea.done || !idea.resurface) continue;
				const parsed = parseFlexDate(idea.resurface);
				if (!parsed || parsed.year === null) continue;
				const dueKey =
					parsed.year * 10000 +
					(parsed.month ?? 1) * 100 +
					(parsed.day ?? 1);
				if (dueKey <= todayKey) due.push({ contact, idea });
			}
		}
		return due;
	}

	private async renderInbox(container: HTMLElement) {
		const inboxIdeas = await this.plugin.contactOperations.getInboxIdeas();
		const open = inboxIdeas
			.map((idea, index) => ({ idea, index }))
			.filter(({ idea }) => !idea.done);
		if (open.length === 0) return;

		const section = container.createDiv({
			cls: "dashboard-section",
		});
		section.createEl("h3", { text: "📥 Idea inbox" });
		section.createDiv({
			cls: "section-helper-text",
			text: "Ideas you captured without picking a friend — file them when you know who they're for.",
		});
		for (const { idea, index } of open) {
			const row = section.createDiv({ cls: "dashboard-row" });
			const cat = IDEA_CATEGORIES.find((c) => c.id === idea.category);
			row.createSpan({ text: `${cat?.emoji ?? "✨"} ${idea.text}` });
			const fileButton = row.createEl("button", {
				cls: "callander-button dashboard-row-action",
				text: "File to friend…",
			});
			fileButton.addEventListener("click", () => {
				const handleChoose = async (contact: ContactWithCountdown) => {
					const moved =
						await this.plugin.contactOperations.moveInboxIdea(
							index,
							contact.file
						);
					if (moved) {
						new Notice(`Filed to ${contact.displayName}`);
						await this.refresh();
					}
				};
				new ContactSuggestModal(
					this.app,
					this.contacts,
					(contact) => void handleChoose(contact),
					"File this idea to…"
				).open();
			});
		}
	}
}
