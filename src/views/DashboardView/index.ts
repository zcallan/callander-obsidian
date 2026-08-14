import { ItemView, WorkspaceLeaf, Notice, TFile, setIcon } from "obsidian";
import type FriendTracker from "@/main";
import type {
	ContactWithCountdown,
	Draft,
	EventInfo,
	Expense,
	Idea,
} from "@/types";
import { IDEA_CATEGORIES } from "@/constants";
import { SomedayModal } from "@/modals/SomedayModal";
import { SomedayViewModal } from "@/modals/SomedayViewModal";
import { EventModal } from "@/modals/EventModal";
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
	flexSortKey,
	isFlexUpcoming,
	monthName,
} from "@/utils/flexdate";
import { PlanModal } from "@/modals/PlanModal";
import { formatDate } from "@/utils/dateFormat";
import { shortenMemberNames, shortNameOverrides } from "@/utils/nameFormat";
import { resolvePeopleNames } from "@/utils/people";
import { partitionExpenses } from "@/utils/expenseMath";
import { ExpenseModal } from "@/modals/ExpenseModal";
import { ExpenseViewModal } from "@/modals/ExpenseViewModal";
import { appendExpenseRow } from "@/components/ExpenseRow";
import { sortSomedays } from "@/utils/somedaySort";
import { somedayRowParts } from "@/utils/somedayRow";
import { buildSomedayRow } from "@/components/SomedayRow";
import { eventRowFields } from "@/utils/eventRow";
import { buildUpcomingRow } from "@/components/UpcomingRow";
import {
	daysUntilFlex,
	conversationalLabel,
	relativeFromDays,
	upcomingWhen,
} from "@/utils/upcomingWhen";
import { PlanOperations } from "@/services/PlanOperations";

export const VIEW_TYPE_DASHBOARD = "callander-dashboard";

export class DashboardView extends ItemView {
	private contacts: ContactWithCountdown[] = [];
	private searchQuery = "";
	// Only used when the Somedays sort is "Random" — fixed for the life of
	// this dashboard so the list doesn't reshuffle on every refresh.
	private somedayRandomSeed = Math.floor(Math.random() * 2 ** 31);

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

		// Settings are read at render time, so a change to one has to be
		// heard rather than waited on — otherwise it only lands on reopen.
		this.registerEvent(
			this.plugin.events.on("settings-changed", () => void this.refresh())
		);
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
		this.renderUpcomingBirthdays(container);
		this.renderMissedBirthdays(container);

		// Future-dated events coming up
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

		// Shared expenses — last, so it's the thing you scroll to the bottom
		// for rather than something you pass on the way down.
		await this.renderExpenses(container);

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

		const wrap = container.createDiv({
			cls: "dashboard-section plan-accordion dashboard-drafts-accordion",
		});
		const header = wrap.createDiv({
			cls: "dashboard-section-header plan-accordion-header",
		});
		// Count in the heading so a collapsed section still says how much is
		// waiting — otherwise collapsing it hides the fact there's anything
		// to triage at all.
		const heading = header.createEl("h3", { text: "✏️ Drafts" });
		heading.createSpan({
			cls: "dashboard-count-badge",
			text: String(all.length),
		});
		setIcon(
			header.createSpan({ cls: "plan-accordion-chevron" }),
			"chevron-down"
		);
		const section = wrap.createDiv({ cls: "plan-accordion-body" });

		const applyOpen = () =>
			wrap.toggleClass("is-open", !this.plugin.settings.draftsCollapsed);
		applyOpen();
		header.addEventListener("click", () => {
			this.plugin.settings.draftsCollapsed =
				!this.plugin.settings.draftsCollapsed;
			applyOpen();
			// Persisted rather than held on the view: the dashboard is torn
			// down and rebuilt on every open, so in-memory state would spring
			// back open each time.
			void this.plugin.saveSettings();
		});

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

	/** Future events, sorted; soonest (and undated) first. */
	private renderUpcoming(container: HTMLElement) {
		const now = new Date();
		type Item = {
			event: EventInfo;
			key: number;
			/** Days from today; null when the date is too coarse to count. */
			days: number | null;
		};
		const items: Item[] = [];

		for (const e of this.plugin.eventOperations.getEvents()) {
			// Timeline entries are records of a person, not your calendar —
			// they live on that person's page and nowhere else.
			if (e.variant === "timeline") continue;
			if (e.status === "done") continue;
			// Called off — still on the record and on the Events page, but
			// the dashboard is for what's actually happening.
			if (e.status === "cancelled") continue;
			const p = parseFlexDate(e.date);
			if (!p || p.year === null) {
				// Undated ("Anytime") — actionable now, so never out of window.
				items.push({ event: e, key: 0, days: null });
				continue;
			}
			if (isFlexUpcoming(p, now)) {
				items.push({
					event: e,
					key: flexSortKey(p),
					days: daysUntilFlex(e.date, now),
				});
				continue;
			}
			// A passed date is implicitly done for most events — but a task
			// keeps asking for a week, so it can still be ticked off.
			if (e.type === "task" && p.month !== null && p.day !== null) {
				const target = new Date(p.year, p.month - 1, p.day);
				target.setHours(0, 0, 0, 0);
				const today = new Date(now);
				today.setHours(0, 0, 0, 0);
				const passed = Math.round(
					(today.getTime() - target.getTime()) / 86400000
				);
				if (passed >= 0 && passed <= 7) {
					items.push({
						event: e,
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
		const buttons = header.createDiv({
			cls: "dashboard-section-buttons",
		});
		const addButton = buttons.createEl("button", {
			cls: "callander-button",
			text: "Add event",
		});
		addButton.addEventListener("click", () => {
			new EventModal(this.app, this.plugin, null, () =>
				this.refresh()
			).open();
		});
		const allButton = buttons.createEl("button", {
			cls: "callander-button",
			text: "See all",
		});
		allButton.addEventListener("click", () =>
			void this.plugin.activateEvents()
		);

		if (items.length === 0) {
			section.createDiv({
				cls: "section-helper-text",
				text: "Nothing coming up. Add an event — a birthday, a booking, anything worth keeping in view.",
			});
			return;
		}

		// Default to a near horizon; anything further out lives on the Events
		// page, so a booking eight months away doesn't crowd out this week.
		const windowDays = this.plugin.settings.upcomingDays;
		const near = items.filter((i) => i.days === null || i.days <= windowDays);
		const shown = near.slice(0, 10);

		if (shown.length === 0) {
			section.createDiv({
				cls: "section-helper-text",
				text: `Nothing in the next ${windowDays} days.`,
			});
		}
		for (const item of shown) {
			const e = item.event;
			buildUpcomingRow(section, {
				...eventRowFields(
					e,
					now,
					e.people.length > 0 ? this.eventPeopleNames(e) : "",
					// The dashboard is a "what's next" view — anything inside
					// a fortnight reads better by weekday than by date.
					{ conversational: true }
				),
				onClick: () =>
					new EventViewModal(this.app, this.plugin, e, () =>
						this.refresh()
					).open(),
			});
		}

		if (items.length > shown.length) {
			const more = section.createDiv({
				cls: "section-helper-text dashboard-row-clickable",
				text: `+${items.length - shown.length} more on the Events page`,
			});
			more.addEventListener("click", () =>
				void this.plugin.activateEvents()
			);
		}
	}

	/** Linked people as display names, resolved against the contact list
	 * the dashboard already holds; dead links fall back to their text. */
	private eventPeopleNames(e: EventInfo): string {
		return e.people
			.map((raw) => {
				const linktext = raw
					.replace(/^\[\[|\]\]$/g, "")
					.split("|")[0]
					.trim();
				const dest = this.app.metadataCache.getFirstLinkpathDest(
					linktext,
					e.file.path
				);
				const match = dest
					? this.contacts.find((c) => c.file.path === dest.path)
					: undefined;
				return match?.displayName ?? linktext;
			})
			.join(", ");
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
						text: event.name,
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
			const { date, relative, tone } = upcomingWhen(plan.date, now);

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
						relativeFromDays(daysUntilEnd));
				}
			}

			// Location and rough budget sit beside the name
			const details: string[] = [];
			if (plan.location) details.push(plan.location);
			const est = PlanOperations.estimate({ items: plan.items });
			if (est > 0) details.push(`~$${est}`);

			buildUpcomingRow(section, {
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
		// Ordered by whatever sort the Somedays page is set to, so the five
		// shown here are the five that page would lead with.
		const somedays = sortSomedays(
			this.plugin.somedayOperations
				.getSomedays()
				.filter((s) => s.status !== "done" && !s.convertedTo),
			this.plugin.settings.somedaySort,
			{
				randomSeed: this.somedayRandomSeed,
				hemisphere: this.plugin.settings.hemisphere,
			}
		);

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

		// Same row as the Somedays page, at the dashboard's own smaller
		// type — see .dashboard-somedays in styles.css.
		const now = new Date();
		const shown = this.plugin.settings.dashboardSomedayCount;
		for (const s of somedays.slice(0, shown)) {
			const row = section.createDiv({
				cls: "dashboard-row dashboard-row-clickable dashboard-someday-row",
			});
			buildSomedayRow(row, somedayRowParts(s, now));
			row.addEventListener("click", () => {
				new SomedayViewModal(this.app, this.plugin, s, () =>
					this.refresh()
				).open();
			});
		}
		if (somedays.length > shown) {
			const more = section.createDiv({
				cls: "section-helper-text dashboard-row-clickable",
				text: `+${somedays.length - shown} more on the Somedays page`,
			});
			more.addEventListener("click", () =>
				void this.plugin.activateSomedays()
			);
		}
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
		// Shortened against every friend, not per entry: disambiguation has
		// to be stable, or the same person would read "Riley" on an entry
		// where she's alone and "Riley S" on one she shares with another
		// Riley. Built once — the roster doesn't change between rows.
		const shortByPath = new Map(
			shortenMemberNames(
				this.contacts.map((c) => c.displayName),
				shortNameOverrides(this.contacts)
			).map((short, i) => [this.contacts[i].file.path, short])
		);
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
				.map((c) => shortByPath.get(c.file.path) ?? c.displayName);
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

	private renderUpcomingBirthdays(container: HTMLElement) {
		const HORIZON = 30;

		const upcoming = this.contacts
			.filter(
				(c) =>
					c.daysUntilBirthday !== null &&
					c.daysUntilBirthday <= HORIZON
			)
			.sort((a, b) => a.daysUntilBirthday! - b.daysUntilBirthday!);

		const wrap = container.createDiv({
			cls: "dashboard-section plan-accordion dashboard-birthdays-accordion",
		});
		const header = wrap.createDiv({
			cls: "dashboard-section-header plan-accordion-header",
		});
		const heading = header.createEl("h3", {
			text: "🎂 Upcoming birthdays",
		});
		if (upcoming.length > 0) {
			heading.createSpan({
				cls: "dashboard-count-badge",
				text: String(upcoming.length),
			});
		}
		setIcon(
			header.createSpan({ cls: "plan-accordion-chevron" }),
			"chevron-down"
		);
		const section = wrap.createDiv({ cls: "plan-accordion-body" });

		const applyOpen = () =>
			wrap.toggleClass(
				"is-open",
				!this.plugin.settings.birthdaysCollapsed
			);
		applyOpen();
		header.addEventListener("click", () => {
			this.plugin.settings.birthdaysCollapsed =
				!this.plugin.settings.birthdaysCollapsed;
			applyOpen();
			// Persisted rather than held on the view: the dashboard is torn
			// down and rebuilt on every open, so in-memory state would
			// spring back open each time.
			void this.plugin.saveSettings();
		});

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
			buildUpcomingRow(section, {
				icon: "",
				date: this.formatDayDate(days),
				name: c.displayName,
				suffix:
					giftCount > 0
						? `${giftCount} gift idea${giftCount > 1 ? "s" : ""}`
						: "no gift ideas yet",
				// The date label already says "Tomorrow", so the count goes
				// here rather than repeating it. Today keeps the cake — a
				// birthday has no time to count down to, so an event's
				// "in 3 hours" has no equivalent here.
				relative:
					days === 0
						? "today! 🎂"
						: days === 1
						? "in 1 day"
						: `in ${days} days`,
				// This list is upcoming-only — never a past day — so soon is
				// the only tone that applies here.
				tone: days <= 1 ? "soon" : undefined,
				onClick: () => void this.openContact(c.file),
			});
		}
	}

	/** Human date offset from today: "Monday", "Next Monday", "Monday 16 Aug" */
	private formatDayDate(offsetDays: number): string {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		d.setDate(d.getDate() + offsetDays);
		// Close by, the weekday alone says it — same rule the Upcoming
		// section reads by, so the two lists agree.
		const near = conversationalLabel(d, offsetDays);
		if (near) return near;
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
			buildUpcomingRow(section, {
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

	/**
	 * Shared expenses that don't belong to anything — dinner last night, a
	 * taxi split three ways. Recorded straight from here, so splitting one
	 * cost doesn't mean inventing something to hang it off.
	 */
	private async renderExpenses(container: HTMLElement) {
		const ops = this.plugin.contactOperations;
		const expenses = await ops.getExpenses();
		const sourcePath = ops.getDashboardFilePath();
		const yourName = this.plugin.settings.yourName;
		const shortNames = shortNameOverrides(this.contacts);

		const section = container.createDiv({ cls: "dashboard-section" });
		section.createEl("h3", { text: "💵 Expenses" });

		// Everything still owed, then everything squared up — the settled
		// ones stay reachable but out of the way.
		const { open, settled } = partitionExpenses(expenses);

		if (expenses.length === 0) {
			section.createDiv({
				cls: "section-helper-text",
				text: "Split a one-off cost — dinner, a taxi, the groceries. Divide it evenly, by shares, or line by line off the receipt.",
			});
		}

		// The participant list an expense is scored against: whoever it names,
		// plus you. Resolved per expense, since each carries its own people.
		const participantsFor = (expense: Expense): string[] => {
			const picked = resolvePeopleNames(
				this.app,
				sourcePath,
				expense.people ?? []
			);
			const you = yourName.trim();
			return you && !picked.some((p) => p.toLowerCase() === you.toLowerCase())
				? [you, ...picked]
				: picked;
		};

		const saveAt = async (index: number, updated: Expense) => {
			await ops.writeExpenses((list) => {
				list[index] = updated;
			});
			await this.refresh();
		};

		const deleteAt = async (index: number) => {
			await ops.writeExpenses((list) => {
				list.splice(index, 1);
			});
			await this.refresh();
		};

		const edit = (index: number, expense: Expense) => {
			new ExpenseModal(
				this.app,
				participantsFor(expense),
				expense,
				(updated) => saveAt(index, updated),
				() => deleteAt(index),
				yourName,
				this.plugin.settings.receiptTaxPercent,
				this.plugin.settings.receiptTipPercent,
				{ contacts: this.contacts, sourcePath }
			).open();
		};

		// Tapping a row reads it first; Edit/Delete/Settle live in that view.
		const openView = (index: number, expense: Expense) => {
			new ExpenseViewModal(
				this.app,
				expense,
				participantsFor(expense),
				() => edit(index, expense),
				() => deleteAt(index),
				yourName,
				async ({ paid, settled: isSettled }) => {
					await ops.writeExpenses((list) => {
						const current = list[index];
						if (!current) return;
						current.paid = paid;
						if (isSettled) current.settled = true;
						else delete current.settled;
					});
					await this.refresh();
				},
				shortNames
			).open();
		};

		for (const { expense, index } of open) {
			appendExpenseRow(section, expense, participantsFor(expense), {
				yourName,
				onClick: () => openView(index, expense),
			});
		}

		// Settled ones fold away — still there to check, never in the way.
		if (settled.length > 0) {
			const details = section.createEl("details", {
				cls: "expense-settled-group",
			});
			const summary = details.createEl("summary", {
				cls: "expense-settled-summary",
			});
			setIcon(
				summary.createSpan({ cls: "expense-settled-chevron" }),
				"chevron-down"
			);
			summary.createSpan({ text: `Settled (${settled.length})` });
			for (const { expense, index } of settled) {
				appendExpenseRow(details, expense, participantsFor(expense), {
					yourName,
					onClick: () => openView(index, expense),
				});
			}
		}

		const footer = section.createDiv({
			cls: "contact-section-footer expense-footer",
		});
		const addButton = footer.createEl("button", { cls: "callander-button" });
		setIcon(addButton, "plus");
		addButton.createSpan({ text: "New expense" });
		addButton.addEventListener("click", () => {
			new ExpenseModal(
				this.app,
				yourName ? [yourName] : [],
				null,
				async (expense) => {
					await ops.writeExpenses((list) => {
						list.push(expense);
					});
					await this.refresh();
				},
				undefined,
				yourName,
				this.plugin.settings.receiptTaxPercent,
				this.plugin.settings.receiptTipPercent,
				{ contacts: this.contacts, sourcePath }
			).open();
		});
	}
}
