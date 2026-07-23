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
import type { FriendEvent, Idea } from "@/types";
import { AddFieldModal } from "@/modals/AddFieldModal";
import { createBirthdayPrecisionInput } from "@/components/BirthdayInput";
import { createFlexDateInput } from "@/components/FlexDateInput";
import { EventModal } from "@/modals/EventModal";
import { ResurfaceModal } from "@/modals/ResurfaceModal";
import { ContactSuggestModal } from "@/modals/QuickIdeaModal";
import { VIEW_TYPE_FRIEND_TRACKER } from "@/views/FriendTrackerView";
import { FriendTrackerView } from "@/views/FriendTrackerView";
import {
	STANDARD_FIELDS,
	SYSTEM_FIELDS,
	IDEA_CATEGORIES,
	IdeaCategory,
} from "@/constants";
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

			// Star sign needs the day
			if (day !== null) {
				nameDisplay.createEl("span", {
					text: `Star sign: ${this.getZodiacSign(month, day)}`,
					cls: "contact-age-display",
				});
			}

			nameDisplay.createEl("span", {
				text: `Birthstone: ${this.getBirthstone(month)}`,
				cls: "contact-age-display",
			});
			nameDisplay.createEl("span", {
				text: `Birth flower: ${this.getBirthFlower(month)}`,
				cls: "contact-age-display",
			});
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
		const infoSection = container.createEl("div", {
			cls: "contact-info-section",
		});

		const fieldsContainer = infoSection.createEl("div", {
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

		// Brand-new group, minted right here
		const addRow = wrap.createEl("div", { cls: "contact-groups-add-row" });
		const input = addRow.createEl("input", {
			cls: "contact-field-input",
			attr: { type: "text", placeholder: "New group…" },
		});
		const addButton = addRow.createEl("button", {
			cls: "friend-tracker-button",
			text: "Add",
		});
		const addNew = () => {
			const name = input.value.trim().toLowerCase();
			if (!name || member.has(name)) return;
			member.add(name);
			if (!known.includes(name)) addChip(name);
			chipsRow
				.findAll(".contact-group-chip")
				.forEach((el) =>
					el.toggleClass(
						"selected",
						member.has(
							(el.textContent ?? "").trim().toLowerCase()
						)
					)
				);
			input.value = "";
			save();
		};
		addButton.addEventListener("click", addNew);
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				addNew();
			}
		});
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
		const verbs: Record<IdeaCategory, string> = {
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
			await this.addEvent(today, eventText);
			new Notice("Added to timeline");
		});
	}

	private renderNotesSection(container: HTMLElement) {
		const notesSection = container.createEl("div", {
			cls: "contact-notes-section",
		});

		const notesInput = notesSection.createEl("textarea", {
			cls: "contact-notes-input",
			attr: {
				placeholder:
					"Add notes about family members, parents' names, or anything else you want to remember...",
			},
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
				text: "Log things that happened — meetups, their life events, memorable outings. Rough dates are fine: \"May 2026\" is a perfectly good answer to when.",
			});
		}

		const addButton = headerContainer.createEl("button", {
			cls: "friend-tracker-button button-align-right",
			text: "Add event",
		});
		addButton.addEventListener("click", () => {
			this.openAddEventModal();
		});

		if (events.length > 0 || this.contactData.met) {
			this.eventTimeline.render(
				eventsSection,
				events,
				this.contactData.met
			);
		}

		this.renderDiaryMentions(eventsSection);
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

		// Capture row: category picker + text input + add button
		const addRow = ideasSection.createEl("div", {
			cls: "contact-ideas-add-row",
		});

		const categorySelect = addRow.createEl("select", {
			cls: "dropdown contact-idea-category-select",
		});
		IDEA_CATEGORIES.forEach((cat) => {
			categorySelect.createEl("option", {
				value: cat.id,
				text: `${cat.emoji} ${cat.label}`,
			});
		});
		categorySelect.value = this.lastIdeaCategory;
		categorySelect.addEventListener("change", () => {
			this.lastIdeaCategory = categorySelect.value as IdeaCategory;
		});

		const ideaInput = addRow.createEl("input", {
			cls: "contact-field-input",
			attr: {
				type: "text",
				placeholder: "Add an idea...",
			},
		});

		const addButton = addRow.createEl("button", {
			cls: "friend-tracker-button",
			text: "Add",
		});

		const addIdea = async () => {
			const text = ideaInput.value.trim();
			if (!text) return;
			if (!Array.isArray(this.contactData.ideas)) {
				this.contactData.ideas = [];
			}
			this.contactData.ideas.push({
				category: categorySelect.value as IdeaCategory,
				text,
				done: false,
			});
			await this.saveContactData();
			this.render();
		};

		addButton.addEventListener("click", addIdea);
		ideaInput.addEventListener("keydown", (event) => {
			if (event.key === "Enter") {
				addIdea();
			}
		});

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

		const editButton = headerContainer.createEl("button", {
			cls: "friend-tracker-button button-align-right",
			text: "Edit markdown",
		});

		editButton.addEventListener("click", () => {
			// Bypass the contact-view intercept — here we WANT raw markdown
			this.plugin.openPathAsMarkdown(this._file?.path || "");
		});

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
			async (date: string, text: string) => {
				await this.addEvent(date, text);
			}
		);
		modal.open();
	}

	public async addEvent(date: string, text: string) {
		if (!Array.isArray(this.contactData.events)) {
			this.contactData.events = [];
		}
		this.contactData.events.push({ date, text });
		await this.saveContactData();
		this.render();
	}

	public async openEditEventModal(index: number, event: FriendEvent) {
		const modal = new EventModal(
			this.app,
			event,
			async (date: string, text: string) => {
				if (!Array.isArray(this.contactData.events)) {
					this.contactData.events = [];
				}
				// Preserve extra properties (e.g. diary source link)
				this.contactData.events[index] = {
					...this.contactData.events[index],
					date,
					text,
				};
				await this.saveContactData();
				this.render();
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
