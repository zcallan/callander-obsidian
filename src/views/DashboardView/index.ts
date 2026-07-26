import { ItemView, WorkspaceLeaf, Notice, TFile, setIcon } from "obsidian";
import type FriendTracker from "@/main";
import type { ContactWithCountdown, Draft, Idea, SomedayInfo } from "@/types";
import {
	IDEA_CATEGORIES,
	formatSomedayDays,
	somedayTimeframe,
} from "@/constants";
import { SomedayModal } from "@/modals/SomedayModal";
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
} from "@/utils/flexdate";
import { PlanModal } from "@/modals/PlanModal";
import { PlanOperations } from "@/services/PlanOperations";

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
		action("pencil-line", "Quick note", () =>
			this.plugin.openQuickNote()
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

		// Drafts to triage — kept high so they don't rot
		await this.renderDrafts(container);

		// Birthdays: upcoming + missed (not yet wished)
		const upcomingSection = container.createEl("div", {
			cls: "dashboard-section",
		});
		upcomingSection.createEl("h3", { text: "🎂 Upcoming birthdays" });
		this.renderUpcomingBirthdays(upcomingSection);
		this.renderMissedBirthdays(container);

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

	private async renderDrafts(container: HTMLElement) {
		const ops = this.plugin.contactOperations;
		const inboxFile = this.app.vault.getAbstractFileByPath(
			ops.getInboxPath()
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

		const section = container.createEl("div", {
			cls: "dashboard-section",
		});
		section.createEl("h3", { text: "✏️ Drafts" });

		for (const item of all) {
			const row = section.createEl("div", { cls: "dashboard-row" });
			const label = row.createSpan({
				cls: item.contact
					? "dashboard-row-clickable-label"
					: undefined,
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
				label.addEventListener("click", () => this.openContact(file));
			}

			const ideaButton = row.createEl("button", {
				cls: "friend-tracker-button dashboard-row-action",
				text: "Make idea",
			});
			ideaButton.addEventListener("click", () =>
				this.categorizeDraft(item.holder, item.index, item.draft, item.contact)
			);

			const deleteButton = row.createEl("button", {
				cls: "friend-tracker-button button-icon button-danger dashboard-row-action dashboard-draft-delete",
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
						await this.plugin.refreshOpenContactPages(
							item.holder
						);
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

	private renderPlans(container: HTMLElement) {
		const plans = this.plugin.planOperations
			.getPlans()
			.filter((p) => p.status !== "done")
			.sort((a, b) => {
				const empty = { year: null, month: null, day: null };
				const keyA = parseFlexDate(a.date)
					? flexSortKey(parseFlexDate(a.date)!)
					: Number.MAX_SAFE_INTEGER;
				const keyB = parseFlexDate(b.date)
					? flexSortKey(parseFlexDate(b.date)!)
					: Number.MAX_SAFE_INTEGER;
				return keyA - keyB;
			});

		const section = container.createEl("div", {
			cls: "dashboard-section",
		});
		const header = section.createEl("div", {
			cls: "dashboard-section-header",
		});
		header.createEl("h3", { text: "🗺️ Plans" });
		const newButton = header.createEl("button", {
			cls: "friend-tracker-button",
			text: "New plan",
		});
		newButton.addEventListener("click", () => {
			new PlanModal(this.app, this.plugin, async (file) => {
				await this.plugin.openContactPage(file);
			}).open();
		});

		if (plans.length === 0) {
			section.createEl("div", {
				cls: "section-helper-text",
				text: "Something brewing? A weekend away, a dinner — plan it with the people it's for.",
			});
			return;
		}

		for (const plan of plans) {
			const row = section.createEl("div", {
				cls: "dashboard-row dashboard-row-clickable dashboard-diary-row dashboard-plan-row",
			});
			const main = row.createEl("div", {
				cls: "dashboard-diary-main",
			});
			main.createSpan({ text: plan.name });
			const metaParts: string[] = [];
			const dateFlex = parseFlexDate(plan.date);
			if (dateFlex) {
				const fmtDay = (y: number, m: number, d: number) =>
					new Date(y, m - 1, d).toLocaleDateString("en-AU", {
						weekday: "short",
						day: "numeric",
						month: "short",
					});
				let when = formatFlexDate(dateFlex);
				if (dateFlex.month !== null && dateFlex.day !== null) {
					const year =
						dateFlex.year ?? new Date().getFullYear();
					when = fmtDay(year, dateFlex.month, dateFlex.day);
					const endFlex = parseFlexDate(plan.endDate);
					if (
						endFlex &&
						endFlex.month !== null &&
						endFlex.day !== null
					) {
						when += ` - ${fmtDay(
							endFlex.year ?? year,
							endFlex.month,
							endFlex.day
						)}`;
					}
					const target = new Date(
						year,
						dateFlex.month - 1,
						dateFlex.day
					);
					target.setHours(0, 0, 0, 0);
					const today = new Date();
					today.setHours(0, 0, 0, 0);
					const days = Math.round(
						(target.getTime() - today.getTime()) / 86400000
					);
					if (days === 0) when += " · today!";
					else if (days > 0) when += ` · in ${days} days`;
					else when += " · passed — mark it done?";
				}
				metaParts.push(when);
			}
			if (metaParts.length > 0) {
				main.createSpan({
					cls: "dashboard-row-date",
					text: metaParts.join(" · "),
				});
			}

			// Second line: location, headcount, budget
			const detailParts: string[] = [];
			if (plan.location) detailParts.push(plan.location);
			if (plan.members.length > 0) {
				detailParts.push(
					`${plan.members.length} ${
						plan.members.length === 1 ? "person" : "people"
					}`
				);
			}
			const est = PlanOperations.estimate({
				items: plan.items,
			});
			if (est > 0) detailParts.push(`~$${est}`);
			if (detailParts.length > 0) {
				row.createEl("div", {
					cls: "dashboard-diary-tagged",
					text: detailParts.join(" · "),
				});
			}

			row.addEventListener("click", () =>
				this.openContact(plan.file)
			);
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

		const section = container.createEl("div", {
			cls: "dashboard-section",
		});
		const header = section.createEl("div", {
			cls: "dashboard-section-header",
		});
		header.createEl("h3", { text: "💭 Somedays" });
		const buttons = header.createEl("div", {
			cls: "dashboard-section-buttons",
		});
		const newButton = buttons.createEl("button", {
			cls: "friend-tracker-button",
			text: "New someday",
		});
		newButton.addEventListener("click", () => {
			new SomedayModal(this.app, this.plugin, null, async (file) => {
				await this.plugin.activateSomedays(file.path);
			}).open();
		});
		const allButton = buttons.createEl("button", {
			cls: "friend-tracker-button",
			text: "See all",
		});
		allButton.addEventListener("click", () =>
			this.plugin.activateSomedays()
		);

		if (somedays.length === 0) {
			section.createEl("div", {
				cls: "section-helper-text",
				text: "A park to visit, a bar to try, a trip you keep meaning to take — jot it before it slips.",
			});
			return;
		}

		for (const s of somedays.slice(0, 5)) {
			const row = section.createEl("div", {
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
			row.addEventListener("click", () =>
				this.plugin.activateSomedays(s.file.path)
			);
		}
		if (somedays.length > 5) {
			const more = section.createEl("div", {
				cls: "section-helper-text dashboard-row-clickable",
				text: `+${somedays.length - 5} more on the Somedays page`,
			});
			more.addEventListener("click", () =>
				this.plugin.activateSomedays()
			);
		}
	}

	private somedayWhen(s: SomedayInfo): string {
		const f = parseFlexDate(s.date);
		if (f) return formatFlexDate(f);
		if (s.timeframe) {
			const tf = somedayTimeframe(s.timeframe);
			return tf ? `${tf.emoji} ${tf.label}` : s.timeframe;
		}
		return "";
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

		const resolvedLinks = this.app.metadataCache.resolvedLinks;
		for (const entry of entries) {
			const row = section.createEl("div", {
				cls: "dashboard-row dashboard-row-clickable dashboard-diary-row",
			});
			const main = row.createEl("div", {
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
				row.createEl("div", {
					cls: "dashboard-diary-tagged",
					text: detailParts.join(" · "),
				});
			}

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
			weekday: "short",
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
			cls: "dashboard-section dashboard-missed-section",
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
