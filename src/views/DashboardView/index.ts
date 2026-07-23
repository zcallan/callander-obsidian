import { ItemView, WorkspaceLeaf, Notice, TFile, setIcon } from "obsidian";
import type FriendTracker from "@/main";
import type { ContactWithCountdown, Idea } from "@/types";
import { IDEA_CATEGORIES } from "@/constants";
import { ContactSuggestModal } from "@/modals/QuickIdeaModal";
import { GroupModal } from "@/modals/GroupModal";
import { parseFlexDate, formatFlexDate } from "@/utils/flexdate";

export const VIEW_TYPE_DASHBOARD = "callander-dashboard";

export class DashboardView extends ItemView {
	private contacts: ContactWithCountdown[] = [];
	private searchQuery = "";

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
		const inScope = (path: string) =>
			path.startsWith(this.plugin.settings.contactsFolder + "/");
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (inScope(file.path)) this.refresh();
			})
		);
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (inScope(file.path)) this.refresh();
			})
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (inScope(file.path)) this.refresh();
			})
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (inScope(file.path) || inScope(oldPath)) this.refresh();
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
		const header = container.createEl("div", { cls: "dashboard-header" });
		header.createEl("h2", { text: "Callander" });
		const actions = header.createEl("div", { cls: "dashboard-actions" });
		const action = (
			icon: string,
			label: string,
			onClick: () => void
		) => {
			const btn = actions.createEl("button", {
				cls: "friend-tracker-button",
			});
			setIcon(btn, icon);
			btn.createSpan({ text: label });
			btn.addEventListener("click", onClick);
		};
		action("user-plus", "Add friend", () =>
			this.plugin.openAddContactModal()
		);
		action("lightbulb", "Add idea", () =>
			this.plugin.openQuickIdeaCapture()
		);
		action("table", "All friends", () =>
			this.plugin.activateFriendTracker()
		);

		// Search
		const searchWrap = container.createEl("div", {
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

		const friendList = container.createEl("div", {
			cls: "dashboard-friend-list",
		});
		this.renderFriendList(friendList);

		// Birthdays: upcoming + missed (not yet wished)
		const upcomingSection = container.createEl("div", {
			cls: "dashboard-section",
		});
		upcomingSection.createEl("h3", { text: "🎂 Upcoming birthdays" });
		this.renderUpcomingBirthdays(upcomingSection);
		this.renderMissedBirthdays(container);

		// Diary: the latest entries
		this.renderDiary(container);

		// Groups
		this.renderGroups(container);

		// Resurfacing ideas
		const due = this.dueResurfacedIdeas();
		if (due.length > 0) {
			const section = container.createEl("div", {
				cls: "dashboard-section",
			});
			section.createEl("h3", { text: "⏰ Resurfacing now" });
			for (const { contact, idea } of due) {
				const row = section.createEl("div", {
					cls: "dashboard-row dashboard-row-clickable",
				});
				const cat = IDEA_CATEGORIES.find(
					(c) => c.id === idea.category
				);
				row.createSpan({
					text: `${cat?.emoji ?? "✨"} ${idea.text}`,
				});
				row.createSpan({
					cls: "dashboard-row-meta",
					text: contact.displayName,
				});
				row.addEventListener("click", () =>
					this.openContact(contact.file)
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
		const matches = this.contacts
			.filter(
				(c) =>
					!q ||
					c.displayName.toLowerCase().includes(q) ||
					c.name.toLowerCase().includes(q) ||
					c.groups.some((g) => g.includes(q))
			)
			.sort((a, b) => a.displayName.localeCompare(b.displayName));

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
				this.openContact(contact.file)
			);
		}
		if (matches.length === 0) {
			listEl.createEl("div", {
				cls: "section-helper-text",
				text: q ? "No friends match." : "No friends yet.",
			});
		}
	}

	private renderDiary(container: HTMLElement) {
		const section = container.createEl("div", {
			cls: "dashboard-section",
		});
		const header = section.createEl("div", {
			cls: "dashboard-section-header",
		});
		header.createEl("h3", { text: "📖 Diary" });
		const buttons = header.createEl("div", {
			cls: "dashboard-section-buttons",
		});
		const newButton = buttons.createEl("button", {
			cls: "friend-tracker-button",
			text: "New entry",
		});
		newButton.addEventListener("click", () =>
			this.plugin.openNewDiaryEntry()
		);
		const openButton = buttons.createEl("button", {
			cls: "friend-tracker-button",
			text: "Open diary",
		});
		openButton.addEventListener("click", () =>
			this.plugin.activateDiaryView()
		);

		const entries = this.plugin.diaryOperations
			.getEntriesMeta()
			.slice(0, 3);
		if (entries.length === 0) {
			section.createEl("div", {
				cls: "section-helper-text",
				text: "No entries yet — each one files under the date it's about.",
			});
			return;
		}

		for (const entry of entries) {
			const row = section.createEl("div", {
				cls: "dashboard-row dashboard-row-clickable",
			});
			row.createSpan({ text: entry.title });
			row.createSpan({
				cls: "dashboard-row-meta",
				text: this.formatEntryDate(entry.date),
			});
			row.addEventListener("click", async () => {
				await this.app.workspace.getLeaf(false).openFile(entry.file);
			});
		}
	}

	private formatEntryDate(dateStr: string): string {
		const [y, m, d] = dateStr.split("-").map(Number);
		if (!y || !m || !d) return dateStr;
		const date = new Date(y, m - 1, d);
		return date.toLocaleDateString("en-AU", {
			day: "numeric",
			month: "long",
			...(y !== new Date().getFullYear() && { year: "numeric" }),
		});
	}

	private renderGroups(container: HTMLElement) {
		const ops = this.plugin.contactOperations;
		const infos = ops.getGroupInfos(this.contacts);

		const section = container.createEl("div", {
			cls: "dashboard-section",
		});
		const header = section.createEl("div", {
			cls: "dashboard-section-header",
		});
		header.createEl("h3", { text: "👥 Groups" });
		const newButton = header.createEl("button", {
			cls: "friend-tracker-button",
			text: "New group",
		});
		newButton.addEventListener("click", () => {
			new GroupModal(this.app, this.plugin, null, async () => {
				await this.refresh();
			}).open();
		});

		if (infos.length === 0) {
			section.createEl("div", {
				cls: "section-helper-text",
				text: "Sort friends into circles — Family, Basketball… Groups can hold their own ideas too.",
			});
			return;
		}

		for (const info of infos) {
			const count = this.contacts.filter((c) =>
				c.groups.includes(info.name)
			).length;
			const row = section.createEl("div", { cls: "dashboard-row" });

			const label = row.createSpan({
				cls: "dashboard-row-clickable-label dashboard-group-label",
			});
			const dot = label.createEl("span", { cls: "group-dot" });
			dot.style.backgroundColor =
				info.color ?? "var(--background-modifier-border)";
			label.createSpan({ text: ops.prettyGroupName(info.name) });
			label.createSpan({
				cls: "dashboard-row-date",
				text: ` · ${count} member${count === 1 ? "" : "s"}`,
			});
			label.addEventListener("click", async () => {
				const file =
					info.file ?? (await ops.ensureGroupFile(info.name));
				await this.openContact(file);
			});

			const manageButton = row.createEl("button", {
				cls: "friend-tracker-button button-icon dashboard-row-action",
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
			section.createEl("div", {
				cls: "section-helper-text",
				text: `Nothing in the next ${HORIZON} days.`,
			});
			return;
		}

		for (const c of upcoming) {
			const row = section.createEl("div", {
				cls: "dashboard-row dashboard-row-clickable",
			});
			const days = c.daysUntilBirthday!;
			const when =
				days === 0
					? "today! 🎂"
					: days === 1
					? "tomorrow"
					: `in ${days} days`;
			const label = row.createSpan({
				text: `${c.displayName} — ${when}`,
			});
			if (days >= 1) {
				label.createSpan({
					cls: "dashboard-row-date",
					text: ` · ${this.formatDayDate(days)}`,
				});
			}
			const giftCount = c.ideas.filter(
				(i) => !i.done && i.category === "gift"
			).length;
			row.createSpan({
				cls: "dashboard-row-meta",
				text:
					giftCount > 0
						? `🎁 ${giftCount} idea${giftCount > 1 ? "s" : ""} saved`
						: "no gift ideas yet",
			});
			row.addEventListener("click", () => this.openContact(c.file));
		}
	}

	/** Human date offset from today, e.g. "Monday 16 July" */
	private formatDayDate(offsetDays: number): string {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		d.setDate(d.getDate() + offsetDays);
		return d.toLocaleDateString("en-AU", {
			weekday: "long",
			day: "numeric",
			month: "long",
		});
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
		const MISSED_HORIZON = 30;

		// Missed = passed within the window and not yet marked as wished
		const missed = this.contacts
			.filter(
				(c) =>
					c.daysSinceBirthday !== null &&
					c.daysSinceBirthday > 0 &&
					c.daysSinceBirthday <= MISSED_HORIZON &&
					c.birthdayWished !==
						this.lastOccurrenceDate(c.daysSinceBirthday)
			)
			.sort((a, b) => a.daysSinceBirthday! - b.daysSinceBirthday!);

		if (missed.length === 0) return;

		const section = container.createEl("div", {
			cls: "dashboard-section",
		});
		section.createEl("h3", { text: "🕯️ Missed birthdays" });

		for (const c of missed) {
			const row = section.createEl("div", { cls: "dashboard-row" });
			const label = row.createSpan({
				cls: "dashboard-row-clickable-label",
				text: `${c.displayName} — was ${
					c.daysSinceBirthday === 1
						? "yesterday"
						: `${c.daysSinceBirthday} days ago`
				}`,
			});
			label.createSpan({
				cls: "dashboard-row-date",
				text: ` · ${this.formatDayDate(-c.daysSinceBirthday!)}`,
			});
			label.addEventListener("click", () => this.openContact(c.file));

			const wishedButton = row.createEl("button", {
				cls: "friend-tracker-button dashboard-row-action",
				attr: { "aria-label": "Mark as wished" },
			});
			setIcon(wishedButton, "check");
			wishedButton.createSpan({ text: "Done" });
			wishedButton.addEventListener("click", async (e) => {
				e.stopPropagation();
				await this.plugin.contactOperations.markBirthdayWished(
					c.file,
					this.lastOccurrenceDate(c.daysSinceBirthday!)
				);
				new Notice(`🎈 Nice — ${c.displayName} checked off`);
				await this.refresh();
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
		const inboxIdeas =
			await this.plugin.contactOperations.getInboxIdeas();
		const open = inboxIdeas
			.map((idea, index) => ({ idea, index }))
			.filter(({ idea }) => !idea.done);
		if (open.length === 0) return;

		const section = container.createEl("div", {
			cls: "dashboard-section",
		});
		section.createEl("h3", { text: "📥 Idea inbox" });
		section.createEl("div", {
			cls: "section-helper-text",
			text: "Ideas you captured without picking a friend — file them when you know who they're for.",
		});
		for (const { idea, index } of open) {
			const row = section.createEl("div", { cls: "dashboard-row" });
			const cat = IDEA_CATEGORIES.find((c) => c.id === idea.category);
			row.createSpan({ text: `${cat?.emoji ?? "✨"} ${idea.text}` });
			const fileButton = row.createEl("button", {
				cls: "friend-tracker-button dashboard-row-action",
				text: "File to friend…",
			});
			fileButton.addEventListener("click", () => {
				new ContactSuggestModal(
					this.app,
					this.contacts,
					async (contact) => {
						const moved =
							await this.plugin.contactOperations.moveInboxIdea(
								index,
								contact.file
							);
						if (moved) {
							new Notice(
								`Filed to ${contact.displayName}`
							);
							await this.refresh();
						}
					},
					"File this idea to…"
				).open();
			});
		}
	}
}
