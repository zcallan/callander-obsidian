import {
	ItemView,
	WorkspaceLeaf,
	Notice,
	TFile,
	setIcon,
	parseYaml,
	MarkdownRenderer,
	type ViewStateResult,
} from "obsidian";
import type FriendTracker from "@/main";
import { ContactFields } from "@/components/ContactFields";
import { EventTimeline } from "@/components/EventTimeline";
import type {
	ContactWithCountdown,
	FriendEvent,
	Idea,
	InsideJoke,
	Interest,
	Quote,
} from "@/types";
import { AddFieldModal } from "@/modals/AddFieldModal";
import { createBirthdayPrecisionInput } from "@/components/BirthdayInput";
import { createFlexDateInput } from "@/components/FlexDateInput";
import { EventModal } from "@/modals/EventModal";
import { ResurfaceModal } from "@/modals/ResurfaceModal";
import { ConfirmModal } from "@/modals/ConfirmModal";
import { ContactSuggestModal, QuickIdeaModal } from "@/modals/QuickIdeaModal";
import { VIEW_TYPE_FRIEND_TRACKER } from "@/views/FriendTrackerView";
import { FriendTrackerView } from "@/views/FriendTrackerView";
import {
	STANDARD_FIELDS,
	SYSTEM_FIELDS,
	IDEA_CATEGORIES,
	IdeaCategory,
	INTEREST_CATEGORIES,
	InterestCategory,
	EventType,
	PLAN_IDEA_CATEGORIES,
	TRAVEL_TYPES,
	TRAVEL_TYPE_EMOJI,
	ACCOMMODATION_EMOJI,
	BOOKING_STATES,
} from "@/constants";
import type {
	PlanCost,
	PlanCredit,
	PlanItem,
	PlanSimpleItem,
	PlanTimelineEntry,
} from "@/types";
import { PlanOperations } from "@/services/PlanOperations";
import { PlanDetailsModal } from "@/modals/PlanDetailsModal";
import { AddPlanMemberModal } from "@/modals/AddPlanMemberModal";
import { PlanItemModal } from "@/modals/PlanItemModal";
import { PlanSimpleItemModal } from "@/modals/PlanSimpleItemModal";
import { PlanTimelineViewModal } from "@/modals/PlanTimelineViewModal";
import {
	buildPlanShareText,
	formatPlanDateRange,
} from "@/utils/planShare";
import {
	formatItemCost,
	formatItemTime,
	formatTimelineDay,
	nightsLabel,
	nightsSummary,
} from "@/utils/planFormat";
import { ScheduleFieldOptions } from "@/modals/scheduleFields";
import { InterestModal } from "@/modals/InterestModal";
import { PlanCostModal } from "@/modals/PlanCostModal";
import { PlanCostBreakdownModal } from "@/modals/PlanCostBreakdownModal";
import { PlanCreditModal } from "@/modals/PlanCreditModal";
import { CopyEventModal } from "@/modals/CopyEventModal";
import { NoteInputModal } from "@/modals/NoteInputModal";
import { FunFactsModal } from "@/modals/FunFactsModal";
import { QuoteModal } from "@/modals/QuoteModal";
import { InsideJokeModal } from "@/modals/InsideJokeModal";
import {
	parseFlexDate,
	formatFlexDate,
	formatTimeSince,
	flexSortKey,
	monthName,
	todayISO,
} from "@/utils/flexdate";
import { asArray, fieldOf, isRecord, toText } from "@/utils/fm";

export const VIEW_TYPE_CONTACT_PAGE = "contact-page-view";

/** Scalar frontmatter keys the page binds directly into string inputs. */
const SCALAR_FIELDS = [
	"name",
	"displayName",
	"birthday",
	"relationship",
	"met",
	"notes",
	"date",
	"endDate",
	"location",
	"status",
] as const;

/**
 * The parsed YAML of a contact/plan/group page. Scalars the page binds as
 * strings are typed (coerced once in normalizeFrontmatter); collections stay
 * `unknown` and flow through the service readers (ideasOf, eventsOf,
 * itemsOf, ...) that validate their shapes. The index signature carries
 * user-defined custom fields.
 */
interface ContactFrontmatter {
	name?: string;
	displayName?: string;
	birthday?: string;
	relationship?: string;
	met?: string;
	notes?: string;
	date?: string;
	endDate?: string;
	location?: string;
	status?: string;
	ideas?: unknown;
	events?: unknown;
	drafts?: unknown;
	items?: unknown;
	travel?: unknown;
	accommodation?: unknown;
	bring?: unknown;
	costs?: unknown;
	credits?: unknown;
	costsPaid?: unknown;
	members?: unknown;
	unconfirmedMembers?: unknown;
	interests?: unknown;
	quotes?: unknown;
	insideJokes?: unknown;
	funFacts?: unknown;
	groups?: unknown;
	/** Legacy keys, folded into ideas/events by the in-memory migrations */
	giftIdeas?: unknown;
	interactions?: unknown;
	[key: string]: unknown;
}

/** YAML-shaped unknown → ContactFrontmatter, coercing bound scalars once. */
function toContactFrontmatter(parsed: unknown): ContactFrontmatter {
	if (!isRecord(parsed)) return {};
	const data = parsed as ContactFrontmatter;
	for (const key of SCALAR_FIELDS) {
		const value = parsed[key];
		if (value != null && typeof value !== "string") {
			data[key] = toText(value);
		}
	}
	return data;
}

export class ContactPageView extends ItemView {
	private _file: TFile | null = null;
	private contactData: ContactFrontmatter = {};
	private contactFields: ContactFields;
	private eventTimeline: EventTimeline;
	public plugin: FriendTracker;
	private lastIdeaCategory: IdeaCategory = "gift";
	private lastInterestCategory: InterestCategory = "hobbies";
	// Which collapsible plan sections are expanded (persists across re-renders)
	private expandedPlanSections = new Set<string>();
	// The friend "General" info accordion — collapsed by default
	private expandedInfoSection = false;
	/** Guards against reacting to our own writes */
	private writingUntil = 0;

	public getRelationshipTypes(): string[] {
		return this.plugin.settings.relationshipTypes;
	}

	/** In-memory events, post-migration — the same array reference. */
	private eventsList(): FriendEvent[] {
		return asArray(this.contactData.events) as FriendEvent[];
	}

	/** In-memory ideas, post-migration — the same array reference. */
	private ideasList(): Idea[] {
		return asArray(this.contactData.ideas) as Idea[];
	}

	/** Append to a frontmatter list, creating it when absent. */
	private pushToList(key: string, value: unknown) {
		const list = asArray(this.contactData[key]);
		list.push(value);
		this.contactData[key] = list;
	}

	/** Splice one entry out of a frontmatter list; empty lists drop the key. */
	private removeFromList(key: string, index: number) {
		const list = asArray(this.contactData[key]);
		list.splice(index, 1);
		if (list.length === 0) delete this.contactData[key];
		else this.contactData[key] = list;
	}

	public async addRelationshipType(
		type: string,
		existingTypes?: string[]
	): Promise<void> {
		this.plugin.settings.relationshipTypes = [
			...(existingTypes || this.plugin.settings.relationshipTypes),
			type,
		];
		await this.plugin.saveSettings();
	}

	constructor(leaf: WorkspaceLeaf, private _plugin: FriendTracker) {
		super(leaf);
		this.plugin = _plugin;
		this.contactFields = new ContactFields(this);
		this.eventTimeline = new EventTimeline(this);
		// Participate in tab history so back/forward arrows work
		this.navigation = true;
	}

	async onOpen() {
		// Reload when this record changes on disk (e.g. an iCloud sync from
		// another device), so an edit here can never overwrite fresher data
		// with a stale in-memory copy.
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (
					this._file &&
					file.path === this._file.path &&
					Date.now() > this.writingUntil &&
					!this.isEditingInView()
				) {
					void this.setFile(this._file);
				}
			})
		);
	}

	/** True if an input/textarea inside this view has focus (mid-edit) */
	private isEditingInView(): boolean {
		const active = document.activeElement as HTMLElement | null;
		return (
			!!active &&
			this.containerEl.contains(active) &&
			["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)
		);
	}

	getViewType(): string {
		return VIEW_TYPE_CONTACT_PAGE;
	}

	getDisplayText(): string {
		return this._file?.basename || "Contact";
	}

	get file() {
		return this._file;
	}

	async setState(state: unknown, result: ViewStateResult) {
		const filePath = fieldOf(state, "filePath");
		const file =
			typeof filePath === "string"
				? this.app.vault.getFileByPath(filePath)
				: null;
		const fileChanged = !!file && file.path !== this._file?.path;
		if (file) {
			await this.setFile(file);
		}
		// Friend → friend navigation keeps the same view type, and Obsidian
		// only records tab history for same-type navigation when the view
		// reports that its state changed (as FileView does for files).
		if (fileChanged && result) {
			result.history = true;
			// `layout` isn't in the typed API, but same-type navigation only
			// lands in tab history when it's set — keep the write.
			(result as ViewStateResult & { layout?: boolean }).layout = true;
		}
		await super.setState(state, result);
	}

	getState() {
		return {
			type: VIEW_TYPE_CONTACT_PAGE,
			filePath: this._file?.path,
		};
	}

	async setFile(file: TFile) {
		this._file = file;
		const currentFilePath = file.path;
		try {
			const content = await this.app.vault.cachedRead(file);
			// Only update if this._file is still the same file
			if (this._file?.path !== currentFilePath) return;
			const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
			const parsed: unknown = yamlMatch ? parseYaml(yamlMatch[1]) : {};
			this.contactData = toContactFrontmatter(parsed);
			this.migrateLegacyGiftIdeas();
			this.migrateLegacyInteractions();
			this.migratePlanStructure();
		} catch (error) {
			console.error(`Error reading contact file ${file.path}:`, error);
			this.contactData = {};
		}
		// Only render if still the same file
		if (this._file?.path === currentFilePath) {
			this.render();
		}
	}

	render() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();

		if (!this.contactData || !this.contactData.name) {
			container.createDiv({
				text: "No contact data available",
				cls: "contact-empty-state",
			});
			return;
		}

		// Header with name
		const header = container.createDiv({
			cls: "contact-page-header",
		});
		const nameContainer = header.createDiv({
			cls: "contact-name-container",
		});
		this.renderNameSection(nameContainer);

		// Plans: date/location (+ "Edit details") under "Last updated"; actions
		// top-right (Quick note · Mark as done), stacked below on mobile.
		if (this.isPlanFile()) {
			header.addClass("plan-page-header");
			this.renderPlanMetaLines(nameContainer);

			const actions = header.createDiv({
				cls: "contact-header-actions plan-page-actions",
			});
			const noteButton = actions.createEl("button", {
				cls: "callander-button contact-header-action",
				attr: { "aria-label": "Quick note" },
			});
			setIcon(noteButton, "pencil-line");
			noteButton.createSpan({ text: "Quick note" });
			noteButton.addEventListener("click", () => this.openQuickNote());

			this.createPlanDoneButton(actions);
		}

		// Quick actions, top-right (friends only)
		if (!this.isGroupFile() && !this.isPlanFile()) {
			const actions = header.createDiv({
				cls: "contact-header-actions",
			});
			const action = (
				icon: string,
				label: string,
				onClick: () => void | Promise<void>
			) => {
				const btn = actions.createEl("button", {
					cls: "callander-button contact-header-action",
				});
				setIcon(btn, icon);
				btn.createSpan({ text: label });
				btn.addEventListener("click", () => void onClick());
			};
			action("lightbulb", "Add idea", () => this.openAddIdeaModal());
			action("milestone", "Add event", () => this.openAddEventModal());
			action("pencil-line", "Quick note", () => this.openQuickNote());
		}

		// Plans are their own page shape: members, buckets, notes
		if (this.isPlanFile()) {
			this.renderPlanDrafts(container);

			const planContent = container.createDiv({
				cls: "contact-content contact-content-stacked",
			});
			const planSection = (icon: string, label: string) => {
				const wrap = planContent.createDiv({
					cls: "contact-stack-section",
				});
				const header = wrap.createDiv({
					cls: "contact-stack-header",
				});
				setIcon(
					header.createSpan({ cls: "contact-stack-header-icon" }),
					icon
				);
				header.createSpan({ text: label });
				return wrap;
			};

			void this.renderPlanMembers(
				planSection("users", `Who's in (${this.planMemberCount()})`)
			);
			this.renderPlanTimeline(planSection("calendar-clock", "Timeline"));
			this.renderPlanSimpleList(
				planSection("bed", "Accommodation"),
				"accommodation",
				"Add accommodation"
			);
			this.renderPlanBring(planSection("backpack", "What to bring"));
			this.renderPlanCosts(planSection("dollar-sign", "Cost breakdown"));
			this.renderNotesSection(planSection("pencil", "Notes"));
			void this.renderExtrasSection(
				planSection("document", "Links & details")
			);
			return;
		}

		// Friends get the attribute fields; groups get a members list instead
		if (this.isGroupFile()) {
			const membersSection = container.createDiv({
				cls: "contact-info-section",
			});
			void this.renderGroupMembers(membersSection);
		} else {
			// "General" — a collapsed accordion of the attribute fields
			const infoWrap = container.createDiv({
				cls: "contact-stack-section plan-accordion contact-general-accordion",
			});
			const infoHeader = infoWrap.createDiv({
				cls: "contact-stack-header plan-accordion-header",
			});
			setIcon(
				infoHeader.createSpan({ cls: "contact-stack-header-icon" }),
				"user"
			);
			infoHeader.createSpan({
				cls: "plan-accordion-label",
				text: "About",
			});
			setIcon(
				infoHeader.createSpan({ cls: "plan-accordion-chevron" }),
				"chevron-down"
			);
			const infoBody = infoWrap.createDiv({
				cls: "plan-accordion-body",
			});
			const infoSection = infoBody.createDiv({
				cls: "contact-info-section",
			});
			this.renderInfoSection(infoSection);
			infoWrap.toggleClass("is-open", this.expandedInfoSection);
			infoHeader.addEventListener("click", () => {
				this.expandedInfoSection = !this.expandedInfoSection;
				infoWrap.toggleClass("is-open", this.expandedInfoSection);
			});
		}

		// Drafts awaiting triage sit above everything — they're unfinished
		this.renderDraftsStrip(container);

		// Stacked sections: Ideas first, then Timeline, then Notes, then
		// the raw-markdown extras. (Tabs may return one day — each section
		// is still its own render method, so flipping back is trivial.)
		const contentContainer = container.createDiv({
			cls: "contact-content contact-content-stacked",
		});

		const section = (icon: string, label: string) => {
			const wrap = contentContainer.createDiv({
				cls: "contact-stack-section",
			});
			const header = wrap.createDiv({
				cls: "contact-stack-header",
			});
			setIcon(
				header.createSpan({ cls: "contact-stack-header-icon" }),
				icon
			);
			header.createSpan({ text: label });
			return wrap;
		};

		this.renderIdeasSection(section("lightbulb", "Ideas"));
		this.renderEventsSection(section("milestone", "Timeline"));
		// Interests + fun facts + jokes + quotes are about the friend —
		// friends only
		if (!this.isGroupFile()) {
			this.renderInterestsSection(section("heart", "Interests"));
			this.renderFunFactsSection(section("sparkles", "Fun facts"));
			this.renderInsideJokesSection(section("laugh", "Inside jokes"));
			this.renderQuotesSection(section("quote", "Quotes"));
		}
		this.renderNotesSection(section("pencil", "Notes"));
		void this.renderExtrasSection(section("document", "Markdown"));
	}

	private renderNameSection(container: HTMLElement) {
		const nameSection = container.createDiv({
			cls: "contact-name-section",
		});

		const nameDisplay = nameSection.createDiv({
			cls: "contact-name-display",
		});

		const editContainer = nameDisplay.createDiv({
			cls: "contact-name-row",
		});

		const nameText = editContainer.createEl("h1", {
			text:
				this.contactData.displayName ||
				this.contactData.name ||
				"Unnamed Contact",
		});

		// Plans: the name is edited through "Edit details" instead of an
		// inline pencil, and long trip names wrap rather than overflow
		if (this.isPlanFile()) {
			nameText.addClass("contact-name-wrap");
			return;
		}

		const nameInput = editContainer.createEl("input", {
			type: "text",
			value: this.contactData.name || "",
			placeholder: "Contact name",
			cls: "contact-name-input",
		});

		const editButton = editContainer.createEl("button", {
			cls: "callander-button button-icon contact-name-edit",
		});
		setIcon(editButton, "pencil");

		// Add birthday-derived details, at whatever precision is recorded
		const birthdayValue = this.contactData.birthday ?? "";
		const birthdayFlex = parseFlexDate(birthdayValue);
		if (birthdayFlex && birthdayFlex.month) {
			const { year, month, day } = birthdayFlex;

			// Age is only known when the year is
			if (year !== null) {
				const ageText =
					this.plugin.contactOperations.calculateDetailedAge(
						birthdayValue
					);
				if (ageText) {
					nameDisplay.createSpan({
						text: ageText,
						cls: "contact-age-display",
					});
				}
			}

			// Birthday, at whatever precision is recorded (en-AU: day month year).
			// When the exact day is known, a relative countdown joins the same line.
			const birthdayText =
				day !== null && year !== null
					? `${day} ${monthName(month)} ${year}`
					: day !== null
					? `${day} ${monthName(month)}`
					: year !== null
					? `${monthName(month)} ${year}`
					: monthName(month);

			let relativeText: string | null = null;
			if (day !== null) {
				const daysUntil = this.calculateDaysUntilBirthday(
					birthdayValue
				);
				const daysSince =
					this.plugin.contactOperations.calculateDaysSinceBirthday(
						birthdayValue
					);

				if (daysUntil === 0) {
					relativeText = "today 🎂";
				} else if (
					daysSince !== null &&
					daysSince > 0 &&
					daysSince <= 30
				) {
					relativeText =
						daysSince === 1 ? "1 day ago" : `${daysSince} days ago`;
				} else if (daysUntil !== null) {
					relativeText =
						daysUntil === 1 ? "in 1 day" : `in ${daysUntil} days`;
				}
			}

			nameDisplay.createSpan({
				text: relativeText
					? `Birthday: ${birthdayText} • ${relativeText}`
					: `Birthday: ${birthdayText}`,
				cls: "contact-age-display",
			});

			// Day unknown: keep a lightweight month-level countdown, only when near
			if (day === null) {
				const countdownContainer = nameDisplay.createDiv({
					cls: "contact-birthday-countdown",
				});
				const nowMonth = new Date().getMonth() + 1;
				const monthsAway = (month - nowMonth + 12) % 12;
				if (monthsAway > 3) {
					countdownContainer.remove();
				} else {
					countdownContainer.createSpan({
						text:
							month === nowMonth
								? "🎂 Birthday this month"
								: `Birthday in ${formatFlexDate({
										year: null,
										month,
										day: null,
								  })}`,
					});
				}
			}

			// Optional birthday trivia, each behind a setting
			const s = this.plugin.settings;
			if (day !== null && s.showStarSign) {
				nameDisplay.createSpan({
					text: `Star sign: ${this.getZodiacSign(month, day)}`,
					cls: "contact-age-display",
				});
			}
			if (year !== null && s.showChineseZodiac) {
				nameDisplay.createSpan({
					text: `Zodiac: ${this.getChineseZodiac(year)}`,
					cls: "contact-age-display",
				});
			}
			if (s.showBirthstone) {
				nameDisplay.createSpan({
					text: `Birthstone: ${this.getBirthstone(month)}`,
					cls: "contact-age-display",
				});
			}
			if (s.showBirthFlower) {
				nameDisplay.createSpan({
					text: `Birth flower: ${this.getBirthFlower(month)}`,
					cls: "contact-age-display",
				});
			}
		}

		// When a display name is in use, show the real name quietly
		if (
			this.contactData.displayName &&
			this.contactData.displayName !== this.contactData.name
		) {
			nameDisplay.createSpan({
				text: `Full name: ${this.contactData.name}`,
				cls: "contact-age-display",
			});
		}

		// Last updated — from the file itself, so edits made anywhere count
		if (this._file) {
			const mtime = new Date(this._file.stat.mtime);
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const mtimeDay = new Date(mtime);
			mtimeDay.setHours(0, 0, 0, 0);
			const daysAgo = Math.round(
				(today.getTime() - mtimeDay.getTime()) / 86400000
			);
			const label =
				daysAgo === 0
					? "today"
					: daysAgo === 1
					? "yesterday"
					: daysAgo <= 30
					? `${daysAgo} days ago`
					: mtime.toLocaleDateString("en-AU", {
							day: "numeric",
							month: "long",
							year: "numeric",
					  });
			nameDisplay.createSpan({
				cls: "contact-age-display contact-last-updated",
				text: `Last updated: ${label}`,
			});
		}

		editButton.addEventListener("click", () => {
			if (!nameInput.classList.contains("editing")) {
				nameText.classList.add("editing");
				nameInput.classList.add("editing");
				setIcon(editButton, "checkmark");
				nameInput.focus();
			} else {
				void saveNameChange();
			}
		});

		const saveNameChange = async () => {
			if (!this._file) return;
			const newName = nameInput.value.trim();
			if (newName) {
				this.contactData.name = nameInput.value;
				await this.saveContactData();

				// Rename the file
				if (this._file.parent) {
					const newPath = `${this._file.parent.path}/${newName}.md`;
					try {
						await this.app.fileManager.renameFile(
							this._file,
							newPath
						);
						new Notice(`Updated contact name`);

						// Refresh Friend Tracker view
						const friendTrackerLeaves =
							this.app.workspace.getLeavesOfType(
								VIEW_TYPE_FRIEND_TRACKER
							);
						for (const leaf of friendTrackerLeaves) {
							const view = leaf.view;
							if (view instanceof FriendTrackerView) {
								await view.refresh();
								break;
							}
						}
					} catch (error) {
						new Notice(`Error updating file name: ${error}`);
					}
				}
			}
			nameText.textContent = nameInput.value || "Unnamed Contact";
			nameText.classList.remove("editing");
			nameInput.classList.remove("editing");
			setIcon(editButton, "pencil");
		};

		nameInput.addEventListener("change", () => void saveNameChange());
	}

	private calculateDaysUntilBirthday(birthday: string): number | null {
		return this.plugin.contactOperations.calculateDaysUntilBirthday(
			birthday
		);
	}

	private getZodiacSign(month: number, day: number): string {
		if ((month === 3 && day >= 21) || (month === 4 && day <= 19))
			return "Aries";
		if ((month === 4 && day >= 20) || (month === 5 && day <= 20))
			return "Taurus";
		if ((month === 5 && day >= 21) || (month === 6 && day <= 20))
			return "Gemini";
		if ((month === 6 && day >= 21) || (month === 7 && day <= 22))
			return "Cancer";
		if ((month === 7 && day >= 23) || (month === 8 && day <= 22))
			return "Leo";
		if ((month === 8 && day >= 23) || (month === 9 && day <= 22))
			return "Virgo";
		if ((month === 9 && day >= 23) || (month === 10 && day <= 22))
			return "Libra";
		if ((month === 10 && day >= 23) || (month === 11 && day <= 21))
			return "Scorpio";
		if ((month === 11 && day >= 22) || (month === 12 && day <= 21))
			return "Sagittarius";
		if ((month === 12 && day >= 22) || (month === 1 && day <= 19))
			return "Capricorn";
		if ((month === 1 && day >= 20) || (month === 2 && day <= 18))
			return "Aquarius";
		return "Pisces";
	}

	private getChineseZodiac(year: number): string {
		const animals = [
			"Rat",
			"Ox",
			"Tiger",
			"Rabbit",
			"Dragon",
			"Snake",
			"Horse",
			"Goat",
			"Monkey",
			"Rooster",
			"Dog",
			"Pig",
		];
		return `Year of the ${animals[(year - 4) % 12]}`;
	}

	private getBirthFlower(month: number): string {
		const flowers = [
			"Carnation",
			"Violet",
			"Daffodil",
			"Daisy",
			"Lily of the valley",
			"Rose",
			"Larkspur",
			"Gladiolus",
			"Aster",
			"Marigold",
			"Chrysanthemum",
			"Narcissus",
		];
		return flowers[month - 1] ?? "Unknown";
	}

	private getBirthstone(month: number): string {
		const stones: Record<number, string> = {
			1: "Garnet",
			2: "Amethyst",
			3: "Aquamarine",
			4: "Diamond",
			5: "Emerald",
			6: "Pearl",
			7: "Ruby",
			8: "Peridot",
			9: "Sapphire",
			10: "Opal",
			11: "Topaz",
			12: "Turquoise",
		};
		return stones[month] || "Unknown";
	}

	private renderInfoSection(container: HTMLElement) {
		// container is already a .contact-info-section — no second wrapper,
		// so the fields span the page like every other section
		const fieldsContainer = container.createDiv({
			cls: "contact-fields-container",
		});

		const renderViewMode = () => {
			fieldsContainer.empty();
			fieldsContainer.classList.remove("editing");

			// Render each field as read-only text
			Object.entries(this.contactData)
				.filter(
					([key]) =>
						![
							"name",
							"notes",
							"events",
							"interactions",
							"ideas",
							"giftIdeas",
							"drafts",
							"interests",
							"funFacts",
							"quotes",
							"birthdayWished",
							"created",
							"updated",
						].includes(key)
				)
				.forEach(([key, value]) => {
					if (!value) return; // Skip empty values
					if (Array.isArray(value) && value.length === 0) return;

					const field = fieldsContainer.createDiv({
						cls: "contact-field-view",
						attr: {
							"data-field": key.toLowerCase(),
						},
					});

					field.createDiv({
						cls: "contact-field-label",
						text: key,
					});

					// Groups render as colored chips, not plain text
					if (key === "groups" && Array.isArray(value)) {
						const ops = this.plugin.contactOperations;
						const colorOf = new Map(
							ops.getGroupInfos().map((i) => [i.name, i.color])
						);
						const chips = field.createDiv({
							cls: "contact-group-chips",
						});
						for (const g of value.map(String)) {
							const chip = chips.createSpan({
								cls: "contact-group-chip readonly",
							});
							const dot = chip.createSpan({
								cls: "group-dot",
							});
							dot.style.backgroundColor =
								colorOf.get(g) ??
								"var(--background-modifier-border)";
							chip.createSpan({
								text: ops.prettyGroupName(g),
							});
						}
						return;
					}

					// Format flexible dates at their recorded precision
					const displayValue = (() => {
						if (Array.isArray(value)) {
							return value.map(String).join(", ");
						}
						if ((key === "birthday" || key === "met") && value) {
							const parsed = parseFlexDate(
								value as string | number
							);
							if (parsed) {
								if (key === "met") {
									const since = formatTimeSince(parsed);
									return `${formatFlexDate(parsed)}${
										since ? ` (${since})` : ""
									}`;
								}
								return formatFlexDate(parsed);
							}
						}
						return value;
					})();

					field.createDiv({
						cls: "contact-field-value",
						text: displayValue as string,
					});
				});

			// Add edit button at the bottom
			const editButton = fieldsContainer.createEl("button", {
				cls: "callander-button",
				text: "Edit",
			});

			editButton.addEventListener("click", () => {
				renderEditMode();
			});
		};

		const renderEditMode = () => {
			fieldsContainer.empty();
			fieldsContainer.classList.add("editing");

			// Standard fields first
			Object.values(STANDARD_FIELDS)
				.filter((field) => !SYSTEM_FIELDS.includes(field))
				.forEach((field) => {
					if (field === STANDARD_FIELDS.MET) {
						this.createMetField(fieldsContainer);
					} else if (field === STANDARD_FIELDS.BIRTHDAY) {
						this.createBirthdayField(fieldsContainer);
					} else if (field === STANDARD_FIELDS.GROUPS) {
						this.createGroupsField(fieldsContainer);
					} else {
						this.createInfoField(
							fieldsContainer,
							field,
							toText(this.contactData[field])
						);
					}
				});

			// Then custom fields
			const excludedFields = [
				...SYSTEM_FIELDS,
				...Object.values(STANDARD_FIELDS).map((f) => f.toLowerCase()),
				"created",
				"updated",
			];
			Object.entries(this.contactData)
				.filter(([key]) => !excludedFields.includes(key.toLowerCase()))
				.forEach(([key, value]) => {
					this.createInfoField(fieldsContainer, key, value as string);
				});

			// Add custom field button
			const addFieldButton = fieldsContainer.createEl("button", {
				cls: "callander-button button-outlined",
				text: "Add custom field",
			});
			addFieldButton.addEventListener("click", () => {
				void this.openAddFieldModal();
			});

			// Add done button
			const doneButton = fieldsContainer.createEl("button", {
				cls: "callander-button button-primary button-full-width",
				text: "Done",
			});

			const handleDone = async () => {
				await this.saveContactData();
				renderViewMode();
			};
			doneButton.addEventListener("click", () => void handleDone());
		};

		// Initial render in view mode
		renderViewMode();
	}

	/**
	 * "When we met" with honest vagueness: record just the year, the month,
	 * or the exact day — whatever you actually remember.
	 */
	private createMetField(container: HTMLElement) {
		const fieldContainer = container.createDiv({
			cls: "contact-field",
		});

		fieldContainer.createEl("label", { text: "met" });

		createFlexDateInput(fieldContainer, this.contactData.met, (value) => {
			void this.updateContactData("met", value);
		});
	}

	/**
	 * Birthday with honest imprecision: exact date, month + year (day
	 * unknown), or month + day (year unknown).
	 */
	private createBirthdayField(container: HTMLElement) {
		const fieldContainer = container.createDiv({
			cls: "contact-field",
		});

		fieldContainer.createEl("label", { text: "birthday" });

		createBirthdayPrecisionInput(
			fieldContainer,
			this.contactData.birthday,
			(value) => {
				void this.updateContactData("birthday", value);
			}
		);
	}

	/** Groups as toggle chips with color dots; new groups via a small input */
	private createGroupsField(container: HTMLElement) {
		const ops = this.plugin.contactOperations;
		const fieldContainer = container.createDiv({
			cls: "contact-field contact-field-groups",
		});
		fieldContainer.createEl("label", { text: "groups" });

		const wrap = fieldContainer.createDiv({
			cls: "contact-groups-edit",
		});
		const chipsRow = wrap.createDiv({ cls: "contact-group-chips" });

		const member = new Set<string>(
			Array.isArray(this.contactData.groups)
				? this.contactData.groups
				: []
		);
		const infos = ops.getGroupInfos();
		const colorOf = new Map(infos.map((i) => [i.name, i.color]));
		const known = [
			...new Set([...infos.map((i) => i.name), ...member]),
		].sort();

		const save = () => {
			void this.updateContactData("groups", [...member].sort());
		};

		const addChip = (name: string) => {
			const chip = chipsRow.createEl("button", {
				cls: `contact-group-chip ${member.has(name) ? "selected" : ""}`,
			});
			const dot = chip.createSpan({ cls: "group-dot" });
			dot.style.backgroundColor =
				colorOf.get(name) ?? "var(--background-modifier-border)";
			chip.createSpan({ text: ops.prettyGroupName(name) });
			chip.addEventListener("click", () => {
				member.has(name) ? member.delete(name) : member.add(name);
				chip.toggleClass("selected", member.has(name));
				save();
			});
		};
		known.forEach(addChip);

		// Group creation lives on the dashboard — here you only toggle
		if (known.length === 0) {
			wrap.createDiv({
				cls: "section-helper-text",
				text: "No groups yet — create them from the dashboard.",
			});
		}
	}

	private createInfoField(
		container: HTMLElement,
		field: string,
		value: string
	) {
		const fieldContainer = container.createDiv({
			cls: "contact-field",
		});

		fieldContainer.createEl("label", {
			text: field,
		});

		const input = fieldContainer.createEl("input", {
			cls: "contact-field-input",
			attr: {
				type: field === "birthday" ? "date" : "text",
				placeholder: `Enter ${field.toLowerCase()}`,
				value: value || "",
				...(field === "relationship" && {
					list: "relationship-types",
				}),
			},
		});

		input.addEventListener("change", () => {
			void this.updateContactData(field, input.value);
		});
	}

	// A checked-off idea is usually something that just happened — offer to
	// put it on the timeline with one click
	private offerLogAsEvent(idea: Idea) {
		const verbs: Partial<Record<IdeaCategory, string>> = {
			gift: "Gave",
			conversation: "Talked about",
			activity: "Did",
			place: "Went to",
			recommendation: "Recommended",
			other: "",
		};
		const verb = verbs[this.normalizeCategory(idea)];
		const eventText = verb ? `${verb}: ${idea.text}` : idea.text;

		const fragment = createFragment();
		fragment.createSpan({ text: "Idea done! " });
		const logButton = fragment.createEl("button", {
			cls: "callander-button contact-log-event-button",
			text: "Log on timeline",
		});

		const notice = new Notice(fragment, 8000);
		const logIdeaAsEvent = async () => {
			notice.hide();
			const today = new Date().toISOString().split("T")[0];
			// Gifts given get their own type; everything else was time spent
			const type: EventType =
				this.normalizeCategory(idea) === "gift" ? "given" : "hangout";
			await this.addEvent(today, eventText, type);
			new Notice("Added to timeline");
		};
		logButton.addEventListener("click", () => void logIdeaAsEvent());
	}

	private renderNotesSection(container: HTMLElement) {
		const notesSection = container.createDiv({
			cls: "contact-notes-section",
		});

		// Placeholder reads differently for plans, groups, and friends
		const placeholder = this.isPlanFile()
			? "Anything else about the plan — booking details, addresses, who's driving..."
			: this.isGroupFile()
			? "Notes about this group — running jokes, how you all met, anything worth remembering..."
			: "Add notes about anything here that you want to remember...";

		const notesInput = notesSection.createEl("textarea", {
			cls: "contact-notes-input",
			attr: { placeholder },
		});
		notesInput.value = this.contactData.notes || "";

		notesInput.addEventListener("input", () => {
			this.adjustTextareaHeight(notesInput);
		});

		window.setTimeout(() => {
			this.adjustTextareaHeight(notesInput);
		}, 0);

		notesInput.addEventListener("change", () => {
			if (!this._file) return;
			this.contactData.notes = notesInput.value;
			void this.saveContactData();
		});
	}

	private renderEventsSection(container: HTMLElement) {
		const eventsSection = container.createDiv({
			cls: "contact-events-section",
		});

		const headerContainer = eventsSection.createDiv({
			cls: "contact-events-header",
		});

		const events = this.eventsList();

		// Add helper text if no events yet
		if (events.length === 0) {
			headerContainer.createDiv({
				cls: "section-helper-text",
				text: "Log things that happened — meetups, their life events, memorable outings.",
			});
		}

		if (events.length > 0 || this.contactData.met) {
			this.eventTimeline.render(
				eventsSection,
				events,
				this.contactData.met
			);
		}

		// Add button sits below the timeline
		const footer = eventsSection.createDiv({
			cls: "contact-section-footer",
		});
		const addButton = footer.createEl("button", {
			cls: "callander-button",
			text: "Add event",
		});
		addButton.addEventListener("click", () => {
			void this.openAddEventModal();
		});

		void this.renderDiaryMentions(eventsSection);
	}

	private renderDraftsStrip(container: HTMLElement) {
		const drafts = asArray(this.contactData.drafts);
		if (drafts.length === 0) return;

		const strip = container.createDiv({
			cls: "contact-drafts-strip",
		});
		strip.createDiv({
			cls: "contact-idea-group-header",
			text: "✏️ Drafts to sort",
		});

		drafts.forEach((draft, index) => {
			const draftText =
				typeof draft === "string"
					? draft
					: toText(fieldOf(draft, "text"));
			const row = strip.createDiv({ cls: "contact-draft-row" });
			row.createSpan({
				cls: "contact-draft-text",
				text: draftText,
			});

			const ideaButton = row.createEl("button", {
				cls: "callander-button",
				text: "Make idea",
			});
			ideaButton.addEventListener("click", () => {
				new QuickIdeaModal(
					this.app,
					this.contactData.displayName || this.contactData.name || "",
					this.lastIdeaCategory,
					async (category, text) => {
						this.lastIdeaCategory = category;
						this.pushToList("ideas", {
							category,
							text,
							done: false,
						});
						this.removeFromList("drafts", index);
						await this.saveContactData();
						this.render();
					},
					draftText
				).open();
			});

			const deleteButton = row.createEl("button", {
				cls: "callander-button button-icon button-danger",
				attr: { "aria-label": "Discard draft" },
			});
			setIcon(deleteButton, "trash");
			deleteButton.addEventListener("click", () => {
				const preview =
					draftText.length > 80
						? draftText.slice(0, 80) + "…"
						: draftText;
				new ConfirmModal(
					this.app,
					"Discard draft",
					`Discard "${preview}"?`,
					"Discard",
					async () => {
						this.removeFromList("drafts", index);
						await this.saveContactData();
						this.render();
					}
				).open();
			});
		});
	}

	private isPlanFile(): boolean {
		return !!this._file?.path.startsWith(
			this.plugin.planOperations.getPlansFolderPath() + "/"
		);
	}

	/** Plan date/status + location lines, shown under "Last updated". */
	private renderPlanMetaLines(container: HTMLElement) {
		const parts: string[] = [];
		const dateFlex = parseFlexDate(this.contactData.date);
		if (dateFlex) {
			let when = formatPlanDateRange(
				this.contactData.date,
				this.contactData.endDate
			);
			if (dateFlex.month !== null && dateFlex.day !== null) {
				const target = new Date(
					dateFlex.year ?? new Date().getFullYear(),
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
				else if (days === 1) when += " · tomorrow";
				else if (days > 1) when += ` · in ${days} days`;
				else when += ` · ${-days} days ago`;
			}
			parts.push(`🗓 ${when}`);
		}
		const est = PlanOperations.estimate(this.contactData);
		if (est > 0) parts.push(`~$${est} planned`);
		if (this.contactData.status === "done") parts.push("✅ Done");

		if (parts.length > 0 || this.contactData.location) {
			const linesWrap = container.createDiv({
				cls: "plan-meta-lines",
			});
			if (parts.length > 0) {
				linesWrap.createDiv({
					cls: "plan-meta-line",
					text: parts.join("  ·  "),
				});
			}
			if (this.contactData.location) {
				linesWrap.createDiv({
					cls: "plan-meta-line",
					text: `📍 ${this.contactData.location}`,
				});
			}
		}

		// Edit date/end-date/location — sits just below the location line.
		const editBtn = container.createEl("button", {
			cls: "callander-button plan-edit-details",
			attr: { "aria-label": "Edit plan details" },
		});
		setIcon(editBtn, "pencil");
		editBtn.createSpan({ text: "Edit details" });
		editBtn.addEventListener("click", () => this.openPlanDetailsModal());
	}

	/** Edit the plan's name, date, end date & location. */
	private openPlanDetailsModal() {
		new PlanDetailsModal(
			this.app,
			{
				name: this.contactData.name || "",
				date: this.contactData.date
					? String(this.contactData.date)
					: "",
				endDate: this.contactData.endDate
					? String(this.contactData.endDate)
					: "",
				location: this.contactData.location
					? String(this.contactData.location)
					: "",
			},
			async (details) => {
				const renamed =
					details.name && details.name !== this.contactData.name;
				this.contactData.name = details.name;
				this.contactData.date = details.date;
				if (details.endDate) {
					this.contactData.endDate = details.endDate;
				} else {
					delete this.contactData.endDate;
				}
				if (details.location) {
					this.contactData.location = details.location;
				} else {
					delete this.contactData.location;
				}
				await this.saveContactData();
				// Keep the filename in step with the name (same sanitizing
				// as plan creation)
				if (renamed && this._file?.parent) {
					const safeName =
						details.name
							.replace(/[\\/:*?"<>|#^[\]]/g, "-")
							.trim() || "Plan";
					const newPath = `${this._file.parent.path}/${safeName}.md`;
					if (newPath !== this._file.path) {
						try {
							await this.app.fileManager.renameFile(
								this._file,
								newPath
							);
						} catch (error) {
							new Notice(`Error renaming plan: ${error}`);
						}
					}
				}
				this.render();
			},
			() => this.confirmDeletePlan()
		).open();
	}

	/** Delete the plan note entirely (sent to the Obsidian trash). */
	private confirmDeletePlan() {
		const file = this._file;
		if (!file) return;
		const name = this.contactData.name || file.basename;
		new ConfirmModal(
			this.app,
			"Delete plan",
			`Delete the plan "${name}"?`,
			"Delete",
			async () => {
				await this.app.fileManager.trashFile(file);
				new Notice(`Deleted "${name}"`);
				this.leaf.detach();
				await this.plugin.activateDashboard();
			}
		).open();
	}

	private createPlanDoneButton(container: HTMLElement) {
		const isDone = this.contactData.status === "done";
		const doneButton = container.createEl("button", {
			cls: "callander-button contact-header-action",
		});
		setIcon(doneButton, isDone ? "rotate-ccw" : "check");
		doneButton.createSpan({
			text: isDone ? "Reopen plan" : "Mark as done",
		});
		doneButton.addEventListener("click", () => {
			if (this.contactData.status === "done") {
				this.contactData.status = "planning";
				void this.saveContactData().then(() => this.render());
				return;
			}
			const memberFiles = this.resolvePlanMembers();
			new ConfirmModal(
				this.app,
				"Mark plan as done",
				memberFiles.length > 0
					? `Log "${this.contactData.name}" to ${memberFiles.length} member timeline(s) and archive this plan?`
					: "Archive this plan?",
				"Done",
				async () => {
					const date =
						this.contactData.date ||
						new Date().toISOString().split("T")[0];
					for (const file of memberFiles) {
						await this.plugin.contactOperations.addEventToFile(
							file,
							date,
							this.contactData.name ?? "",
							"hangout"
						);
					}
					this.contactData.status = "done";
					await this.saveContactData();
					if (memberFiles.length > 0) {
						new Notice(
							`🪧 Logged to ${memberFiles.length} timeline(s)`
						);
					}
					this.render();
				}
			).open();
		});
	}

	/** "Thu 30 Jul - Sun 2 Aug", "Thu 30 Jul", or just "October" */
	/** Member display names — resolved contacts use displayName, guests as-is */
	private planMemberDisplays(list?: string[]): string[] {
		const members =
			list ?? asArray(this.contactData.members).map(String);
		return members.map((raw) => {
			const linktext = String(raw).replace(/^\[\[|\]\]$/g, "");
			const dest = this._file
				? this.app.metadataCache.getFirstLinkpathDest(
						linktext,
						this._file.path
				  )
				: null;
			return dest
				? String(
						this.app.metadataCache.getFileCache(dest)?.frontmatter
							?.displayName ?? dest.basename
				  )
				: linktext;
		});
	}

	/** The iMessage-ready version of a plan. Costs stay out of the invite. */
	private buildPlanShareText(): string {
		return buildPlanShareText(
			this.contactData as Record<string, unknown>,
			{
				yourName: this.plugin.settings.yourName,
				members: this.planMemberDisplays(),
				unconfirmed: this.planMemberDisplays(
					Array.isArray(this.contactData.unconfirmedMembers)
						? this.contactData.unconfirmedMembers
						: []
				),
			}
		);
	}

	/** Resolve the plan's wikilink members to contact files */
	private resolvePlanMembers(): TFile[] {
		if (!this._file) return [];
		const members = asArray(this.contactData.members).map(String);
		const files: TFile[] = [];
		for (const raw of members) {
			const linktext = String(raw).replace(/^\[\[|\]\]$/g, "");
			const dest = this.app.metadataCache.getFirstLinkpathDest(
				linktext,
				this._file.path
			);
			if (dest) files.push(dest);
		}
		return files;
	}

	/** Everyone at the table: guests/contacts + you. */
	private planMemberCount(): number {
		const yourName = this.plugin.settings.yourName;
		const members = asArray(this.contactData.members).map(String);
		const others = members.filter(
			(raw) =>
				!yourName ||
				String(raw)
					.replace(/^\[\[|\]\]$/g, "")
					.toLowerCase() !== yourName.toLowerCase()
		).length;
		return others + (yourName ? 1 : 0);
	}

	private async renderPlanMembers(container: HTMLElement) {
		if (!this._file) return;
		const yourName = this.plugin.settings.yourName;
		const members = asArray(this.contactData.members).map(String);
		// You are shown automatically — skip any guest entry duplicating you
		const visible = members
			.map((raw: string, index: number) => ({
				raw: String(raw),
				index,
			}))
			.filter(
				({ raw }) =>
					!yourName ||
					raw.replace(/^\[\[|\]\]$/g, "").toLowerCase() !==
						yourName.toLowerCase()
			);

		// The count sits in the section header now. Pad the body like every
		// other section (the stack-section wrap itself has no padding).
		container = container.createDiv({ cls: "plan-members-body" });
		const chips = container.createDiv({
			cls: "contact-group-chips plan-member-chips",
		});

		const removeMember = async (index: number) => {
			this.removeFromList("members", index);
			await this.saveContactData();
			this.render();
		};

		if (yourName) {
			const chip = chips.createSpan({
				cls: "contact-group-chip readonly plan-member-chip",
			});
			chip.createSpan({ text: yourName });
			chip.createSpan({ cls: "plan-chip-muted", text: "(you)" });
		}

		for (const { raw, index } of visible) {
			const linktext = raw.replace(/^\[\[|\]\]$/g, "");
			const dest = this.app.metadataCache.getFirstLinkpathDest(
				linktext,
				this._file.path
			);
			const display = dest
				? String(
						this.app.metadataCache.getFileCache(dest)?.frontmatter
							?.displayName ?? dest.basename
				  )
				: linktext;

			const chip = chips.createSpan({
				cls: "contact-group-chip readonly plan-member-chip",
			});
			const nameEl = chip.createSpan({
				cls: dest ? "plan-chip-name" : undefined,
				text: display,
			});
			if (dest) {
				nameEl.addEventListener("click", () =>
					void this.app.workspace.openLinkText(dest.path, "", false)
				);
			}
			const removeEl = chip.createSpan({
				cls: "contact-member-remove",
				text: "✕",
				attr: { "aria-label": "Remove from plan" },
			});
			removeEl.addEventListener("click", () => void removeMember(index));
		}

		// Unconfirmed people, in their own section (only when there are any)
		const unconfirmed = asArray(
			this.contactData.unconfirmedMembers
		).map(String);
		if (unconfirmed.length > 0) {
			container.createDiv({
				cls: "plan-member-sublabel",
				text: "Unconfirmed",
			});
			const unconfirmedChips = container.createDiv({
				cls: "contact-group-chips plan-member-chips",
			});
			unconfirmed.forEach((raw: string, index: number) => {
				const linktext = String(raw).replace(/^\[\[|\]\]$/g, "");
				const dest = this.app.metadataCache.getFirstLinkpathDest(
					linktext,
					this._file!.path
				);
				const display = dest
					? String(
							this.app.metadataCache.getFileCache(dest)
								?.frontmatter?.displayName ?? dest.basename
					  )
					: linktext;

				const chip = unconfirmedChips.createSpan({
					cls: "contact-group-chip readonly plan-member-chip plan-member-unconfirmed",
				});
				const nameEl = chip.createSpan({
					cls: dest ? "plan-chip-name" : undefined,
					text: display,
				});
				if (dest) {
					nameEl.addEventListener("click", () =>
						void this.app.workspace.openLinkText(
							dest.path,
							"",
							false
						)
					);
				}
				const confirmEl = chip.createSpan({
					cls: "plan-chip-confirm",
					text: "✓",
					attr: { "aria-label": "Confirm — they're in" },
				});
				const confirmMember = async () => {
					this.removeFromList("unconfirmedMembers", index);
					this.pushToList("members", raw);
					await this.saveContactData();
					this.render();
				};
				confirmEl.addEventListener("click", () =>
					void confirmMember()
				);
				const removeEl = chip.createSpan({
					cls: "contact-member-remove",
					text: "✕",
					attr: { "aria-label": "Remove" },
				});
				const removeUnconfirmed = async () => {
					this.removeFromList("unconfirmedMembers", index);
					await this.saveContactData();
					this.render();
				};
				removeEl.addEventListener("click", () =>
					void removeUnconfirmed()
				);
			});
		}

		const addRow = container.createDiv({
			cls: "plan-member-add-row",
		});
		const addButton = addRow.createEl("button", {
			cls: "callander-button button-outlined",
		});
		setIcon(addButton, "plus");
		addButton.createSpan({ text: "Add person" });
		const openAddMember = async () => {
			const ops = this.plugin.contactOperations;
			const contacts = await ops.getContacts();
			const existing = new Set(
				this.resolvePlanMembers().map((f) => f.path)
			);
			const groups = ops.getGroupInfos(contacts).map((g) => ({
				name: g.name,
				label: ops.prettyGroupName(g.name),
				color: g.color,
			}));
			new AddPlanMemberModal(
				this.app,
				contacts.filter((c) => !existing.has(c.file.path)),
				groups,
				async ({ contact, name }, isUnconfirmed) => {
					const entry = contact
						? `[[${contact.file.basename}]]`
						: name;
					const key = isUnconfirmed
						? "unconfirmedMembers"
						: "members";
					this.pushToList(key, entry);
					await this.saveContactData();
					this.render();
				}
			).open();
		};
		addButton.addEventListener("click", () => void openAddMember());
	}

	private renderPlanDrafts(container: HTMLElement) {
		const drafts = asArray(this.contactData.drafts);
		if (drafts.length === 0) return;

		const strip = container.createDiv({
			cls: "contact-drafts-strip",
		});
		strip.createDiv({
			cls: "contact-idea-group-header",
			text: "✏️ Drafts to sort",
		});

		drafts.forEach((draft, index) => {
			const text =
				typeof draft === "string"
					? draft
					: toText(fieldOf(draft, "text"));
			const row = strip.createDiv({ cls: "contact-draft-row" });
			row.createSpan({ cls: "contact-draft-text", text });

			const ideaButton = row.createEl("button", {
				cls: "callander-button",
				text: "Make idea",
			});
			ideaButton.addEventListener("click", () => {
				new PlanItemModal(
					this.app,
					String(this.contactData.name ?? ""),
					async (value) => {
						this.pushToList("items", value);
						this.removeFromList("drafts", index);
						await this.saveContactData();
						this.render();
					},
					{ category: "activity", priority: "must", text }
				).open();
			});

			const deleteBtn = row.createEl("button", {
				cls: "callander-button button-icon button-danger",
				attr: { "aria-label": "Discard draft" },
			});
			setIcon(deleteBtn, "trash");
			deleteBtn.addEventListener("click", () => {
				const preview =
					text.length > 80 ? text.slice(0, 80) + "…" : text;
				new ConfirmModal(
					this.app,
					"Discard draft",
					`Discard "${preview}"?`,
					"Discard",
					async () => {
						this.removeFromList("drafts", index);
						await this.saveContactData();
						this.render();
					}
				).open();
			});
		});
	}

	private renderPlanIdeas(container: HTMLElement) {
		const section = container.createDiv({
			cls: "contact-ideas-section plan-items-section",
		});

		const items = PlanOperations.itemsOf(this.contactData);

		if (items.length === 0) {
			section.createDiv({
				cls: "section-helper-text",
				text: "Things to do together — activities, food, sights.",
			});
		}

		// Grouped by category, must-dos first within each
		for (const cat of PLAN_IDEA_CATEGORIES) {
			const catItems = items
				.map((item, index) => ({ item, index }))
				.filter(({ item }) => (item.category ?? "activity") === cat.id)
				.sort(
					(a, b) =>
						(a.item.priority === "must" ? 0 : 1) -
						(b.item.priority === "must" ? 0 : 1)
				);
			if (catItems.length === 0) continue;

			const group = section.createDiv({
				cls: "contact-idea-group",
			});
			group.createDiv({
				cls: "contact-idea-group-header",
				text: `${cat.emoji} ${cat.label}`,
			});
			for (const { item, index } of catItems) {
				const row = group.createDiv({
					cls: "contact-idea-item plan-clickable-row",
				});
				row.addEventListener("click", () =>
					this.openPlanIdeaModal(index, item)
				);
				// No priority icons — a "Maybe" is spelled out inline.
				const textEl = row.createDiv({
					cls: "contact-idea-text",
					text:
						item.priority === "maybe"
							? `Maybe: ${item.text}`
							: item.text,
				});
				if (item.cost !== undefined) {
					textEl.createSpan({
						cls: "plan-item-cost",
						text: ` · ${formatItemCost(item.cost)}`,
					});
				}
				if (item.people) {
					textEl.createSpan({
						cls: "plan-item-people",
						text: ` · ${item.people}`,
					});
				}
			}
		}

		const footer = section.createDiv({
			cls: "contact-section-footer",
		});
		const addButton = footer.createEl("button", {
			cls: "callander-button",
		});
		setIcon(addButton, "plus");
		addButton.createSpan({ text: "Add idea" });
		addButton.addEventListener("click", () =>
			this.openPlanIdeaModal(null, null)
		);
	}

	/** Flat cost-bearing lists: travel legs, accommodation options */
	private renderPlanSimpleList(
		container: HTMLElement,
		key: "travel" | "accommodation",
		addLabel: string
	) {
		const section = container.createDiv({
			cls: "contact-ideas-section plan-items-section",
		});
		const open = (index: number | null, item: PlanSimpleItem | null) =>
			key === "travel"
				? this.openPlanTravelModal(index, item)
				: this.openPlanAccommodationModal(index, item);

		const rows = PlanOperations.simpleListOf(this.contactData, key).map(
			(item, index) => ({ item, index })
		);

		if (rows.length === 0) {
			section.createDiv({
				cls: "section-helper-text",
				text:
					key === "travel"
						? "How you're getting there and around — flights, trains, the drive."
						: "Where you're staying — the Airbnb, a hotel, someone's place.",
			});
		}

		rows.forEach(({ item, index }) => {
			const row = section.createDiv({
				cls: "contact-idea-item plan-clickable-row",
			});
			row.addEventListener("click", () => open(index, item));
			const textEl = row.createDiv({
				cls: "contact-idea-text",
			});
			const icon =
				key === "accommodation"
					? (item.stay && ACCOMMODATION_EMOJI[item.stay]) || "🛏️"
					: item.type
					? TRAVEL_TYPE_EMOJI[item.type]
					: "";
			if (icon && !this.startsWithEmoji(item.text)) {
				textEl.createSpan({
					cls: "plan-item-type-icon",
					text: icon,
				});
			}
			textEl.createSpan({ text: item.text });
			if (item.duration) {
				textEl.createSpan({
					cls: "plan-item-duration",
					text: ` · ${item.duration}`,
				});
			}
			if (item.nights) {
				textEl.createSpan({
					cls: "plan-item-duration",
					text: ` · ${
						nightsLabel(item.nights)
					}`,
				});
			}
			if (item.cost !== undefined) {
				textEl.createSpan({
					cls: "plan-item-cost",
					text: ` · ${formatItemCost(item.cost)}`,
				});
			}
			if (item.people) {
				textEl.createSpan({
					cls: "plan-item-people",
					text: ` · ${item.people}`,
				});
			}
			const booking = BOOKING_STATES.find((b) => b.id === item.booked);
			if (booking && booking.id !== "none") {
				textEl.createSpan({
					cls: "plan-item-booking",
					text: ` · ${booking.emoji} ${booking.label}`,
				});
			}
			if (item.notes) {
				row.createDiv({
					cls: "plan-stay-notes",
					text: item.notes,
				});
			}
		});

		const footer = section.createDiv({
			cls: "contact-section-footer",
		});
		const addButton = footer.createEl("button", {
			cls: "callander-button",
		});
		setIcon(addButton, "plus");
		addButton.createSpan({ text: addLabel });
		addButton.addEventListener("click", () => open(null, null));
	}

	/** Context-aware placeholders for the travel / accommodation modal. */
	private planSimplePlaceholders(key: "travel" | "accommodation") {
		return key === "travel"
			? { text: "e.g. Harry's car to the coast", duration: "e.g. 2h 30m" }
			: { text: "e.g. Beachfront Airbnb", duration: "e.g. 3 nights" };
	}

	/** Item cost label: an explicit 0 reads as "Free"; blank stays hidden. */
	/**
	 * The plan as an itinerary: every dated item across ideas, travel and
	 * accommodation, grouped by day, earliest first. Derived on the fly from
	 * PlanOperations.timelineOf — each row points back to its one real item.
	 * When the plan has an exact start+end date, every day in that range is
	 * listed (empty ones show "No plans yet") so it reads day-by-day.
	 */
	private renderPlanTimeline(container: HTMLElement) {
		const section = container.createDiv({
			cls: "contact-ideas-section plan-items-section",
		});
		const entries = PlanOperations.timelineOf(this.contactData);

		// Group entries by day (timelineOf already sorted them chronologically)
		const byDay = new Map<string, PlanTimelineEntry[]>();
		for (const entry of entries) {
			const list = byDay.get(entry.date);
			if (list) list.push(entry);
			else byDay.set(entry.date, [entry]);
		}

		// Days to render: every day that has an item, plus — when the plan has
		// an exact start and end — every day in that range.
		const days = new Set<string>(byDay.keys());
		const startISO = this.exactPlanDay(this.contactData.date);
		const endISO = this.exactPlanDay(this.contactData.endDate);
		if (startISO && endISO) {
			for (const d of this.daysBetween(startISO, endISO)) days.add(d);
		}
		const sortedDays = [...days].sort();

		if (sortedDays.length === 0) {
			section.createDiv({
				cls: "section-helper-text",
				text: "Give an idea, travel leg or stay a date and it lands here in order — your itinerary as it firms up.",
			});
		} else {
			const timeline = section.createDiv({
				cls: "contact-timeline plan-timeline",
			});
			for (const day of sortedDays) {
				timeline.createDiv({
					cls: "contact-timeline-year plan-timeline-day",
					text: formatTimelineDay(day),
				});
				const dayEntries = byDay.get(day);
				if (dayEntries && dayEntries.length > 0) {
					for (const entry of dayEntries) {
						this.renderPlanTimelineEntry(timeline, entry);
					}
				} else {
					timeline.createDiv({
						cls: "contact-timeline-item plan-timeline-empty",
						text: "No plans yet",
					});
				}
			}
		}

		// Copy button sits top-right in the section header (desktop).
		const header = container.querySelector(
			".contact-stack-header"
		);
		if (header) {
			const copyButton = header.createEl("button", {
				cls: "callander-button plan-timeline-copy",
			});
			setIcon(copyButton, "copy");
			copyButton.createSpan({ text: "Copy as text" });
			const copyShareText = async () => {
				await navigator.clipboard.writeText(this.buildPlanShareText());
				new Notice("📋 Copied — ready to paste as text");
			};
			copyButton.addEventListener("click", () => void copyShareText());
		}

		// Quick-add at the bottom of the itinerary
		const footer = section.createDiv({
			cls: "contact-section-footer plan-timeline-footer",
		});
		const addIdeaBtn = footer.createEl("button", {
			cls: "callander-button",
		});
		setIcon(addIdeaBtn, "plus");
		addIdeaBtn.createSpan({ text: "Add idea" });
		addIdeaBtn.addEventListener("click", () =>
			this.openPlanIdeaModal(null, null)
		);

		const addTravelBtn = footer.createEl("button", {
			cls: "callander-button",
		});
		setIcon(addTravelBtn, "plus");
		addTravelBtn.createSpan({ text: "Add travel" });
		addTravelBtn.addEventListener("click", () =>
			this.openPlanTravelModal(null, null)
		);
	}

	/** One timeline row for a dated item. */
	private renderPlanTimelineEntry(
		timeline: HTMLElement,
		entry: PlanTimelineEntry
	) {
		const row = timeline.createDiv({
			cls: `contact-timeline-item plan-timeline-item timeline-${entry.source}`,
		});
		// Tapping the row edits it — the only path on mobile.
		row.addEventListener("click", () => this.openTimelineEntry(entry));

		row.createDiv({
			cls: `contact-timeline-dot timeline-dot-${entry.source}`,
		});

		// Line 1: the time within the day (the day is the group header). A stay
		// has no clock time — it's simply where the day ends.
		const isStay = entry.source === "accommodation";
		if (isStay || entry.time) {
			row.createDiv({
				cls: "contact-timeline-date",
				text: isStay
					? "Sleeping at"
					: formatItemTime(entry.time as string),
			});
		}

		// Line 2: emoji + detail (+ duration/cost). Skip the type emoji when
		// the name already starts with one.
		const showEmoji = entry.emoji && !this.startsWithEmoji(entry.text);
		const textEl = row.createDiv({
			cls: "contact-timeline-text",
			text: showEmoji ? `${entry.emoji} ${entry.text}` : entry.text,
		});
		const metaBits: string[] = [];
		if (entry.duration) metaBits.push(entry.duration);
		// Answers "when do we leave?" without a second timeline row.
		if (entry.nights) {
			metaBits.push(nightsSummary(entry.date, entry.nights));
		}
		if (entry.cost !== undefined)
			metaBits.push(formatItemCost(entry.cost));
		// Only the state that still needs chasing earns a spot on the timeline.
		// "Booked" and "Not needed" are resting states — the Accommodation
		// section and the modals are where you go to check them.
		const booking = BOOKING_STATES.find((b) => b.id === entry.booked);
		if (booking && booking.id === "todo") {
			metaBits.push(`${booking.emoji} ${booking.label}`);
		}
		if (metaBits.length) {
			textEl.createSpan({
				cls: "plan-travel-meta",
				text: `  ·  ${metaBits.join("  ·  ")}`,
			});
		}

		if (entry.people) {
			row.createDiv({
				cls: "plan-travel-people",
				text: entry.people,
			});
		}

		// Plain text here — the whole row is already a target that opens the
		// read view, where the address gets its Map button.
		if (entry.address) {
			row.createDiv({
				cls: "plan-stay-address",
				text: `📍 ${entry.address}`,
			});
		}

		if (entry.notes) {
			row.createDiv({
				cls: "plan-stay-notes",
				text: entry.notes,
			});
		}

		// Desktop hover shortcuts, so editing doesn't need the read view first.
		// CSS hides these on touch, where tapping the row is the only path.
		const actions = row.createDiv({ cls: "contact-timeline-actions" });
		const editBtn = actions.createEl("button", {
			cls: "callander-button",
			attr: { "aria-label": "Edit" },
		});
		setIcon(editBtn, "pencil");
		editBtn.createSpan({ text: "Edit" });
		editBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.editTimelineEntry(entry);
		});

		const deleteBtn = actions.createEl("button", {
			cls: "callander-button button-icon button-danger",
			attr: { "aria-label": "Delete" },
		});
		setIcon(deleteBtn, "trash");
		deleteBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			const preview =
				entry.text.length > 80
					? entry.text.slice(0, 80) + "…"
					: entry.text;
			new ConfirmModal(
				this.app,
				"Delete from plan",
				`Delete "${preview}"?`,
				"Delete",
				() => this.deleteTimelineEntry(entry)
			).open();
		});
	}

	/** True when the text already leads with an emoji/pictograph. */
	private startsWithEmoji(text: string): boolean {
		return /^\p{Extended_Pictographic}/u.test(text.trim());
	}

	/** Exact YYYY-MM-DD for a plan flex date, or null if not day-precise. */
	private exactPlanDay(value: string | number | undefined): string | null {
		const p = parseFlexDate(value);
		if (p && p.year !== null && p.month !== null && p.day !== null) {
			const pad = (n: number) => String(n).padStart(2, "0");
			return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
		}
		return null;
	}

	/** Inclusive ISO days from start to end (capped for safety). */
	private daysBetween(startISO: string, endISO: string): string[] {
		const days: string[] = [];
		const d = new Date(`${startISO}T00:00:00`);
		const end = new Date(`${endISO}T00:00:00`);
		if (isNaN(d.getTime()) || isNaN(end.getTime()) || end < d) return days;
		const pad = (n: number) => String(n).padStart(2, "0");
		let guard = 0;
		while (d <= end && guard++ < 400) {
			days.push(
				`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
					d.getDate()
				)}`
			);
			d.setDate(d.getDate() + 1);
		}
		return days;
	}

	/** Tapping a timeline row reads it first; Edit/Delete live in that view. */
	private openTimelineEntry(entry: PlanTimelineEntry) {
		new PlanTimelineViewModal(
			this.app,
			entry,
			() => this.editTimelineEntry(entry),
			() => this.deleteTimelineEntry(entry)
		).open();
	}

	/** Remove a timeline row's underlying item from the plan. */
	private async deleteTimelineEntry(entry: PlanTimelineEntry) {
		if (entry.source === "idea") {
			const current = PlanOperations.itemsOf(this.contactData);
			current.splice(entry.index, 1);
			if (current.length > 0) this.contactData.items = current;
			else delete this.contactData.items;
		} else {
			const current = PlanOperations.simpleListOf(
				this.contactData,
				entry.source
			);
			current.splice(entry.index, 1);
			if (current.length > 0) this.contactData[entry.source] = current;
			else delete this.contactData[entry.source];
		}
		await this.saveContactData();
		this.render();
	}

	/** Route a timeline row back to its real item's edit modal. */
	private editTimelineEntry(entry: PlanTimelineEntry) {
		if (entry.source === "idea") {
			const item =
				PlanOperations.itemsOf(this.contactData)[entry.index] ?? null;
			if (item) this.openPlanIdeaModal(entry.index, item);
			return;
		}
		const item =
			PlanOperations.simpleListOf(this.contactData, entry.source)[
				entry.index
			] ?? null;
		if (!item) return;
		if (entry.source === "travel") {
			this.openPlanTravelModal(entry.index, item);
		} else {
			this.openPlanAccommodationModal(entry.index, item);
		}
	}

	/** Add (index null) or edit a travel leg via the shared item modal. */
	/** Day dropdown (when exact range) + trip people for the item modals. */
	private planScheduleOptions(): ScheduleFieldOptions {
		const opts: ScheduleFieldOptions = {
			people: this.planParticipants(),
		};
		const startISO = this.exactPlanDay(this.contactData.date);
		const endISO = this.exactPlanDay(this.contactData.endDate);
		if (startISO && endISO) {
			opts.dayOptions = this.daysBetween(startISO, endISO).map((d) => ({
				value: d,
				label: formatTimelineDay(d),
			}));
			opts.lastDay = endISO;
		}
		return opts;
	}

	private openPlanTravelModal(
		index: number | null,
		item: PlanSimpleItem | null
	) {
		new PlanSimpleItemModal(
			this.app,
			index === null ? "Add travel" : "Edit travel",
			item
				? {
						text: item.text,
						type: item.type,
						date: item.date,
						time: item.time,
						people: item.people,
						duration: item.duration,
						cost: item.cost,
				  }
				: null,
			async (value) => {
				const current = PlanOperations.simpleListOf(
					this.contactData,
					"travel"
				);
				if (index === null) current.push(value);
				else current[index] = value;
				this.contactData.travel = current;
				await this.saveContactData();
				this.render();
			},
			this.planSimplePlaceholders("travel"),
			TRAVEL_TYPES,
			true,
			index === null
				? undefined
				: async () => {
						const current = PlanOperations.simpleListOf(
							this.contactData,
							"travel"
						);
						current.splice(index, 1);
						if (current.length > 0)
							this.contactData.travel = current;
						else delete this.contactData.travel;
						await this.saveContactData();
						this.render();
				  },
			this.planScheduleOptions()
		).open();
	}

	/** Add (index null) or edit a plan idea; used by the list and timeline. */
	private openPlanIdeaModal(index: number | null, item: PlanItem | null) {
		new PlanItemModal(
			this.app,
			String(this.contactData.name ?? ""),
			async (value) => {
				const current = PlanOperations.itemsOf(this.contactData);
				if (index === null) current.push(value);
				else current[index] = value;
				this.contactData.items = current;
				await this.saveContactData();
				this.render();
			},
			item,
			index === null
				? undefined
				: async () => {
						const current = PlanOperations.itemsOf(
							this.contactData
						);
						current.splice(index, 1);
						if (current.length > 0)
							this.contactData.items = current;
						else delete this.contactData.items;
						await this.saveContactData();
						this.render();
				  },
			this.planScheduleOptions()
		).open();
	}

	/** Add (index null) or edit an accommodation; used by the list and timeline. */
	private openPlanAccommodationModal(
		index: number | null,
		item: PlanSimpleItem | null
	) {
		new PlanSimpleItemModal(
			this.app,
			index === null ? "Add accommodation" : "Edit accommodation",
			item
				? {
						text: item.text,
						stay: item.stay,
						date: item.date,
						people: item.people,
						// Read only to migrate a legacy "3 nights" into `nights`.
						duration: item.duration,
						nights: item.nights,
						address: item.address,
						booked: item.booked,
						notes: item.notes,
						cost: item.cost,
				  }
				: null,
			async (value) => {
				const current = PlanOperations.simpleListOf(
					this.contactData,
					"accommodation"
				);
				if (index === null) current.push(value);
				else current[index] = value;
				this.contactData.accommodation = current;
				await this.saveContactData();
				this.render();
			},
			this.planSimplePlaceholders("accommodation"),
			null,
			true,
			index === null
				? undefined
				: async () => {
						const current = PlanOperations.simpleListOf(
							this.contactData,
							"accommodation"
						);
						current.splice(index, 1);
						if (current.length > 0)
							this.contactData.accommodation = current;
						else delete this.contactData.accommodation;
						await this.saveContactData();
						this.render();
				  },
			this.planScheduleOptions(),
			true
		).open();
	}

	private renderPlanBring(container: HTMLElement) {
		const section = container.createDiv({
			cls: "contact-ideas-section plan-items-section",
		});

		const bring = PlanOperations.bringOf(this.contactData);

		if (bring.length === 0) {
			section.createDiv({
				cls: "section-helper-text",
				text: "Trip-specific stuff — swimwear, speakers, meat for the BBQ. Toothbrushes can look after themselves.",
			});
		}

		bring.forEach((item, index) => {
			const row = section.createDiv({
				cls: `contact-idea-item ${item.done ? "done" : ""}`,
			});
			const checkbox = row.createEl("input", {
				attr: {
					type: "checkbox",
					"aria-label": "Sorted / packed",
				},
			});
			checkbox.checked = item.done;
			const toggleBringDone = async () => {
				const list = PlanOperations.bringOf(this.contactData);
				list[index] = { ...list[index], done: checkbox.checked };
				this.contactData.bring = list;
				await this.saveContactData();
				this.render();
			};
			checkbox.addEventListener("change", () => void toggleBringDone());
			row.createDiv({
				cls: "contact-idea-text",
				text: item.text,
			});
			const deleteBtn = row.createEl("button", {
				cls: "callander-button button-icon button-danger",
				attr: { "aria-label": "Remove item" },
			});
			setIcon(deleteBtn, "trash");
			const removeBringItem = async () => {
				const list = PlanOperations.bringOf(this.contactData);
				list.splice(index, 1);
				if (list.length > 0) this.contactData.bring = list;
				else delete this.contactData.bring;
				await this.saveContactData();
				this.render();
			};
			deleteBtn.addEventListener("click", () => void removeBringItem());
		});

		const addRow = section.createDiv({
			cls: "contact-ideas-add-row plan-bring-add-row",
		});
		const input = addRow.createEl("input", {
			cls: "contact-field-input",
			attr: { type: "text", placeholder: "Add something to bring..." },
		});
		const addButton = addRow.createEl("button", {
			cls: "callander-button",
		});
		setIcon(addButton, "plus");
		addButton.createSpan({ text: "Add" });
		const addItem = async () => {
			const text = input.value.trim();
			if (!text) return;
			this.contactData.bring = [
				...PlanOperations.bringOf(this.contactData),
				{ text, done: false },
			];
			await this.saveContactData();
			this.render();
		};
		addButton.addEventListener("click", () => void addItem());
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") void addItem();
		});
	}

	private planParticipants(): string[] {
		const names = this.planMemberDisplays();
		const yourName = this.plugin.settings.yourName;
		if (
			yourName &&
			!names.some((n) => n.toLowerCase() === yourName.toLowerCase())
		) {
			return [yourName, ...names];
		}
		return names;
	}

	private renderPlanCosts(container: HTMLElement) {
		const section = container.createDiv({
			cls: "contact-ideas-section plan-items-section",
		});
		const costs = PlanOperations.costsOf(this.contactData);
		const credits = PlanOperations.creditsOf(this.contactData);
		const participants = this.planParticipants();
		// You're the one owed — not someone who owes — so you're excluded from
		// the tally and can't be ticked off. Credits are money others hand you.
		const yourName = this.plugin.settings.yourName;
		const isYou = (p: string) =>
			!!yourName && p.toLowerCase() === yourName.toLowerCase();
		const creditPeople = participants.filter((p) => !isYou(p));
		const money = (n: number) =>
			n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`;

		if (costs.length === 0 && credits.length === 0) {
			section.createDiv({
				cls: "section-helper-text",
				text: "Split shared expenses — the Airbnb, petrol, groceries. Divide evenly or by shares (nights, drinks…). Add credits for money already handed over.",
			});
		}

		// Running total each person owes across all expenses
		const owedTotals: Record<string, number> = {};
		const openCost = (index: number, cost: PlanCost) => {
			new PlanCostModal(
				this.app,
				participants,
				cost,
				async (updated) => {
					const list = PlanOperations.costsOf(this.contactData);
					list[index] = updated;
					this.contactData.costs = list;
					await this.saveContactData();
					this.render();
				},
				async () => {
					const list = PlanOperations.costsOf(this.contactData);
					list.splice(index, 1);
					if (list.length > 0) this.contactData.costs = list;
					else delete this.contactData.costs;
					await this.saveContactData();
					this.render();
				},
				this.plugin.settings.yourName
			).open();
		};

		const openCredit = (
			index: number | null,
			credit: PlanCredit | null
		) => {
			new PlanCreditModal(
				this.app,
				creditPeople,
				credit,
				async (updated) => {
					const list = PlanOperations.creditsOf(this.contactData);
					if (index === null) list.push(updated);
					else list[index] = updated;
					this.contactData.credits = list;
					await this.saveContactData();
					this.render();
				},
				index === null
					? undefined
					: async () => {
							const list = PlanOperations.creditsOf(
								this.contactData
							);
							list.splice(index, 1);
							if (list.length > 0)
								this.contactData.credits = list;
							else delete this.contactData.credits;
							await this.saveContactData();
							this.render();
					  }
			).open();
		};

		costs.forEach((cost, index) => {
			const row = section.createDiv({
				cls: "contact-idea-item plan-cost-row plan-clickable-row",
			});
			row.addEventListener("click", () => openCost(index, cost));
			const textEl = row.createDiv({ cls: "contact-idea-text" });
			textEl.createSpan({
				cls: "plan-cost-label",
				text: cost.label,
			});
			const splitLabel =
				cost.split.mode === "even"
					? "even"
					: cost.split.mode === "percent"
					? "by percent"
					: "by shares";
			textEl.createSpan({
				cls: "plan-item-cost",
				text: ` · $${cost.amount} · ${splitLabel}`,
			});

			const owed = PlanOperations.owedFor(cost, participants);
			for (const p of participants) {
				owedTotals[p] = (owedTotals[p] ?? 0) + (owed[p] ?? 0);
			}
		});

		// Credits — money already handed over, shown after the expenses
		credits.forEach((credit, index) => {
			const row = section.createDiv({
				cls: "contact-idea-item plan-cost-row plan-credit-row plan-clickable-row",
			});
			row.addEventListener("click", () => openCredit(index, credit));
			const textEl = row.createDiv({ cls: "contact-idea-text" });
			textEl.createSpan({
				cls: "plan-cost-label",
				text: `↩ ${credit.person}`,
			});
			textEl.createSpan({
				cls: "plan-item-cost plan-credit-amount",
				text: ` · ${money(-credit.amount)}${
					credit.note ? ` · ${credit.note}` : ""
				}`,
			});
		});

		// Per-person summary — a collapsible accordion; tick each person once
		// they've paid. Amounts are net of any credits.
		if (
			(costs.length > 0 || credits.length > 0) &&
			participants.length > 0
		) {
			const paid: string[] = Array.isArray(this.contactData.costsPaid)
				? this.contactData.costsPaid.map(String)
				: [];

			const details = section.createEl("details", {
				cls: "plan-cost-summary",
			});
			// Collapsed by default — expand to see who owes what.
			const summaryEl = details.createEl("summary", {
				cls: "plan-cost-summary-total",
			});
			const totalSpan = summaryEl.createSpan();
			// Outstanding total = net owed by everyone not yet ticked off.
			const refreshTotal = () => {
				const done = new Set(
					Array.isArray(this.contactData.costsPaid)
						? this.contactData.costsPaid.map(String)
						: []
				);
				const outstanding = participants
					.filter((p) => !done.has(p) && !isYou(p))
					.reduce(
						(s, p) =>
							s +
							((owedTotals[p] ?? 0) -
								PlanOperations.creditTotalFor(p, credits)),
						0
					);
				totalSpan.setText(`Who owes what · ${money(outstanding)}`);
			};
			refreshTotal();

			const owedList = details.createDiv({
				cls: "plan-cost-owed-list",
			});
			for (const p of participants) {
				const rowEl = owedList.createDiv({
					cls: `plan-cost-owed-row${paid.includes(p) ? " paid" : ""}`,
				});
				// Checkbox + name in a label so tapping either toggles "paid".
				const check = rowEl.createEl("label", {
					cls: "plan-cost-owed-check",
				});
				const checkbox = check.createEl("input", {
					attr: { type: "checkbox", "aria-label": `Mark ${p} paid` },
				});
				checkbox.checked = paid.includes(p);
				// You can't owe yourself — leave your own row un-tickable.
				checkbox.disabled = isYou(p);
				check.toggleClass("is-disabled", isYou(p));
				const togglePaid = async () => {
					const current: string[] = Array.isArray(
						this.contactData.costsPaid
					)
						? this.contactData.costsPaid.map(String)
						: [];
					const next = checkbox.checked
						? Array.from(new Set([...current, p]))
						: current.filter((n) => n !== p);
					if (next.length > 0) this.contactData.costsPaid = next;
					else delete this.contactData.costsPaid;
					// Update in place — a full re-render would collapse the
					// accordion back to closed.
					rowEl.toggleClass("paid", checkbox.checked);
					refreshTotal();
					await this.saveContactData();
				};
				checkbox.addEventListener("change", () => void togglePaid());
				check.createSpan({ cls: "plan-cost-owed-name", text: p });

				const owedGross = owedTotals[p] ?? 0;
				const credited = PlanOperations.creditTotalFor(p, credits);
				const net = owedGross - credited;
				rowEl.createSpan({
					cls: "plan-cost-owed-amount",
					text: money(net),
				});

				// Per-person breakdown — always shown, disabled when they're
				// not part of any expense.
				const breakdownBtn = rowEl.createEl("button", {
					cls: "callander-button plan-breakdown-btn",
					text: "Breakdown",
				});
				if (owedGross > 0) {
					breakdownBtn.addEventListener("click", () => {
						new PlanCostBreakdownModal(
							this.app,
							p,
							PlanOperations.breakdownFor(
								p,
								costs,
								participants,
								credits
							)
						).open();
					});
				} else {
					breakdownBtn.disabled = true;
				}
			}
		}

		const footer = section.createDiv({
			cls: "contact-section-footer plan-cost-footer",
		});
		const addButton = footer.createEl("button", {
			cls: "callander-button",
		});
		setIcon(addButton, "plus");
		addButton.createSpan({ text: "Add expense" });
		addButton.addEventListener("click", () => {
			new PlanCostModal(
				this.app,
				this.planParticipants(),
				null,
				async (cost) => {
					const list = PlanOperations.costsOf(this.contactData);
					list.push(cost);
					this.contactData.costs = list;
					await this.saveContactData();
					this.render();
				},
				undefined,
				this.plugin.settings.yourName
			).open();
		});

		if (creditPeople.length > 0) {
			const creditButton = footer.createEl("button", {
				cls: "callander-button",
			});
			setIcon(creditButton, "plus");
			creditButton.createSpan({ text: "Add credit" });
			creditButton.addEventListener("click", () =>
				openCredit(null, null)
			);
		}
	}

	private isGroupFile(): boolean {
		return !!this._file?.path.startsWith(
			this.plugin.contactOperations.getGroupsFolderPath() + "/"
		);
	}

	private async renderGroupMembers(container: HTMLElement) {
		if (!this._file) return;
		const ops = this.plugin.contactOperations;
		const groupName = this._file.basename.toLowerCase();
		const contacts = await ops.getContacts();
		const members = contacts.filter((c) => c.groups.includes(groupName));

		container.createDiv({
			cls: "contact-field-label",
			text: `Members (${members.length})`,
		});

		const list = container.createDiv({ cls: "group-member-list" });
		for (const m of members) {
			const row = list.createDiv({ cls: "group-member-row" });

			const info = row.createDiv({ cls: "group-member-info" });
			info.createDiv({
				cls: "group-member-name",
				text: m.displayName,
			});
			const metFlex = parseFlexDate(m.met);
			if (metFlex && metFlex.year !== null) {
				info.createDiv({
					cls: "group-member-met",
					text: `Met ${formatFlexDate(metFlex)}`,
				});
			}
			info.addEventListener("click", () => {
				void this.app.workspace.openLinkText(m.file.path, "", false);
			});

			const removeBtn = row.createEl("button", {
				cls: "callander-button button-icon button-danger",
				attr: { "aria-label": "Remove from group" },
			});
			setIcon(removeBtn, "x");
			const removeFromGroup = async () => {
				await ops.removeFriendFromGroup(m.file, groupName);
				this.render();
			};
			removeBtn.addEventListener("click", () => void removeFromGroup());
		}

		const addButton = container.createEl("button", {
			cls: "callander-button button-outlined",
			text: "Add member",
		});
		addButton.addEventListener("click", () => {
			const candidates = contacts.filter(
				(c) => !c.groups.includes(groupName)
			);
			const addToGroup = async (contact: ContactWithCountdown) => {
				await ops.addFriendToGroup(contact.file, groupName);
				this.render();
			};
			new ContactSuggestModal(
				this.app,
				candidates,
				(contact) => void addToGroup(contact),
				`Add to ${ops.prettyGroupName(groupName)}…`
			).open();
		});
	}

	// Diary entries that [[link]] to this friend — Obsidian-native, via backlinks
	private async renderDiaryMentions(container: HTMLElement) {
		if (!this._file) return;
		// Metadata-only: no diary bodies are read just to check for links
		const entries = this.plugin.diaryOperations.getEntriesMeta();
		const resolved = this.app.metadataCache.resolvedLinks;
		const mentions = entries.filter(
			(entry) => (resolved[entry.file.path]?.[this._file!.path] ?? 0) > 0
		);
		if (mentions.length === 0) return;

		const section = container.createDiv({
			cls: "contact-diary-mentions",
		});
		section.createDiv({
			cls: "contact-idea-group-header",
			text: "📖 Mentioned in diary",
		});
		for (const entry of mentions) {
			const row = section.createEl("a", {
				cls: "contact-diary-mention-row",
				text: `${entry.date} — ${entry.title}`,
			});
			row.addEventListener("click", (e) => {
				e.preventDefault();
				void this.app.workspace.openLinkText(entry.file.path, "", true);
			});
		}
	}

	// Migrate legacy giftIdeas -> ideas (category: gift). In-memory on load;
	// the file itself is rewritten on the next save.
	private migrateLegacyGiftIdeas() {
		const legacy = asArray(this.contactData.giftIdeas);
		if (legacy.length > 0) {
			const migrated = legacy.map((g): Idea => {
				const text = fieldOf(g, "text");
				return {
					category: "gift",
					text: text == null ? toText(g) : toText(text),
					done: !!fieldOf(g, "done"),
				};
			});
			this.contactData.ideas = [...this.ideasList(), ...migrated];
		}
		delete this.contactData.giftIdeas;
	}

	// Migrate legacy interactions -> events. Same shape ({date, text}), new
	// name and flexible dates. In-memory on load; rewritten on next save.
	// Old plan items had a single `bucket`; split into category+priority,
	// and move logistics items to the travel list. In-memory; persists on save.
	private migratePlanStructure() {
		if (!this.isPlanFile()) return;
		const items = asArray(this.contactData.items);
		if (!items.some((i) => isRecord(i) && "bucket" in i)) {
			return;
		}
		const newItems: unknown[] = [];
		const travel = asArray(this.contactData.travel);
		for (const item of items) {
			if (isRecord(item) && "bucket" in item) {
				if (item.bucket === "logistics") {
					travel.push({
						text: item.text,
						...(item.cost ? { cost: item.cost } : {}),
					});
				} else {
					newItems.push({
						text: item.text,
						category: "activity",
						priority: item.bucket === "must" ? "must" : "maybe",
						...(item.cost ? { cost: item.cost } : {}),
					});
				}
			} else {
				newItems.push(item);
			}
		}
		this.contactData.items = newItems;
		if (travel.length > 0) this.contactData.travel = travel;
	}

	private migrateLegacyInteractions() {
		const legacy = asArray(this.contactData.interactions);
		if (legacy.length > 0) {
			const migrated = legacy.map((i): FriendEvent => {
				const date = fieldOf(i, "date");
				const text = fieldOf(i, "text");
				return {
					date: toText(date),
					text: text == null ? toText(i) : toText(text),
				};
			});
			this.contactData.events = [...this.eventsList(), ...migrated];
		}
		delete this.contactData.interactions;
	}

	private normalizeCategory(idea: Idea): IdeaCategory {
		return IDEA_CATEGORIES.some((c) => c.id === idea.category)
			? idea.category
			: "other";
	}

	private renderIdeasSection(container: HTMLElement) {
		const ideasSection = container.createDiv({
			cls: "contact-ideas-section",
		});

		const ideas = this.ideasList();

		// Add helper text if no ideas yet
		if (ideas.length === 0) {
			ideasSection.createDiv({
				cls: "section-helper-text",
				text: "Jot quick thoughts for this friend — gifts to give, conversations to pick back up, things to do together, places to go.",
			});
		}

		// Ideas grouped by category, in fixed category order
		for (const cat of IDEA_CATEGORIES) {
			const items = ideas
				.map((idea, index) => ({ idea, index }))
				.filter(({ idea }) => this.normalizeCategory(idea) === cat.id)
				// Open ideas first, done ones sink to the bottom of the group
				.sort((a, b) => Number(!!a.idea.done) - Number(!!b.idea.done));

			if (items.length === 0) continue;

			const group = ideasSection.createDiv({
				cls: "contact-idea-group",
			});
			group.createDiv({
				cls: "contact-idea-group-header",
				text: `${cat.emoji} ${cat.label}`,
			});

			for (const { idea, index } of items) {
				const item = group.createDiv({
					cls: `contact-idea-item ${idea.done ? "done" : ""}`,
				});

				const checkbox = item.createEl("input", {
					attr: {
						type: "checkbox",
						"aria-label": "Mark idea as done",
					},
				});
				checkbox.checked = !!idea.done;
				const toggleIdeaDone = async () => {
					this.ideasList()[index].done = checkbox.checked;
					await this.saveContactData();
					this.render();
					if (checkbox.checked) {
						this.offerLogAsEvent(idea);
					}
				};
				checkbox.addEventListener("change", () =>
					void toggleIdeaDone()
				);

				const textEl = item.createDiv({
					cls: "contact-idea-text",
					text: idea.text,
				});
				if (idea.resurface) {
					const parsed = parseFlexDate(idea.resurface);
					if (parsed) {
						textEl.createSpan({
							cls: "contact-idea-resurface-badge",
							text: ` ⏰ ${formatFlexDate(parsed)}`,
						});
					}
				}

				const resurfaceBtn = item.createEl("button", {
					cls: "callander-button button-icon",
					attr: { "aria-label": "Resurface this idea later" },
				});
				setIcon(resurfaceBtn, "alarm-clock");
				resurfaceBtn.addEventListener("click", () => {
					new ResurfaceModal(
						this.app,
						idea.text,
						idea.resurface,
						async (resurface) => {
							if (resurface) {
								this.ideasList()[index].resurface = resurface;
							} else {
								delete this.ideasList()[index].resurface;
							}
							await this.saveContactData();
							this.render();
						}
					).open();
				});

				const deleteBtn = item.createEl("button", {
					cls: "callander-button button-icon button-danger",
					attr: { "aria-label": "Delete idea" },
				});
				setIcon(deleteBtn, "trash");
				const deleteIdea = async () => {
					this.ideasList().splice(index, 1);
					await this.saveContactData();
					this.render();
				};
				deleteBtn.addEventListener("click", () => void deleteIdea());
			}
		}

		// Capture goes through the modal, below the list
		const footer = ideasSection.createDiv({
			cls: "contact-section-footer",
		});
		const addButton = footer.createEl("button", {
			cls: "callander-button",
			text: "Add idea",
		});
		addButton.addEventListener("click", () => this.openAddIdeaModal());
	}

	// Capture a raw draft about this friend/plan — appears in the drafts
	// strip to triage later
	private openQuickNote() {
		new NoteInputModal(
			this.app,
			this.contactData.displayName || this.contactData.name || "",
			async (text) => {
				const created = new Date().toISOString().split("T")[0];
				this.pushToList("drafts", { text, created });
				await this.saveContactData();
				this.render();
			}
		).open();
	}

	private openAddIdeaModal() {
		new QuickIdeaModal(
			this.app,
			this.contactData.displayName || this.contactData.name || "",
			this.lastIdeaCategory,
			async (category, text) => {
				this.lastIdeaCategory = category;
				this.pushToList("ideas", {
					category,
					text,
					done: false,
				});
				await this.saveContactData();
				this.render();
			}
		).open();
	}

	/** Unknown/removed categories fall back to "other" so nothing is orphaned. */
	private normalizeInterestCategory(interest: Interest): InterestCategory {
		if (INTEREST_CATEGORIES.some((c) => c.id === interest.category)) {
			return interest.category;
		}
		// Legacy "Movie & TV" → Movie
		if (String(interest.category) === "screen") return "movie";
		return "other";
	}

	/** Fun facts as a list (a legacy multi-line string splits into items). */
	private funFactsOf(): string[] {
		const raw = this.contactData.funFacts;
		if (Array.isArray(raw)) {
			return raw.map((f) => String(f).trim()).filter(Boolean);
		}
		if (typeof raw === "string") {
			// Legacy single field: split on newlines or the " · " separator
			return raw
				.split(/\r?\n|\s·\s/)
				.map((l) => l.trim())
				.filter(Boolean);
		}
		return [];
	}

	private renderFunFactsSection(container: HTMLElement) {
		const section = container.createDiv({
			cls: "contact-funfacts-section",
		});
		const facts = this.funFactsOf();

		if (facts.length === 0) {
			section.createDiv({
				cls: "section-helper-text",
				text: "A line or two worth remembering — where you met, an inside joke, what they're into.",
			});
		} else {
			const list = section.createDiv({
				cls: "contact-funfacts-list",
			});
			facts.forEach((fact, index) => {
				const row = list.createDiv({
					cls: "contact-funfact-item",
				});
				row.createSpan({ cls: "contact-funfact-text", text: fact });
				const del = row.createEl("button", {
					cls: "callander-button button-icon button-danger",
					attr: { "aria-label": "Remove fun fact" },
				});
				setIcon(del, "trash");
				const deleteFunFact = async () => {
					const arr = this.funFactsOf();
					arr.splice(index, 1);
					if (arr.length > 0) this.contactData.funFacts = arr;
					else delete this.contactData.funFacts;
					await this.saveContactData();
					this.render();
				};
				del.addEventListener("click", () => void deleteFunFact());
			});
		}

		const footer = section.createDiv({
			cls: "contact-section-footer",
		});
		const btn = footer.createEl("button", { cls: "callander-button" });
		setIcon(btn, "plus");
		btn.createSpan({ text: "Add fun fact" });
		btn.addEventListener("click", () => {
			new FunFactsModal(
				this.app,
				this.contactData.displayName || this.contactData.name || "",
				async (fact) => {
					if (!fact) return;
					this.contactData.funFacts = [...this.funFactsOf(), fact];
					await this.saveContactData();
					this.render();
				}
			).open();
		});
	}

	/** Normalized quote list (legacy plain strings read as { text }). */
	private quotesOf(): Quote[] {
		return asArray(this.contactData.quotes)
			.map((q): Quote => {
				if (typeof q === "string") return { text: q };
				const context = fieldOf(q, "context");
				return {
					text: toText(fieldOf(q, "text")),
					...(context ? { context: toText(context) } : {}),
				};
			})
			.filter((q) => q.text.length > 0);
	}

	private renderQuotesSection(container: HTMLElement) {
		const section = container.createDiv({
			cls: "contact-quotes-section",
		});
		const quotes = this.quotesOf();

		if (quotes.length === 0) {
			section.createDiv({
				cls: "section-helper-text",
				text: "Memorable things they've said — the one-liners you don't want to forget.",
			});
		}

		quotes.forEach((q, index) => {
			const row = section.createDiv({
				cls: "contact-quote-item plan-clickable-row",
			});
			row.addEventListener("click", () => this.openQuoteModal(index, q));
			row.createDiv({
				cls: "contact-quote-text",
				text: `“${q.text}”`,
			});
			if (q.context) {
				row.createDiv({
					cls: "contact-quote-context",
					text: `— ${q.context}`,
				});
			}
		});

		const footer = section.createDiv({
			cls: "contact-section-footer",
		});
		const addBtn = footer.createEl("button", {
			cls: "callander-button",
		});
		setIcon(addBtn, "plus");
		addBtn.createSpan({ text: "Add quote" });
		addBtn.addEventListener("click", () => this.openQuoteModal(null, null));
	}

	/** Normalized inside-joke list (legacy plain strings read as { text }). */
	private insideJokesOf(): InsideJoke[] {
		return asArray(this.contactData.insideJokes)
			.map((j): InsideJoke => {
				if (typeof j === "string") return { text: j };
				const context = fieldOf(j, "context");
				return {
					text: toText(fieldOf(j, "text")),
					...(context ? { context: toText(context) } : {}),
				};
			})
			.filter((j) => j.text.length > 0);
	}

	private renderInsideJokesSection(container: HTMLElement) {
		const section = container.createDiv({
			cls: "contact-quotes-section",
		});
		const jokes = this.insideJokesOf();

		if (jokes.length === 0) {
			section.createDiv({
				cls: "section-helper-text",
				text: "The jokes only the two of you get — keep them from fading.",
			});
		}

		// Same visual treatment as quotes: text row + muted context line
		jokes.forEach((j, index) => {
			const row = section.createDiv({
				cls: "contact-quote-item plan-clickable-row",
			});
			row.addEventListener("click", () =>
				this.openInsideJokeModal(index, j)
			);
			row.createDiv({
				cls: "contact-quote-text",
				text: j.text,
			});
			if (j.context) {
				row.createDiv({
					cls: "contact-quote-context",
					text: `— ${j.context}`,
				});
			}
		});

		const footer = section.createDiv({
			cls: "contact-section-footer",
		});
		const addBtn = footer.createEl("button", {
			cls: "callander-button",
		});
		setIcon(addBtn, "plus");
		addBtn.createSpan({ text: "Add inside joke" });
		addBtn.addEventListener("click", () =>
			this.openInsideJokeModal(null, null)
		);
	}

	private openInsideJokeModal(index: number | null, joke: InsideJoke | null) {
		new InsideJokeModal(
			this.app,
			this.contactData.displayName || this.contactData.name || "",
			joke,
			async (value) => {
				const list = this.insideJokesOf();
				if (index === null) list.push(value);
				else list[index] = value;
				this.contactData.insideJokes = list;
				await this.saveContactData();
				this.render();
			},
			index === null
				? undefined
				: async () => {
						const list = this.insideJokesOf();
						list.splice(index, 1);
						if (list.length > 0) this.contactData.insideJokes = list;
						else delete this.contactData.insideJokes;
						await this.saveContactData();
						this.render();
				  }
		).open();
	}

	private openQuoteModal(index: number | null, quote: Quote | null) {
		new QuoteModal(
			this.app,
			this.contactData.displayName || this.contactData.name || "",
			quote,
			async (value) => {
				const list = this.quotesOf();
				if (index === null) list.push(value);
				else list[index] = value;
				this.contactData.quotes = list;
				await this.saveContactData();
				this.render();
			},
			index === null
				? undefined
				: async () => {
						const list = this.quotesOf();
						list.splice(index, 1);
						if (list.length > 0) this.contactData.quotes = list;
						else delete this.contactData.quotes;
						await this.saveContactData();
						this.render();
				  }
		).open();
	}

	private renderInterestsSection(container: HTMLElement) {
		const section = container.createDiv({
			cls: "contact-interests-section",
		});

		const interests = asArray(this.contactData.interests) as Interest[];

		if (interests.length === 0) {
			section.createDiv({
				cls: "section-helper-text",
				text: "What they're into — books, music, teams, the food they love. Handy for gifts, plans, and picking a conversation back up.",
			});
		}

		// Grouped by category, in fixed category order
		for (const cat of INTEREST_CATEGORIES) {
			const items = interests
				.map((interest, index) => ({ interest, index }))
				.filter(
					({ interest }) =>
						this.normalizeInterestCategory(interest) === cat.id
				);

			if (items.length === 0) continue;

			const group = section.createDiv({
				cls: "contact-idea-group",
			});
			group.createDiv({
				cls: "contact-idea-group-header",
				text: `${cat.emoji} ${cat.label}`,
			});

			const chips = group.createDiv({
				cls: "contact-interest-chips",
			});
			for (const { interest, index } of items) {
				const chip = chips.createDiv({
					cls: "contact-interest-chip",
				});
				chip.createSpan({ text: interest.text });
				if (interest.detail) {
					chip.createSpan({
						cls: "contact-interest-chip-detail",
						text: ` · ${interest.detail}`,
					});
				}

				const removeBtn = chip.createEl("button", {
					cls: "contact-interest-chip-remove",
					attr: { "aria-label": `Remove ${interest.text}` },
				});
				setIcon(removeBtn, "x");
				const removeInterest = async () => {
					this.removeFromList("interests", index);
					await this.saveContactData();
					this.render();
				};
				removeBtn.addEventListener("click", () =>
					void removeInterest()
				);
			}
		}

		// Capture goes through the modal, below the list
		const footer = section.createDiv({
			cls: "contact-section-footer",
		});
		const addButton = footer.createEl("button", {
			cls: "callander-button",
			text: "Add interest",
		});
		addButton.addEventListener("click", () => this.openAddInterestModal());
	}

	private openAddInterestModal() {
		new InterestModal(
			this.app,
			this.contactData.displayName || this.contactData.name || "",
			this.lastInterestCategory,
			async (category, text, detail) => {
				this.lastInterestCategory = category;
				this.pushToList("interests", {
					category,
					text,
					...(detail && { detail }),
				});
				await this.saveContactData();
				this.render();
			}
		).open();
	}

	private async renderExtrasSection(container: HTMLElement) {
		const extrasSection = container.createDiv({
			cls: "contact-extras-section",
		});

		if (!this._file) return;

		const headerContainer = extrasSection.createDiv({
			cls: "contact-extras-header",
		});

		// Add helper text if no markdown content
		const content = await this.app.vault.cachedRead(this._file);
		const extrasContent =
			content.split(/^---\n([\s\S]*?)\n---/).pop() || "";

		if (!extrasContent.trim()) {
			headerContainer.createDiv({
				cls: "section-helper-text",
				text: "Add formatted text, links, and other Markdown content",
			});
		}

		try {
			const content = await this.app.vault.cachedRead(this._file);
			const extrasContent =
				content.split(/^---\n([\s\S]*?)\n---/).pop() || "";

			if (extrasContent.trim()) {
				const contentDiv = extrasSection.createDiv({
					cls: "contact-extras-content",
				});

				await MarkdownRenderer.render(
					this.app,
					extrasContent,
					contentDiv,
					this._file.path,
					this
				);

				// Add click handlers for internal links
				contentDiv.addEventListener("click", (event) => {
					const target = event.target as HTMLElement;
					if (target.tagName === "A") {
						const anchor = target as HTMLAnchorElement;
						const href = anchor.getAttribute("href");

						if (href?.startsWith("#")) {
							// Handle internal anchor links
							event.preventDefault();
							const targetEl = contentDiv.querySelector(href);
							targetEl?.scrollIntoView();
						} else if (!href?.startsWith("http")) {
							// Handle internal Obsidian links
							event.preventDefault();
							void this.app.workspace.openLinkText(
								href || "",
								this._file?.path || "",
								event.ctrlKey || event.metaKey
							);
						}
					}
				});
			}
		} catch (error) {
			console.error(
				`Error reading extras from file ${this._file.path}:`,
				error
			);
		}

		// Edit button sits below the rendered content
		const footer = extrasSection.createDiv({
			cls: "contact-section-footer",
		});
		const editButton = footer.createEl("button", {
			cls: "callander-button",
			text: "Edit markdown",
		});
		editButton.addEventListener("click", () => {
			// Bypass the contact-view intercept — here we WANT raw markdown
			this.plugin.openPathAsMarkdown(this._file?.path || "");
		});
	}

	private adjustTextareaHeight(textarea: HTMLTextAreaElement) {
		textarea.classList.add("measuring");
		textarea.style.setProperty(
			"--scroll-height",
			`${textarea.scrollHeight}px`
		);
		textarea.classList.remove("measuring");
	}

	async saveContactData() {
		if (!this._file) return;

		// Our own write will fire a modify event — ignore it briefly so we
		// don't reload on top of ourselves
		this.writingUntil = Date.now() + 1500;

		// Sort events by date in descending order (newest first),
		// respecting flexible-precision dates
		if (Array.isArray(this.contactData.events)) {
			this.contactData.events.sort((a: FriendEvent, b: FriendEvent) => {
				const emptyFlex = {
					year: null,
					month: null,
					day: null,
				};
				return (
					flexSortKey(parseFlexDate(b.date) ?? emptyFlex) -
					flexSortKey(parseFlexDate(a.date) ?? emptyFlex)
				);
			});
		}

		// People and plans carry a last-updated stamp; group pages don't
		const path = this._file.path;
		const stampUpdated =
			path.startsWith(
				this.plugin.contactOperations.getPeopleFolderPath() + "/"
			) ||
			path.startsWith(
				this.plugin.planOperations.getPlansFolderPath() + "/"
			);
		await this.app.fileManager.processFrontMatter(
			this._file,
			(frontmatter: Record<string, unknown>) => {
				Object.assign(frontmatter, this.contactData);
				// Legacy keys are migrated on load — remove them from disk
				if (!("giftIdeas" in this.contactData)) {
					delete frontmatter.giftIdeas;
				}
				if (!("interactions" in this.contactData)) {
					delete frontmatter.interactions;
				}
				if (stampUpdated) {
					frontmatter.updated = todayISO();
				}
			}
		);
	}

	// Modal methods
	private async openAddFieldModal() {
		const modal = new AddFieldModal(this.app, async (fieldName) => {
			if (!this.contactData[fieldName]) {
				this.contactData[fieldName] = "";
				await this.saveContactData();
				this.render();
			} else {
				new Notice("Field already exists!");
			}
		});
		modal.open();
	}

	private async openAddEventModal() {
		const modal = new EventModal(
			this.app,
			null,
			async (date, text, type, location, link, description) => {
				await this.addEvent(
					date,
					text,
					type,
					location,
					link,
					description
				);
			}
		);
		modal.open();
	}

	public async addEvent(
		date: string,
		text: string,
		type: EventType,
		location?: string,
		link?: string,
		description?: string
	) {
		this.pushToList("events", {
			date,
			text,
			type,
			...(location && { location }),
			...(link && { link }),
			...(description && { description }),
		});
		await this.saveContactData();
		this.render();
	}

	public async openEditEventModal(index: number, event: FriendEvent) {
		const modal = new EventModal(
			this.app,
			event,
			async (date, text, type, location, link, description) => {
				const events = this.eventsList();
				this.contactData.events = events;
				// Preserve extra properties (e.g. diary source link)
				events[index] = {
					...events[index],
					date,
					text,
					type,
				};
				if (location) {
					events[index].location = location;
				} else {
					delete events[index].location;
				}
				if (link) {
					events[index].link = link;
				} else {
					delete events[index].link;
				}
				if (description) {
					events[index].description = description;
				} else {
					delete events[index].description;
				}
				await this.saveContactData();
				this.render();
			},
			async () => {
				await this.deleteEvent(index);
			},
			() => {
				if (this._file) {
					new CopyEventModal(
						this.app,
						this.plugin,
						event,
						this._file.path
					).open();
				}
			}
		);
		modal.open();
	}

	public async deleteEvent(index: number) {
		this.eventsList().splice(index, 1);
		await this.saveContactData();
		this.render();
	}

	async updateContactData(field: string, value: string | string[]) {
		this.contactData[field] = value;
		await this.saveContactData();
	}
}
