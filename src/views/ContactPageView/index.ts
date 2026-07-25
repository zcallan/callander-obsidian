import {
	ItemView,
	WorkspaceLeaf,
	Notice,
	TFile,
	setIcon,
	parseYaml,
	MarkdownRenderer,
} from "obsidian";
import type FriendTracker from "@/main";
import { ContactFields } from "@/components/ContactFields";
import { EventTimeline } from "@/components/EventTimeline";
import type { FriendEvent, Idea, Interest } from "@/types";
import { AddFieldModal } from "@/modals/AddFieldModal";
import { createBirthdayPrecisionInput } from "@/components/BirthdayInput";
import { createFlexDateInput } from "@/components/FlexDateInput";
import { EventModal } from "@/modals/EventModal";
import { ResurfaceModal } from "@/modals/ResurfaceModal";
import { ConfirmModal } from "@/modals/ConfirmModal";
import {
	ContactSuggestModal,
	QuickIdeaModal,
} from "@/modals/QuickIdeaModal";
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
	PLAN_PRIORITIES,
	TRAVEL_TYPES,
	TRAVEL_TYPE_EMOJI,
} from "@/constants";
import type { PlanItem, PlanSimpleItem, PlanTimelineEntry } from "@/types";
import { PlanOperations } from "@/services/PlanOperations";
import { PlanDetailsModal } from "@/modals/PlanDetailsModal";
import { AddPlanMemberModal } from "@/modals/AddPlanMemberModal";
import { PlanItemModal } from "@/modals/PlanItemModal";
import { PlanSimpleItemModal } from "@/modals/PlanSimpleItemModal";
import { InterestModal } from "@/modals/InterestModal";
import { PlanCostModal } from "@/modals/PlanCostModal";
import { CopyEventModal } from "@/modals/CopyEventModal";
import { NoteInputModal } from "@/modals/NoteInputModal";
import {
	parseFlexDate,
	formatFlexDate,
	formatTimeSince,
	flexSortKey,
} from "@/utils/flexdate";

export const VIEW_TYPE_CONTACT_PAGE = "contact-page-view";

export class ContactPageView extends ItemView {
	private _file: TFile | null = null;
	private contactData: any = {};
	private contactFields: ContactFields;
	private eventTimeline: EventTimeline;
	public plugin: FriendTracker;
	private lastIdeaCategory: IdeaCategory = "gift";
	private lastInterestCategory: InterestCategory = "books";
	/** Guards against reacting to our own writes */
	private writingUntil = 0;

	public getRelationshipTypes(): string[] {
		return this.plugin.settings.relationshipTypes;
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
					this.setFile(this._file);
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

	async setState(state: any, result: any) {
		const file = this.app.vault.getFileByPath(state.filePath);
		const fileChanged = !!file && file.path !== this._file?.path;
		if (file) {
			await this.setFile(file);
		}
		// Friend → friend navigation keeps the same view type, and Obsidian
		// only records tab history for same-type navigation when the view
		// reports that its state changed (as FileView does for files).
		if (fileChanged && result) {
			result.history = true;
			result.layout = true;
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
			this.contactData = yamlMatch ? parseYaml(yamlMatch[1]) : {};
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
			container.createEl("div", {
				text: "No contact data available",
				cls: "contact-empty-state",
			});
			return;
		}

		// Header with name
		const header = container.createEl("div", {
			cls: "contact-page-header",
		});
		const nameContainer = header.createEl("div", {
			cls: "contact-name-container",
		});
		this.renderNameSection(nameContainer);

		// Settings + Mark as done / Reopen, stacked below the title (plans only)
		if (this.isPlanFile()) {
			header.addClass("plan-page-header");
			const actions = header.createEl("div", {
				cls: "contact-header-actions plan-page-actions",
			});
			const settingsButton = actions.createEl("button", {
				cls: "friend-tracker-button contact-header-action",
				attr: { "aria-label": "Plan settings" },
			});
			setIcon(settingsButton, "settings-2");
			settingsButton.createSpan({ text: "Settings" });
			settingsButton.addEventListener("click", () =>
				this.openPlanDetailsModal()
			);
			this.createPlanDoneButton(actions);
		}

		// Quick actions, top-right (friends only)
		if (!this.isGroupFile() && !this.isPlanFile()) {
			const actions = header.createEl("div", {
				cls: "contact-header-actions",
			});
			const action = (
				icon: string,
				label: string,
				onClick: () => void
			) => {
				const btn = actions.createEl("button", {
					cls: "friend-tracker-button contact-header-action",
				});
				setIcon(btn, icon);
				btn.createSpan({ text: label });
				btn.addEventListener("click", onClick);
			};
			action("lightbulb", "Add idea", () => this.openAddIdeaModal());
			action("milestone", "Add event", () =>
				this.openAddEventModal()
			);
			action("pencil-line", "Quick note", () =>
				this.openQuickNote()
			);
		}

		// Plans are their own page shape: meta, members, buckets, notes
		if (this.isPlanFile()) {
			this.renderPlanMeta(container);
			this.renderPlanDrafts(container);
			const membersSection = container.createEl("div", {
				cls: "contact-info-section",
			});
			this.renderPlanMembers(membersSection);

			const planContent = container.createEl("div", {
				cls: "contact-content contact-content-stacked",
			});
			const planSection = (icon: string, label: string) => {
				const wrap = planContent.createEl("div", {
					cls: "contact-stack-section",
				});
				const header = wrap.createEl("div", {
					cls: "contact-stack-header",
				});
				setIcon(
					header.createSpan({ cls: "contact-stack-header-icon" }),
					icon
				);
				header.createSpan({ text: label });
				return wrap;
			};

			this.renderPlanTimeline(planSection("calendar-clock", "Timeline"));
			this.renderPlanIdeas(planSection("lightbulb", "Ideas"));
			this.renderPlanSimpleList(
				planSection("plane", "Travel"),
				"travel",
				"Add travel"
			);
			this.renderPlanSimpleList(
				planSection("bed", "Accommodation"),
				"accommodation",
				"Add accommodation"
			);
			this.renderPlanBring(planSection("backpack", "What to bring"));
			this.renderPlanCosts(
				planSection("dollar-sign", "Cost breakdown")
			);
			this.renderNotesSection(planSection("pencil", "Notes"));
			this.renderExtrasSection(
				planSection("document", "Links & details")
			);
			return;
		}

		// Friends get the attribute fields; groups get a members list instead
		if (this.isGroupFile()) {
			const membersSection = container.createEl("div", {
				cls: "contact-info-section",
			});
			this.renderGroupMembers(membersSection);
		} else {
			const infoSection = container.createEl("div", {
				cls: "contact-info-section",
			});
			this.renderInfoSection(infoSection);
		}

		// Drafts awaiting triage sit above everything — they're unfinished
		this.renderDraftsStrip(container);

		// Stacked sections: Ideas first, then Timeline, then Notes, then
		// the raw-markdown extras. (Tabs may return one day — each section
		// is still its own render method, so flipping back is trivial.)
		const contentContainer = container.createEl("div", {
			cls: "contact-content contact-content-stacked",
		});

		const section = (icon: string, label: string) => {
			const wrap = contentContainer.createEl("div", {
				cls: "contact-stack-section",
			});
			const header = wrap.createEl("div", {
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
		// Interests are about the friend, not a group — friends only
		if (!this.isGroupFile()) {
			this.renderInterestsSection(section("heart", "Interests"));
		}
		this.renderEventsSection(section("milestone", "Timeline"));
		this.renderNotesSection(section("pencil", "Notes"));
		this.renderExtrasSection(section("document", "Markdown"));
	}

	private renderNameSection(container: HTMLElement) {
		const nameSection = container.createEl("div", {
			cls: "contact-name-section",
		});

		const nameDisplay = nameSection.createEl("div", {
			cls: "contact-name-display",
		});

		const editContainer = nameDisplay.createEl("div", {
			cls: "contact-name-row",
		});

		const nameText = editContainer.createEl("h1", {
			text:
				this.contactData.displayName ||
				this.contactData.name ||
				"Unnamed Contact",
		});

		const nameInput = editContainer.createEl("input", {
			type: "text",
			value: this.contactData.name || "",
			placeholder: "Contact name",
			cls: "contact-name-input",
		});

		const editButton = editContainer.createEl("button", {
			cls: "friend-tracker-button button-icon contact-name-edit",
		});
		setIcon(editButton, "pencil");

		// Add birthday-derived details, at whatever precision is recorded
		const birthdayFlex = parseFlexDate(this.contactData.birthday);
		if (birthdayFlex && birthdayFlex.month) {
			const { year, month, day } = birthdayFlex;

			// Age is only known when the year is
			if (year !== null) {
				const ageText =
					this.plugin.contactOperations.calculateDetailedAge(
						this.contactData.birthday
					);
				if (ageText) {
					nameDisplay.createEl("span", {
						text: ageText,
						cls: "contact-age-display",
					});
				}
			}

			// Countdown sits directly under the age
			const countdownContainer = nameDisplay.createEl("div", {
				cls: "contact-birthday-countdown",
			});

			if (day === null) {
				// Day unknown: month-level countdown, only when near
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
			} else {
				const daysUntil = this.calculateDaysUntilBirthday(
					this.contactData.birthday
				);
				const daysSince =
					this.plugin.contactOperations.calculateDaysSinceBirthday(
						this.contactData.birthday
					);
				const belatedWindow = this.plugin.settings.belatedBirthdayDays;

				if (daysUntil === null) {
					countdownContainer.remove();
				} else if (daysUntil === 0) {
					// Birthday today - show cake
					countdownContainer.createEl("div", {
						cls: "table-birthday-indicator birthday-today",
						text: "🎂",
					});
					countdownContainer.createSpan({
						text: "Birthday today!",
					});
				} else if (
					daysSince !== null &&
					daysSince > 0 &&
					daysSince <= belatedWindow
				) {
					// Recently passed — it's not too late for a belated message
					const belatedText =
						daysSince === 1
							? "Birthday was yesterday"
							: `Birthday was ${daysSince} days ago`;
					countdownContainer.createSpan({
						cls: "contact-birthday-belated",
						text: belatedText,
					});
				} else if (daysUntil > 90) {
					// Far-off birthdays don't need a countdown
					countdownContainer.remove();
				} else {
					// Show dot if within a week
					if (daysUntil <= 7) {
						const dotContainer = countdownContainer.createEl(
							"div",
							{
								cls: "birthday-status-dot",
							}
						);
						dotContainer.createEl("div", {
							cls: "birthday-status-dot-inner",
						});
					}

					const daysText =
						daysUntil === 1
							? "Birthday tomorrow!"
							: `${daysUntil} days until birthday`;

					countdownContainer.createSpan({
						text: daysText,
					});
				}
			}

			// Optional birthday trivia, each behind a setting
			const s = this.plugin.settings;
			if (day !== null && s.showStarSign) {
				nameDisplay.createEl("span", {
					text: `Star sign: ${this.getZodiacSign(month, day)}`,
					cls: "contact-age-display",
				});
			}
			if (year !== null && s.showChineseZodiac) {
				nameDisplay.createEl("span", {
					text: `Zodiac: ${this.getChineseZodiac(year)}`,
					cls: "contact-age-display",
				});
			}
			if (s.showBirthstone) {
				nameDisplay.createEl("span", {
					text: `Birthstone: ${this.getBirthstone(month)}`,
					cls: "contact-age-display",
				});
			}
			if (s.showBirthFlower) {
				nameDisplay.createEl("span", {
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
			nameDisplay.createEl("span", {
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
			nameDisplay.createEl("span", {
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
				saveNameChange();
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
							const view = await leaf.view;
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

		nameInput.addEventListener("change", saveNameChange);
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
		const fieldsContainer = container.createEl("div", {
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
							"birthdayWished",
							"created",
							"updated",
						].includes(key)
				)
				.forEach(([key, value]) => {
					if (!value) return; // Skip empty values
					if (Array.isArray(value) && value.length === 0) return;

					const field = fieldsContainer.createEl("div", {
						cls: "contact-field-view",
						attr: {
							"data-field": key.toLowerCase(),
						},
					});

					field.createEl("div", {
						cls: "contact-field-label",
						text: key,
					});

					// Groups render as colored chips, not plain text
					if (key === "groups" && Array.isArray(value)) {
						const ops = this.plugin.contactOperations;
						const colorOf = new Map(
							ops.getGroupInfos().map((i) => [i.name, i.color])
						);
						const chips = field.createEl("div", {
							cls: "contact-group-chips",
						});
						for (const g of value.map(String)) {
							const chip = chips.createEl("span", {
								cls: "contact-group-chip readonly",
							});
							const dot = chip.createEl("span", {
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

					field.createEl("div", {
						cls: "contact-field-value",
						text: displayValue as string,
					});
				});

			// Add edit button at the bottom
			const editButton = fieldsContainer.createEl("button", {
				cls: "friend-tracker-button",
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
							this.contactData[field]
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
				cls: "friend-tracker-button button-outlined",
				text: "Add custom field",
			});
			addFieldButton.addEventListener("click", () => {
				this.openAddFieldModal();
			});

			// Add done button
			const doneButton = fieldsContainer.createEl("button", {
				cls: "friend-tracker-button button-primary button-full-width",
				text: "Done",
			});

			doneButton.addEventListener("click", async () => {
				await this.saveContactData();
				renderViewMode();
			});
		};

		// Initial render in view mode
		renderViewMode();
	}

	/**
	 * "When we met" with honest vagueness: record just the year, the month,
	 * or the exact day — whatever you actually remember.
	 */
	private createMetField(container: HTMLElement) {
		const fieldContainer = container.createEl("div", {
			cls: "contact-field",
		});

		fieldContainer.createEl("label", { text: "met" });

		createFlexDateInput(fieldContainer, this.contactData.met, (value) => {
			this.updateContactData("met", value);
		});
	}

	/**
	 * Birthday with honest imprecision: exact date, month + year (day
	 * unknown), or month + day (year unknown).
	 */
	private createBirthdayField(container: HTMLElement) {
		const fieldContainer = container.createEl("div", {
			cls: "contact-field",
		});

		fieldContainer.createEl("label", { text: "birthday" });

		createBirthdayPrecisionInput(
			fieldContainer,
			this.contactData.birthday,
			(value) => {
				this.updateContactData("birthday", value);
			}
		);
	}

	/** Groups as toggle chips with color dots; new groups via a small input */
	private createGroupsField(container: HTMLElement) {
		const ops = this.plugin.contactOperations;
		const fieldContainer = container.createEl("div", {
			cls: "contact-field contact-field-groups",
		});
		fieldContainer.createEl("label", { text: "groups" });

		const wrap = fieldContainer.createEl("div", {
			cls: "contact-groups-edit",
		});
		const chipsRow = wrap.createEl("div", { cls: "contact-group-chips" });

		const member = new Set<string>(
			Array.isArray(this.contactData.groups) ? this.contactData.groups : []
		);
		const infos = ops.getGroupInfos();
		const colorOf = new Map(infos.map((i) => [i.name, i.color]));
		const known = [
			...new Set([...infos.map((i) => i.name), ...member]),
		].sort();

		const save = () => {
			this.updateContactData("groups", [...member].sort());
		};

		const addChip = (name: string) => {
			const chip = chipsRow.createEl("button", {
				cls: `contact-group-chip ${member.has(name) ? "selected" : ""}`,
			});
			const dot = chip.createEl("span", { cls: "group-dot" });
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
			wrap.createEl("div", {
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
		const fieldContainer = container.createEl("div", {
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
			this.updateContactData(field, input.value);
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

		const fragment = document.createDocumentFragment();
		fragment.createSpan({ text: "Idea done! " });
		const logButton = fragment.createEl("button", {
			cls: "friend-tracker-button contact-log-event-button",
			text: "Log on timeline",
		});

		const notice = new Notice(fragment, 8000);
		logButton.addEventListener("click", async () => {
			notice.hide();
			const today = new Date().toISOString().split("T")[0];
			// Gifts given get their own type; everything else was time spent
			const type: EventType =
				this.normalizeCategory(idea) === "gift" ? "given" : "hangout";
			await this.addEvent(today, eventText, type);
			new Notice("Added to timeline");
		});
	}

	private renderNotesSection(container: HTMLElement) {
		const notesSection = container.createEl("div", {
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

		setTimeout(() => {
			this.adjustTextareaHeight(notesInput);
		}, 0);

		notesInput.addEventListener("change", async () => {
			if (!this._file) return;
			this.contactData.notes = notesInput.value;
			await this.saveContactData();
		});
	}

	private renderEventsSection(container: HTMLElement) {
		const eventsSection = container.createEl("div", {
			cls: "contact-events-section",
		});

		const headerContainer = eventsSection.createEl("div", {
			cls: "contact-events-header",
		});

		const events: FriendEvent[] = Array.isArray(this.contactData.events)
			? this.contactData.events
			: [];

		// Add helper text if no events yet
		if (events.length === 0) {
			headerContainer.createEl("div", {
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
		const footer = eventsSection.createEl("div", {
			cls: "contact-section-footer",
		});
		const addButton = footer.createEl("button", {
			cls: "friend-tracker-button",
			text: "Add event",
		});
		addButton.addEventListener("click", () => {
			this.openAddEventModal();
		});

		this.renderDiaryMentions(eventsSection);
	}

	private renderDraftsStrip(container: HTMLElement) {
		const drafts = Array.isArray(this.contactData.drafts)
			? this.contactData.drafts
			: [];
		if (drafts.length === 0) return;

		const strip = container.createEl("div", {
			cls: "contact-drafts-strip",
		});
		strip.createEl("div", {
			cls: "contact-idea-group-header",
			text: "✏️ Drafts to sort",
		});

		drafts.forEach((draft: any, index: number) => {
			const row = strip.createEl("div", { cls: "contact-draft-row" });
			row.createSpan({
				cls: "contact-draft-text",
				text: typeof draft === "string" ? draft : draft.text,
			});

			const ideaButton = row.createEl("button", {
				cls: "friend-tracker-button",
				text: "Make idea",
			});
			ideaButton.addEventListener("click", () => {
				new QuickIdeaModal(
					this.app,
					this.contactData.displayName || this.contactData.name,
					this.lastIdeaCategory,
					async (category, text) => {
						this.lastIdeaCategory = category;
						if (!Array.isArray(this.contactData.ideas)) {
							this.contactData.ideas = [];
						}
						this.contactData.ideas.push({
							category,
							text,
							done: false,
						});
						this.contactData.drafts.splice(index, 1);
						if (this.contactData.drafts.length === 0) {
							delete this.contactData.drafts;
						}
						await this.saveContactData();
						this.render();
					},
					typeof draft === "string" ? draft : draft.text
				).open();
			});

			const deleteButton = row.createEl("button", {
				cls: "friend-tracker-button button-icon button-danger",
				attr: { "aria-label": "Discard draft" },
			});
			setIcon(deleteButton, "trash");
			deleteButton.addEventListener("click", () => {
				const text = typeof draft === "string" ? draft : draft.text;
				const preview =
					text.length > 80 ? text.slice(0, 80) + "…" : text;
				new ConfirmModal(
					this.app,
					"Discard draft",
					`Discard "${preview}"?`,
					"Discard",
					async () => {
						this.contactData.drafts.splice(index, 1);
						if (this.contactData.drafts.length === 0) {
							delete this.contactData.drafts;
						}
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

	private renderPlanMeta(container: HTMLElement) {
		const meta = container.createEl("div", {
			cls: "contact-info-section plan-meta",
		});

		const parts: string[] = [];
		const dateFlex = parseFlexDate(this.contactData.date);
		if (dateFlex) {
			let when = this.formatPlanDateRange();
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

		const linesWrap = meta.createEl("div", { cls: "plan-meta-lines" });
		linesWrap.createEl("div", {
			cls: "plan-meta-line",
			text: parts.join("  ·  "),
		});
		if (this.contactData.location) {
			linesWrap.createEl("div", {
				cls: "plan-meta-line",
				text: `📍 ${this.contactData.location}`,
			});
		}

		const buttonsWrap = meta.createEl("div", {
			cls: "plan-meta-buttons",
		});

		const noteButton = buttonsWrap.createEl("button", {
			cls: "friend-tracker-button",
		});
		setIcon(noteButton, "pencil-line");
		noteButton.createSpan({ text: "Quick note" });
		noteButton.addEventListener("click", () => this.openQuickNote());

		const copyButton = buttonsWrap.createEl("button", {
			cls: "friend-tracker-button",
		});
		setIcon(copyButton, "copy");
		copyButton.createSpan({ text: "Copy as message" });
		copyButton.addEventListener("click", async () => {
			await navigator.clipboard.writeText(this.buildPlanShareText());
			new Notice("📋 Copied — ready to paste into iMessage");
		});
	}

	/** Edit the plan's date, end date & location. */
	private openPlanDetailsModal() {
		new PlanDetailsModal(
			this.app,
			{
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
				this.render();
			}
		).open();
	}

	private createPlanDoneButton(container: HTMLElement) {
		const isDone = this.contactData.status === "done";
		const doneButton = container.createEl("button", {
			cls: "friend-tracker-button contact-header-action",
		});
		setIcon(doneButton, isDone ? "rotate-ccw" : "check");
		doneButton.createSpan({ text: isDone ? "Reopen plan" : "Mark as done" });
		doneButton.addEventListener("click", () => {
			if (this.contactData.status === "done") {
				this.contactData.status = "planning";
				this.saveContactData().then(() => this.render());
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
							this.contactData.name,
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
	private formatPlanDateRange(): string {
		const start = parseFlexDate(this.contactData.date);
		if (!start) return "";
		const end = parseFlexDate(this.contactData.endDate);

		const exact = (d: {
			year: number | null;
			month: number | null;
			day: number | null;
		}) =>
			d.year !== null && d.month !== null && d.day !== null
				? new Date(d.year, d.month - 1, d.day)
				: null;

		const startDate = exact(start);
		const endDate = end ? exact(end) : null;

		if (!startDate) return formatFlexDate(start);

		// Both ends fully formatted, day-first: "Thu 30 Jul"
		const fmt = (d: Date) =>
			d.toLocaleDateString("en-AU", {
				weekday: "short",
				day: "numeric",
				month: "short",
			});

		if (!endDate || endDate.getTime() === startDate.getTime()) {
			return fmt(startDate);
		}
		return `${fmt(startDate)} - ${fmt(endDate)}`;
	}

	/** Member display names — resolved contacts use displayName, guests as-is */
	private planMemberDisplays(list?: string[]): string[] {
		const members: string[] =
			list ??
			(Array.isArray(this.contactData.members)
				? this.contactData.members
				: []);
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
						this.app.metadataCache.getFileCache(dest)
							?.frontmatter?.displayName ?? dest.basename
				  )
				: linktext;
		});
	}

	/** The iMessage-ready version of a plan. Costs stay out of the invite. */
	private buildPlanShareText(): string {
		const lines: string[] = [String(this.contactData.name ?? "")];

		const range = this.formatPlanDateRange();
		if (range) lines.push(range);
		if (this.contactData.location) {
			lines.push(String(this.contactData.location));
		}

		// You're on the trip too — lead with your name, dedupe if you
		// also happen to be listed as a guest
		const yourName = this.plugin.settings.yourName;
		const memberNames = this.planMemberDisplays().filter(
			(n) => !yourName || n.toLowerCase() !== yourName.toLowerCase()
		);
		const fullNames = yourName
			? [yourName, ...memberNames]
			: memberNames;
		const unconfirmedFulls = this.planMemberDisplays(
			Array.isArray(this.contactData.unconfirmedMembers)
				? this.contactData.unconfirmedMembers
				: []
		);
		// Shorten across the whole pool so dupes disambiguate consistently
		const shortened = this.shortenMemberNames([
			...fullNames,
			...unconfirmedFulls,
		]);
		const names = shortened.slice(0, fullNames.length);
		const unconfirmedNames = shortened.slice(fullNames.length);
		if (names.length > 0) {
			lines.push(`${names.join(", ")} (${names.length})`);
		}
		if (unconfirmedNames.length > 0) {
			lines.push(`Unconfirmed: ${unconfirmedNames.join(", ")}`);
		}

		// Travel & accommodation as plain context lines
		const withDuration = (i: { text: string; duration?: string }) =>
			i.duration ? `${i.text} (${i.duration})` : i.text;
		const travel = PlanOperations.simpleListOf(this.contactData, "travel");
		travel.forEach((t) => {
			const icon = t.type ? `${TRAVEL_TYPE_EMOJI[t.type]} ` : "";
			const when = [
				t.date ? this.formatTravelDate(t.date) : "",
				t.time ? this.formatItemTime(t.time) : "",
			]
				.filter(Boolean)
				.join(" ");
			const prefix = when ? `${when} — ` : "";
			const who = t.people ? ` (${t.people})` : "";
			lines.push(`${icon}${prefix}${withDuration(t)}${who}`);
		});
		const stay = PlanOperations.simpleListOf(
			this.contactData,
			"accommodation"
		);
		stay.forEach((a) => lines.push(withDuration(a)));

		const items: PlanItem[] = Array.isArray(this.contactData.items)
			? this.contactData.items
			: [];

		// Ideas under one "Plans:" heading — must-dos first, maybes marked
		if (items.length > 0) {
			lines.push("", "Plans:");
			const musts = items.filter(
				(i) => (i.priority ?? "maybe") === "must"
			);
			const maybes = items.filter(
				(i) => (i.priority ?? "maybe") !== "must"
			);
			musts.forEach((i) => lines.push(`- ${i.text}`));
			maybes.forEach((i) =>
				lines.push(`- ${i.text} (if there's time)`)
			);
		}

		// Checked state stays personal — the message lists everything
		const bring = PlanOperations.bringOf(this.contactData);
		if (bring.length > 0) {
			lines.push("", "Bring:");
			bring.forEach((b) => lines.push(`- ${b.text}`));
		}

		return lines.join("\n");
	}

	/**
	 * Message style: first names only — with a last initial appended when
	 * two people share a first name ("Austin M, Austin P").
	 */
	private shortenMemberNames(fullNames: string[]): string[] {
		const firstCounts = new Map<string, number>();
		for (const name of fullNames) {
			const first = name.trim().split(/\s+/)[0].toLowerCase();
			firstCounts.set(first, (firstCounts.get(first) ?? 0) + 1);
		}
		return fullNames.map((name) => {
			const parts = name.trim().split(/\s+/);
			const first = parts[0];
			const isDupe = (firstCounts.get(first.toLowerCase()) ?? 0) > 1;
			if (isDupe && parts.length > 1) {
				return `${first} ${parts[1].charAt(0).toUpperCase()}`;
			}
			return first;
		});
	}

	/** Resolve the plan's wikilink members to contact files */
	private resolvePlanMembers(): TFile[] {
		if (!this._file) return [];
		const members: string[] = Array.isArray(this.contactData.members)
			? this.contactData.members
			: [];
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

	private async renderPlanMembers(container: HTMLElement) {
		if (!this._file) return;
		const yourName = this.plugin.settings.yourName;
		const members: string[] = Array.isArray(this.contactData.members)
			? this.contactData.members
			: [];
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
		// Count everyone at the table: contacts, guests, and you
		const total = visible.length + (yourName ? 1 : 0);

		container.createEl("div", {
			cls: "contact-field-label",
			text: `Who's in (${total})`,
		});
		const chips = container.createEl("div", {
			cls: "contact-group-chips plan-member-chips",
		});

		const removeMember = async (index: number) => {
			this.contactData.members.splice(index, 1);
			if (this.contactData.members.length === 0) {
				delete this.contactData.members;
			}
			await this.saveContactData();
			this.render();
		};

		if (yourName) {
			const chip = chips.createEl("span", {
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
						this.app.metadataCache.getFileCache(dest)
							?.frontmatter?.displayName ?? dest.basename
				  )
				: linktext;

			const chip = chips.createEl("span", {
				cls: "contact-group-chip readonly plan-member-chip",
			});
			const nameEl = chip.createSpan({
				cls: dest ? "plan-chip-name" : undefined,
				text: display,
			});
			if (dest) {
				nameEl.addEventListener("click", () =>
					this.app.workspace.openLinkText(dest.path, "", false)
				);
			}
			const removeEl = chip.createSpan({
				cls: "contact-member-remove",
				text: "✕",
				attr: { "aria-label": "Remove from plan" },
			});
			removeEl.addEventListener("click", () => removeMember(index));
		}

		// Unconfirmed people, in their own section (only when there are any)
		const unconfirmed: string[] = Array.isArray(
			this.contactData.unconfirmedMembers
		)
			? this.contactData.unconfirmedMembers
			: [];
		if (unconfirmed.length > 0) {
			container.createEl("div", {
				cls: "plan-member-sublabel",
				text: "Unconfirmed",
			});
			const unconfirmedChips = container.createEl("div", {
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

				const chip = unconfirmedChips.createEl("span", {
					cls: "contact-group-chip readonly plan-member-chip plan-member-unconfirmed",
				});
				const nameEl = chip.createSpan({
					cls: dest ? "plan-chip-name" : undefined,
					text: display,
				});
				if (dest) {
					nameEl.addEventListener("click", () =>
						this.app.workspace.openLinkText(dest.path, "", false)
					);
				}
				const confirmEl = chip.createSpan({
					cls: "plan-chip-confirm",
					text: "✓",
					attr: { "aria-label": "Confirm — they're in" },
				});
				confirmEl.addEventListener("click", async () => {
					this.contactData.unconfirmedMembers.splice(index, 1);
					if (this.contactData.unconfirmedMembers.length === 0) {
						delete this.contactData.unconfirmedMembers;
					}
					if (!Array.isArray(this.contactData.members)) {
						this.contactData.members = [];
					}
					this.contactData.members.push(raw);
					await this.saveContactData();
					this.render();
				});
				const removeEl = chip.createSpan({
					cls: "contact-member-remove",
					text: "✕",
					attr: { "aria-label": "Remove" },
				});
				removeEl.addEventListener("click", async () => {
					this.contactData.unconfirmedMembers.splice(index, 1);
					if (this.contactData.unconfirmedMembers.length === 0) {
						delete this.contactData.unconfirmedMembers;
					}
					await this.saveContactData();
					this.render();
				});
			});
		}

		const addRow = container.createEl("div", {
			cls: "plan-member-add-row",
		});
		const addButton = addRow.createEl("button", {
			cls: "friend-tracker-button button-outlined",
			text: "Add person",
		});
		addButton.addEventListener("click", async () => {
			const contacts =
				await this.plugin.contactOperations.getContacts();
			const existing = new Set(
				this.resolvePlanMembers().map((f) => f.path)
			);
			new AddPlanMemberModal(
				this.app,
				contacts.filter((c) => !existing.has(c.file.path)),
				async ({ contact, name }, isUnconfirmed) => {
					const entry = contact
						? `[[${contact.file.basename}]]`
						: name;
					const key = isUnconfirmed
						? "unconfirmedMembers"
						: "members";
					if (!Array.isArray(this.contactData[key])) {
						this.contactData[key] = [];
					}
					this.contactData[key].push(entry);
					await this.saveContactData();
					this.render();
				}
			).open();
		});
	}

	private renderPlanDrafts(container: HTMLElement) {
		const drafts = Array.isArray(this.contactData.drafts)
			? this.contactData.drafts
			: [];
		if (drafts.length === 0) return;

		const strip = container.createEl("div", {
			cls: "contact-drafts-strip",
		});
		strip.createEl("div", {
			cls: "contact-idea-group-header",
			text: "✏️ Drafts to sort",
		});

		drafts.forEach((draft: any, index: number) => {
			const text = typeof draft === "string" ? draft : draft.text;
			const row = strip.createEl("div", { cls: "contact-draft-row" });
			row.createSpan({ cls: "contact-draft-text", text });

			const ideaButton = row.createEl("button", {
				cls: "friend-tracker-button",
				text: "Make idea",
			});
			ideaButton.addEventListener("click", () => {
				new PlanItemModal(
					this.app,
					String(this.contactData.name ?? ""),
					async (value) => {
						if (!Array.isArray(this.contactData.items)) {
							this.contactData.items = [];
						}
						this.contactData.items.push(value);
						this.contactData.drafts.splice(index, 1);
						if (this.contactData.drafts.length === 0) {
							delete this.contactData.drafts;
						}
						await this.saveContactData();
						this.render();
					},
					{ category: "activity", priority: "must", text }
				).open();
			});

			const deleteBtn = row.createEl("button", {
				cls: "friend-tracker-button button-icon button-danger",
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
						this.contactData.drafts.splice(index, 1);
						if (this.contactData.drafts.length === 0) {
							delete this.contactData.drafts;
						}
						await this.saveContactData();
						this.render();
					}
				).open();
			});
		});
	}

	private renderPlanIdeas(container: HTMLElement) {
		const section = container.createEl("div", {
			cls: "contact-ideas-section plan-items-section",
		});

		const items = PlanOperations.itemsOf(this.contactData);

		// Dated ideas live on the timeline; the list holds the undated menu.
		if (!items.some((i) => !i.date)) {
			section.createEl("div", {
				cls: "section-helper-text",
				text: "Undated things to do together — activities, food, sights. Give one a date and it moves up to the timeline.",
			});
		}

		// Grouped by category, must-dos first within each
		for (const cat of PLAN_IDEA_CATEGORIES) {
			const catItems = items
				.map((item, index) => ({ item, index }))
				.filter(
					({ item }) =>
						!item.date &&
						(item.category ?? "activity") === cat.id
				)
				.sort(
					(a, b) =>
						(a.item.priority === "must" ? 0 : 1) -
						(b.item.priority === "must" ? 0 : 1)
				);
			if (catItems.length === 0) continue;

			const group = section.createEl("div", {
				cls: "contact-idea-group",
			});
			group.createEl("div", {
				cls: "contact-idea-group-header",
				text: `${cat.emoji} ${cat.label}`,
			});
			for (const { item, index } of catItems) {
				const row = group.createEl("div", {
					cls: "contact-idea-item",
				});
				const pri = PLAN_PRIORITIES.find(
					(p) => p.id === (item.priority ?? "maybe")
				);
				row.createEl("span", {
					cls: `plan-priority-tag priority-${
						item.priority ?? "maybe"
					}`,
					text: pri?.emoji ?? "",
					attr: { "aria-label": pri?.label ?? "" },
				});
				const textEl = row.createEl("div", {
					cls: "contact-idea-text",
					text: item.text,
				});
				if (item.cost !== undefined) {
					textEl.createSpan({
						cls: "plan-item-cost",
						text: ` · ${this.formatItemCost(item.cost)}`,
					});
				}
				if (item.people) {
					textEl.createSpan({
						cls: "plan-item-people",
						text: ` · 👥 ${item.people}`,
					});
				}
				const editBtn = row.createEl("button", {
					cls: "friend-tracker-button button-icon",
					attr: { "aria-label": "Edit idea" },
				});
				setIcon(editBtn, "pencil");
				editBtn.addEventListener("click", () =>
					this.openPlanIdeaModal(index, item)
				);
				const deleteBtn = row.createEl("button", {
					cls: "friend-tracker-button button-icon button-danger",
					attr: { "aria-label": "Remove idea" },
				});
				setIcon(deleteBtn, "trash");
				deleteBtn.addEventListener("click", async () => {
					const current = PlanOperations.itemsOf(this.contactData);
					current.splice(index, 1);
					if (current.length > 0) this.contactData.items = current;
					else delete this.contactData.items;
					await this.saveContactData();
					this.render();
				});
			}
		}

		const footer = section.createEl("div", {
			cls: "contact-section-footer",
		});
		const addButton = footer.createEl("button", {
			cls: "friend-tracker-button",
			text: "Add idea",
		});
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
		const section = container.createEl("div", {
			cls: "contact-ideas-section plan-items-section",
		});
		const open = (index: number | null, item: PlanSimpleItem | null) =>
			key === "travel"
				? this.openPlanTravelModal(index, item)
				: this.openPlanAccommodationModal(index, item);

		// Dated legs/stays live on the timeline; the list holds the undated
		// options. Keep each item's original index for edit/delete routing.
		const undated = PlanOperations.simpleListOf(this.contactData, key)
			.map((item, index) => ({ item, index }))
			.filter(({ item }) => !item.date);

		if (undated.length === 0) {
			section.createEl("div", {
				cls: "section-helper-text",
				text:
					key === "travel"
						? "How you're getting there and around — flights, trains, the drive. Add a date and it moves up to the timeline."
						: "Where you're staying — the Airbnb, a hotel, someone's place. Add a check-in date and it moves up to the timeline.",
			});
		}

		undated.forEach(({ item, index }) => {
			const row = section.createEl("div", { cls: "contact-idea-item" });
			const textEl = row.createEl("div", {
				cls: "contact-idea-text",
			});
			if (item.type && TRAVEL_TYPE_EMOJI[item.type]) {
				textEl.createSpan({
					cls: "plan-item-type-icon",
					text: TRAVEL_TYPE_EMOJI[item.type],
				});
			}
			textEl.createSpan({ text: item.text });
			if (item.duration) {
				textEl.createSpan({
					cls: "plan-item-duration",
					text: ` · ${item.duration}`,
				});
			}
			if (item.cost !== undefined) {
				textEl.createSpan({
					cls: "plan-item-cost",
					text: ` · ${this.formatItemCost(item.cost)}`,
				});
			}
			if (item.people) {
				textEl.createSpan({
					cls: "plan-item-people",
					text: ` · 👥 ${item.people}`,
				});
			}
			const editBtn = row.createEl("button", {
				cls: "friend-tracker-button button-icon",
				attr: { "aria-label": "Edit" },
			});
			setIcon(editBtn, "pencil");
			editBtn.addEventListener("click", () => open(index, item));
			const deleteBtn = row.createEl("button", {
				cls: "friend-tracker-button button-icon button-danger",
				attr: { "aria-label": "Remove" },
			});
			setIcon(deleteBtn, "trash");
			deleteBtn.addEventListener("click", async () => {
				const current = PlanOperations.simpleListOf(
					this.contactData,
					key
				);
				current.splice(index, 1);
				if (current.length > 0) this.contactData[key] = current;
				else delete this.contactData[key];
				await this.saveContactData();
				this.render();
			});
		});

		const footer = section.createEl("div", {
			cls: "contact-section-footer",
		});
		const addButton = footer.createEl("button", {
			cls: "friend-tracker-button",
			text: addLabel,
		});
		addButton.addEventListener("click", () => open(null, null));
	}

	/** Context-aware placeholders for the travel / accommodation modal. */
	private planSimplePlaceholders(key: "travel" | "accommodation") {
		return key === "travel"
			? { text: "e.g. Harry's car to the coast", duration: "e.g. 2h 30m" }
			: { text: "e.g. Beachfront Airbnb", duration: "e.g. 3 nights" };
	}

	/** Item cost label: an explicit 0 reads as "Free"; blank stays hidden. */
	private formatItemCost(cost: number): string {
		return cost === 0 ? "Free" : `$${cost}`;
	}

	/** "Thu 30 Jul" from an ISO date, en-AU. */
	private formatTravelDate(iso: string): string {
		const d = new Date(`${iso}T00:00:00`);
		if (isNaN(d.getTime())) return iso;
		const weekday = d.toLocaleDateString("en-AU", { weekday: "short" });
		const dayMonth = d.toLocaleDateString("en-AU", {
			day: "numeric",
			month: "short",
		});
		return `${weekday} ${dayMonth}`;
	}

	/** "10am" / "2:30pm" from a 24h "HH:MM"; passes through anything else. */
	private formatItemTime(time: string): string {
		const m = /^(\d{1,2}):(\d{2})$/.exec(time);
		if (!m) return time;
		let hour = parseInt(m[1], 10);
		const minute = m[2];
		const ampm = hour >= 12 ? "pm" : "am";
		hour = hour % 12 || 12;
		return minute === "00" ? `${hour}${ampm}` : `${hour}:${minute}${ampm}`;
	}

	/** Travel legs as an itinerary timeline, mirroring the friend timeline. */
	/**
	 * The plan as an itinerary: every dated item across ideas, travel and
	 * accommodation, grouped by day, earliest first. Derived on the fly from
	 * PlanOperations.timelineOf — each row points back to its one real item.
	 */
	private renderPlanTimeline(container: HTMLElement) {
		const section = container.createEl("div", {
			cls: "contact-ideas-section plan-items-section",
		});
		const entries = PlanOperations.timelineOf(this.contactData);

		if (entries.length === 0) {
			section.createEl("div", {
				cls: "section-helper-text",
				text: "Give an idea, travel leg or stay a date and it lands here in order — your itinerary as it firms up.",
			});
			return;
		}

		const timeline = section.createEl("div", {
			cls: "contact-timeline plan-timeline",
		});

		let currentDay: string | null = null;
		for (const entry of entries) {
			if (entry.date !== currentDay) {
				currentDay = entry.date;
				timeline.createEl("div", {
					cls: "contact-timeline-year plan-timeline-day",
					text: this.formatTimelineDay(entry.date),
				});
			}

			const row = timeline.createEl("div", {
				cls: `contact-timeline-item plan-timeline-item timeline-${entry.source}`,
			});
			// Tapping the row edits it — the only path on mobile.
			row.addEventListener("click", () => this.openTimelineEntry(entry));

			row.createEl("div", {
				cls: `contact-timeline-dot timeline-dot-${entry.source}`,
			});

			const when = [
				entry.emoji,
				entry.time ? this.formatItemTime(entry.time) : "",
			]
				.filter(Boolean)
				.join(" ");
			row.createEl("div", {
				cls: "contact-timeline-date",
				text: when,
			});

			const textEl = row.createEl("div", {
				cls: "contact-timeline-text",
				text: entry.text,
			});
			const metaBits: string[] = [];
			if (entry.duration) metaBits.push(entry.duration);
			if (entry.cost !== undefined)
				metaBits.push(this.formatItemCost(entry.cost));
			if (metaBits.length) {
				textEl.createSpan({
					cls: "plan-travel-meta",
					text: `  ·  ${metaBits.join("  ·  ")}`,
				});
			}

			if (entry.people) {
				row.createEl("div", {
					cls: "plan-travel-people",
					text: `👥 ${entry.people}`,
				});
			}

			const actions = row.createEl("div", {
				cls: "contact-timeline-actions",
			});
			const editBtn = actions.createEl("button", {
				cls: "friend-tracker-button button-icon",
				attr: { "aria-label": "Edit" },
			});
			setIcon(editBtn, "pencil");
			editBtn.addEventListener("click", (e) => {
				e.stopPropagation();
				this.openTimelineEntry(entry);
			});
			const deleteBtn = actions.createEl("button", {
				cls: "friend-tracker-button button-icon button-danger",
				attr: { "aria-label": "Remove" },
			});
			setIcon(deleteBtn, "trash");
			deleteBtn.addEventListener("click", async (e) => {
				e.stopPropagation();
				await this.deleteTimelineEntry(entry);
			});
		}
	}

	/** "Thursday 30 July" from an ISO date, en-AU. */
	private formatTimelineDay(iso: string): string {
		const d = new Date(`${iso}T00:00:00`);
		if (isNaN(d.getTime())) return iso;
		const weekday = d.toLocaleDateString("en-AU", { weekday: "long" });
		const dayMonth = d.toLocaleDateString("en-AU", {
			day: "numeric",
			month: "long",
		});
		return `${weekday} ${dayMonth}`;
	}

	/** Route a timeline row back to its real item's edit modal. */
	private openTimelineEntry(entry: PlanTimelineEntry) {
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

	/** Delete a timeline row's real item from its own source array. */
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

	/** Add (index null) or edit a travel leg via the shared item modal. */
	private openPlanTravelModal(index: number | null, item: PlanSimpleItem | null) {
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
				  }
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
			item
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
				  }
		).open();
	}

	private renderPlanBring(container: HTMLElement) {
		const section = container.createEl("div", {
			cls: "contact-ideas-section plan-items-section",
		});

		const bring = PlanOperations.bringOf(this.contactData);

		if (bring.length === 0) {
			section.createEl("div", {
				cls: "section-helper-text",
				text: "Trip-specific stuff — swimwear, speakers, meat for the BBQ. Toothbrushes can look after themselves.",
			});
		}

		bring.forEach((item, index) => {
			const row = section.createEl("div", {
				cls: `contact-idea-item ${item.done ? "done" : ""}`,
			});
			const checkbox = row.createEl("input", {
				attr: {
					type: "checkbox",
					"aria-label": "Sorted / packed",
				},
			});
			checkbox.checked = item.done;
			checkbox.addEventListener("change", async () => {
				const list = PlanOperations.bringOf(this.contactData);
				list[index] = { ...list[index], done: checkbox.checked };
				this.contactData.bring = list;
				await this.saveContactData();
				this.render();
			});
			row.createEl("div", {
				cls: "contact-idea-text",
				text: item.text,
			});
			const deleteBtn = row.createEl("button", {
				cls: "friend-tracker-button button-icon button-danger",
				attr: { "aria-label": "Remove item" },
			});
			setIcon(deleteBtn, "trash");
			deleteBtn.addEventListener("click", async () => {
				const list = PlanOperations.bringOf(this.contactData);
				list.splice(index, 1);
				if (list.length > 0) this.contactData.bring = list;
				else delete this.contactData.bring;
				await this.saveContactData();
				this.render();
			});
		});

		const addRow = section.createEl("div", {
			cls: "contact-ideas-add-row plan-bring-add-row",
		});
		const input = addRow.createEl("input", {
			cls: "contact-field-input",
			attr: { type: "text", placeholder: "Add something to bring..." },
		});
		const addButton = addRow.createEl("button", {
			cls: "friend-tracker-button",
			text: "Add",
		});
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
		addButton.addEventListener("click", addItem);
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") addItem();
		});
	}

	private planParticipants(): string[] {
		const names = this.planMemberDisplays();
		const yourName = this.plugin.settings.yourName;
		if (yourName && !names.some((n) => n.toLowerCase() === yourName.toLowerCase())) {
			return [yourName, ...names];
		}
		return names;
	}

	private renderPlanCosts(container: HTMLElement) {
		const section = container.createEl("div", {
			cls: "contact-ideas-section plan-items-section",
		});
		const costs = PlanOperations.costsOf(this.contactData);
		const participants = this.planParticipants();

		if (costs.length === 0) {
			section.createEl("div", {
				cls: "section-helper-text",
				text: "Split shared expenses — the Airbnb, petrol, groceries. Divide evenly or by shares (nights, drinks…).",
			});
		}

		// Running total each person owes across all expenses
		const owedTotals: Record<string, number> = {};
		costs.forEach((cost, index) => {
			const row = section.createEl("div", {
				cls: "contact-idea-item plan-cost-row",
			});
			const textEl = row.createEl("div", { cls: "contact-idea-text" });
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

			const editBtn = row.createEl("button", {
				cls: "friend-tracker-button button-icon",
				attr: { "aria-label": "Edit expense" },
			});
			setIcon(editBtn, "pencil");
			editBtn.addEventListener("click", () => {
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
			});
		});

		// Per-person summary
		if (costs.length > 0 && participants.length > 0) {
			const summary = section.createEl("div", {
				cls: "plan-cost-summary",
			});
			const total = costs.reduce((s, c) => s + c.amount, 0);
			summary.createEl("div", {
				cls: "plan-cost-summary-total",
				text: `Total: $${total.toFixed(2)}`,
			});
			for (const p of participants) {
				summary.createEl("div", {
					cls: "section-helper-text",
					text: `${p}: $${(owedTotals[p] ?? 0).toFixed(2)}`,
				});
			}
		}

		const footer = section.createEl("div", {
			cls: "contact-section-footer",
		});
		const addButton = footer.createEl("button", {
			cls: "friend-tracker-button",
			text: "Add expense",
		});
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

		container.createEl("div", {
			cls: "contact-field-label",
			text: `Members (${members.length})`,
		});

		const list = container.createEl("div", { cls: "group-member-list" });
		for (const m of members) {
			const row = list.createEl("div", { cls: "group-member-row" });

			const info = row.createEl("div", { cls: "group-member-info" });
			info.createEl("div", {
				cls: "group-member-name",
				text: m.displayName,
			});
			const metFlex = parseFlexDate(m.met);
			if (metFlex && metFlex.year !== null) {
				info.createEl("div", {
					cls: "group-member-met",
					text: `Met ${formatFlexDate(metFlex)}`,
				});
			}
			info.addEventListener("click", () => {
				this.app.workspace.openLinkText(m.file.path, "", false);
			});

			const removeBtn = row.createEl("button", {
				cls: "friend-tracker-button button-icon button-danger",
				attr: { "aria-label": "Remove from group" },
			});
			setIcon(removeBtn, "x");
			removeBtn.addEventListener("click", async () => {
				await ops.removeFriendFromGroup(m.file, groupName);
				this.render();
			});
		}

		const addButton = container.createEl("button", {
			cls: "friend-tracker-button button-outlined",
			text: "Add member",
		});
		addButton.addEventListener("click", async () => {
			const candidates = contacts.filter(
				(c) => !c.groups.includes(groupName)
			);
			new ContactSuggestModal(
				this.app,
				candidates,
				async (contact) => {
					await ops.addFriendToGroup(contact.file, groupName);
					this.render();
				},
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

		const section = container.createEl("div", {
			cls: "contact-diary-mentions",
		});
		section.createEl("div", {
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
				this.app.workspace.openLinkText(
					entry.file.path,
					"",
					true
				);
			});
		}
	}

	// Migrate legacy giftIdeas -> ideas (category: gift). In-memory on load;
	// the file itself is rewritten on the next save.
	private migrateLegacyGiftIdeas() {
		const legacy = this.contactData.giftIdeas;
		if (Array.isArray(legacy) && legacy.length > 0) {
			const existing: Idea[] = Array.isArray(this.contactData.ideas)
				? this.contactData.ideas
				: [];
			const migrated: Idea[] = legacy.map((g: any) => ({
				category: "gift",
				text: g?.text ?? String(g),
				done: !!g?.done,
			}));
			this.contactData.ideas = [...existing, ...migrated];
		}
		delete this.contactData.giftIdeas;
	}

	// Migrate legacy interactions -> events. Same shape ({date, text}), new
	// name and flexible dates. In-memory on load; rewritten on next save.
	// Old plan items had a single `bucket`; split into category+priority,
	// and move logistics items to the travel list. In-memory; persists on save.
	private migratePlanStructure() {
		if (!this.isPlanFile()) return;
		if (!Array.isArray(this.contactData.items)) return;
		if (!this.contactData.items.some((i: any) => i && "bucket" in i)) {
			return;
		}
		const newItems: any[] = [];
		const travel = Array.isArray(this.contactData.travel)
			? this.contactData.travel
			: [];
		for (const item of this.contactData.items) {
			if (item && "bucket" in item) {
				if (item.bucket === "logistics") {
					travel.push({
						text: item.text,
						...(item.cost && { cost: item.cost }),
					});
				} else {
					newItems.push({
						text: item.text,
						category: "activity",
						priority: item.bucket === "must" ? "must" : "maybe",
						...(item.cost && { cost: item.cost }),
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
		const legacy = this.contactData.interactions;
		if (Array.isArray(legacy) && legacy.length > 0) {
			const existing: FriendEvent[] = Array.isArray(
				this.contactData.events
			)
				? this.contactData.events
				: [];
			const migrated: FriendEvent[] = legacy.map((i: any) => ({
				date: i?.date ?? "",
				text: i?.text ?? String(i),
			}));
			this.contactData.events = [...existing, ...migrated];
		}
		delete this.contactData.interactions;
	}

	private normalizeCategory(idea: Idea): IdeaCategory {
		return IDEA_CATEGORIES.some((c) => c.id === idea.category)
			? idea.category
			: "other";
	}

	private renderIdeasSection(container: HTMLElement) {
		const ideasSection = container.createEl("div", {
			cls: "contact-ideas-section",
		});

		const ideas: Idea[] = Array.isArray(this.contactData.ideas)
			? this.contactData.ideas
			: [];

		// Add helper text if no ideas yet
		if (ideas.length === 0) {
			ideasSection.createEl("div", {
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

			const group = ideasSection.createEl("div", {
				cls: "contact-idea-group",
			});
			group.createEl("div", {
				cls: "contact-idea-group-header",
				text: `${cat.emoji} ${cat.label}`,
			});

			for (const { idea, index } of items) {
				const item = group.createEl("div", {
					cls: `contact-idea-item ${idea.done ? "done" : ""}`,
				});

				const checkbox = item.createEl("input", {
					attr: {
						type: "checkbox",
						"aria-label": "Mark idea as done",
					},
				});
				checkbox.checked = !!idea.done;
				checkbox.addEventListener("change", async () => {
					this.contactData.ideas[index].done = checkbox.checked;
					await this.saveContactData();
					this.render();
					if (checkbox.checked) {
						this.offerLogAsEvent(idea);
					}
				});

				const textEl = item.createEl("div", {
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
					cls: "friend-tracker-button button-icon",
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
								this.contactData.ideas[index].resurface =
									resurface;
							} else {
								delete this.contactData.ideas[index]
									.resurface;
							}
							await this.saveContactData();
							this.render();
						}
					).open();
				});

				const deleteBtn = item.createEl("button", {
					cls: "friend-tracker-button button-icon button-danger",
					attr: { "aria-label": "Delete idea" },
				});
				setIcon(deleteBtn, "trash");
				deleteBtn.addEventListener("click", async () => {
					this.contactData.ideas.splice(index, 1);
					await this.saveContactData();
					this.render();
				});
			}
		}

		// Capture goes through the modal, below the list
		const footer = ideasSection.createEl("div", {
			cls: "contact-section-footer",
		});
		const addButton = footer.createEl("button", {
			cls: "friend-tracker-button",
			text: "Add idea",
		});
		addButton.addEventListener("click", () => this.openAddIdeaModal());
	}

	// Capture a raw draft about this friend/plan — appears in the drafts
	// strip to triage later
	private openQuickNote() {
		new NoteInputModal(
			this.app,
			this.contactData.displayName || this.contactData.name,
			async (text) => {
				const created = new Date().toISOString().split("T")[0];
				if (!Array.isArray(this.contactData.drafts)) {
					this.contactData.drafts = [];
				}
				this.contactData.drafts.push({ text, created });
				await this.saveContactData();
				this.render();
			}
		).open();
	}

	private openAddIdeaModal() {
		new QuickIdeaModal(
			this.app,
			this.contactData.displayName || this.contactData.name,
			this.lastIdeaCategory,
			async (category, text) => {
				this.lastIdeaCategory = category;
				if (!Array.isArray(this.contactData.ideas)) {
					this.contactData.ideas = [];
				}
				this.contactData.ideas.push({
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
		return INTEREST_CATEGORIES.some((c) => c.id === interest.category)
			? interest.category
			: "other";
	}

	private renderInterestsSection(container: HTMLElement) {
		const section = container.createEl("div", {
			cls: "contact-interests-section",
		});

		const interests: Interest[] = Array.isArray(this.contactData.interests)
			? this.contactData.interests
			: [];

		if (interests.length === 0) {
			section.createEl("div", {
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

			const group = section.createEl("div", {
				cls: "contact-idea-group",
			});
			group.createEl("div", {
				cls: "contact-idea-group-header",
				text: `${cat.emoji} ${cat.label}`,
			});

			const chips = group.createEl("div", {
				cls: "contact-interest-chips",
			});
			for (const { interest, index } of items) {
				const chip = chips.createEl("div", {
					cls: "contact-interest-chip",
				});
				chip.createSpan({ text: interest.text });

				const removeBtn = chip.createEl("button", {
					cls: "contact-interest-chip-remove",
					attr: { "aria-label": `Remove ${interest.text}` },
				});
				setIcon(removeBtn, "x");
				removeBtn.addEventListener("click", async () => {
					this.contactData.interests.splice(index, 1);
					if (this.contactData.interests.length === 0) {
						delete this.contactData.interests;
					}
					await this.saveContactData();
					this.render();
				});
			}
		}

		// Capture goes through the modal, below the list
		const footer = section.createEl("div", {
			cls: "contact-section-footer",
		});
		const addButton = footer.createEl("button", {
			cls: "friend-tracker-button",
			text: "Add interest",
		});
		addButton.addEventListener("click", () => this.openAddInterestModal());
	}

	private openAddInterestModal() {
		new InterestModal(
			this.app,
			this.contactData.displayName || this.contactData.name,
			this.lastInterestCategory,
			async (category, text) => {
				this.lastInterestCategory = category;
				if (!Array.isArray(this.contactData.interests)) {
					this.contactData.interests = [];
				}
				this.contactData.interests.push({ category, text });
				await this.saveContactData();
				this.render();
			}
		).open();
	}

	private async renderExtrasSection(container: HTMLElement) {
		const extrasSection = container.createEl("div", {
			cls: "contact-extras-section",
		});

		if (!this._file) return;

		const headerContainer = extrasSection.createEl("div", {
			cls: "contact-extras-header",
		});

		// Add helper text if no markdown content
		const content = await this.app.vault.cachedRead(this._file);
		const extrasContent =
			content.split(/^---\n([\s\S]*?)\n---/).pop() || "";

		if (!extrasContent.trim()) {
			headerContainer.createEl("div", {
				cls: "section-helper-text",
				text: "Add formatted text, links, and other Markdown content",
			});
		}

		try {
			const content = await this.app.vault.cachedRead(this._file);
			const extrasContent =
				content.split(/^---\n([\s\S]*?)\n---/).pop() || "";

			if (extrasContent.trim()) {
				const contentDiv = extrasSection.createEl("div", {
					cls: "contact-extras-content",
				});

				await MarkdownRenderer.renderMarkdown(
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
							this.app.workspace.openLinkText(
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
		const footer = extrasSection.createEl("div", {
			cls: "contact-section-footer",
		});
		const editButton = footer.createEl("button", {
			cls: "friend-tracker-button",
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
			this.contactData.events.sort(
				(a: FriendEvent, b: FriendEvent) => {
					const emptyFlex = {
						year: null,
						month: null,
						day: null,
					};
					return (
						flexSortKey(parseFlexDate(b.date) ?? emptyFlex) -
						flexSortKey(parseFlexDate(a.date) ?? emptyFlex)
					);
				}
			);
		}

		await this.app.fileManager.processFrontMatter(
			this._file,
			(frontmatter) => {
				Object.assign(frontmatter, this.contactData);
				// Legacy keys are migrated on load — remove them from disk
				if (!("giftIdeas" in this.contactData)) {
					delete frontmatter.giftIdeas;
				}
				if (!("interactions" in this.contactData)) {
					delete frontmatter.interactions;
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
			async (date, text, type) => {
				await this.addEvent(date, text, type);
			}
		);
		modal.open();
	}

	public async addEvent(date: string, text: string, type: EventType) {
		if (!Array.isArray(this.contactData.events)) {
			this.contactData.events = [];
		}
		this.contactData.events.push({ date, text, type });
		await this.saveContactData();
		this.render();
	}

	public async openEditEventModal(index: number, event: FriendEvent) {
		const modal = new EventModal(
			this.app,
			event,
			async (date, text, type) => {
				if (!Array.isArray(this.contactData.events)) {
					this.contactData.events = [];
				}
				// Preserve extra properties (e.g. diary source link)
				this.contactData.events[index] = {
					...this.contactData.events[index],
					date,
					text,
					type,
				};
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
		this.contactData.events.splice(index, 1);
		await this.saveContactData();
		this.render();
	}

	async updateContactData(field: string, value: string | string[]) {
		this.contactData[field] = value;
		await this.saveContactData();
	}
}
