import {
	App,
	PluginSettingTab,
	Setting,
	AbstractInputSuggest,
	TFolder,
	normalizePath,
} from "obsidian";
import type FriendTracker from "@/main";
import type { ContactWithCountdown } from "@/types";

class FolderSuggest extends AbstractInputSuggest<string> {
	inputEl: HTMLInputElement;

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		this.inputEl = inputEl;
	}

	getSuggestions(inputStr: string): string[] {
		const folders = this.app.vault
			.getAllLoadedFiles()
			.filter((f) => f instanceof TFolder)
			.map((f) => f.path);
		return folders.filter((f) =>
			f.toLowerCase().includes(inputStr.toLowerCase())
		);
	}

	renderSuggestion(value: string, el: HTMLElement): void {
		el.setText(value);
	}

	selectSuggestion(value: string): void {
		this.inputEl.value = value;
		this.inputEl.trigger("input");
		this.close();
	}
}

export class FriendTrackerSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: FriendTracker) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const sortColumns: Array<{
			value: keyof Omit<ContactWithCountdown, "file">;
			label: string;
		}> = [
			{ value: "name", label: "Name" },
			{ value: "age", label: "Age" },
			{ value: "birthday", label: "Birthday" },
			{ value: "daysUntilBirthday", label: "Days until birthday" },
			{ value: "relationship", label: "Relationship" },
			{ value: "lastInteraction", label: "Last event" },
			{ value: "met", label: "Met" },
			{ value: "openIdeas", label: "Open ideas" },
		];

		new Setting(containerEl)
			.setName("Contacts folder")
			.setDesc("Folder where contact files will be stored")
			.addText((text) => {
				new FolderSuggest(this.app, text.inputEl);
				return text
					.setPlaceholder("Enter folder name")
					.setValue(this.plugin.settings.contactsFolder)
					.onChange(async (value) => {
						this.plugin.settings.contactsFolder =
							normalizePath(value);
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Diary folder")
			.setDesc("Folder where diary entries will be stored")
			.addText((text) => {
				new FolderSuggest(this.app, text.inputEl);
				return text
					.setPlaceholder("Enter folder name")
					.setValue(this.plugin.settings.diaryFolder)
					.onChange(async (value) => {
						this.plugin.settings.diaryFolder = normalizePath(value);
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Default sort")
			.setDesc("Choose how contacts are sorted by default")
			.addDropdown((dropdown) => {
				sortColumns.forEach(({ value, label }) => {
					dropdown.addOption(value, label);
				});
				return dropdown
					.setValue(this.plugin.settings.defaultSortColumn)
					.onChange(async (value) => {
						this.plugin.settings.defaultSortColumn =
							value as keyof Omit<ContactWithCountdown, "file">;
						await this.plugin.saveSettings();
					});
			})
			.addDropdown((dropdown) => {
				dropdown
					.addOption("asc", "Ascending")
					.addOption("desc", "Descending")
					.setValue(this.plugin.settings.defaultSortDirection)
					.onChange(async (value) => {
						this.plugin.settings.defaultSortDirection = value as
							| "asc"
							| "desc";
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Belated birthday window")
			.setDesc(
				"For this many days after a birthday, show \"birthday was X days ago\" so you can still send a belated message"
			)
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "0";
				text.inputEl.max = "60";
				text.setValue(
					String(this.plugin.settings.belatedBirthdayDays)
				).onChange(async (value) => {
					const parsed = Number(value);
					if (Number.isFinite(parsed)) {
						this.plugin.settings.belatedBirthdayDays = Math.min(
							60,
							Math.max(0, Math.round(parsed))
						);
						await this.plugin.saveSettings();
					}
				});
			});

		new Setting(containerEl)
			.setName("Open friends in Callander view")
			.setDesc(
				"Clicking a friend's note anywhere (file explorer, quick switcher, links, graph) opens their Callander page instead of raw markdown. The Markdown tab still gets you to the underlying note."
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.openContactsInCallanderView)
					.onChange(async (value) => {
						this.plugin.settings.openContactsInCallanderView =
							value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Birthday reminders on startup")
			.setDesc(
				"Show a notice with today's and upcoming birthdays when Obsidian opens (once per day)"
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.showBirthdayReminders)
					.onChange(async (value) => {
						this.plugin.settings.showBirthdayReminders = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Reminder window")
			.setDesc("Include birthdays up to this many days away")
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "1";
				text.inputEl.max = "60";
				text.setValue(
					String(this.plugin.settings.birthdayReminderDays)
				).onChange(async (value) => {
					const parsed = Number(value);
					if (Number.isFinite(parsed)) {
						this.plugin.settings.birthdayReminderDays = Math.min(
							60,
							Math.max(1, Math.round(parsed))
						);
						await this.plugin.saveSettings();
					}
				});
			});

		new Setting(containerEl)
			.setName("Show \"Met\" column")
			.setDesc("Show when you met each friend in the overview table")
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.showMetColumn)
					.onChange(async (value) => {
						this.plugin.settings.showMetColumn = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Show \"Ideas\" column")
			.setDesc(
				"Show how many open ideas you have per friend in the overview table"
			)
			.addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings.showIdeasColumn)
					.onChange(async (value) => {
						this.plugin.settings.showIdeasColumn = value;
						await this.plugin.saveSettings();
					});
			});

		const headerContainer = containerEl.createEl("div", {
			cls: "friend-tracker-relationship-header",
		});

		headerContainer.createEl("h3", { text: "Relationship types" });

		new Setting(headerContainer).addButton((button) =>
			button.setButtonText("Add relationship type").onClick(async () => {
				// Create a temporary input field
				const tempInput = document.createElement("input");
				tempInput.type = "text";
				tempInput.placeholder = "Enter relationship type";
				tempInput.className =
					"friend-tracker-modal-input relationship-type-input";

				// Replace button with input temporarily
				button.buttonEl.replaceWith(tempInput);
				tempInput.focus();

				const handleAdd = async () => {
					const fullValue = tempInput.value || "";
					const value = fullValue.trim();

					if (value) {
						const newType = value.toLowerCase();
						if (
							!this.plugin.settings.relationshipTypes.includes(
								newType
							)
						) {
							this.plugin.settings.relationshipTypes.push(
								newType
							);
							await this.plugin.saveSettings();
						}
					}
					// Schedule the display update after the current event
					setTimeout(() => this.display(), 0);
				};

				tempInput.addEventListener("keydown", async (e) => {
					if (e.key === "Enter") {
						e.preventDefault();
						await handleAdd();
					} else if (e.key === "Escape") {
						this.display();
					}
				});

				// Only handle blur if there's a value
				tempInput.addEventListener("blur", async () => {
					if (tempInput.value?.trim()) {
						await handleAdd();
					} else {
						this.display();
					}
				});
			})
		);

		const relationshipContainer = containerEl.createEl("div", {
			cls: "friend-tracker-relationship-types",
		});

		this.plugin.settings.relationshipTypes.forEach((type) => {
			new Setting(relationshipContainer)
				.addText((text) =>
					text
						.setValue(type)
						.setPlaceholder("Type name")
						.then((textComponent) => {
							// Save on Enter
							textComponent.inputEl.addEventListener(
								"keypress",
								async (e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										textComponent.inputEl.blur();
									}
								}
							);

							// Save on blur
							textComponent.inputEl.addEventListener(
								"blur",
								async () => {
									const value = textComponent.inputEl.value;
									const index =
										this.plugin.settings.relationshipTypes.indexOf(
											type
										);
									if (
										value.toLowerCase() !== type ||
										value !== value.toLowerCase()
									) {
										const newType = value.toLowerCase();
										this.plugin.settings.relationshipTypes =
											[
												...this.plugin.settings.relationshipTypes.filter(
													(t, i) =>
														i === index ||
														t.toLowerCase() !==
															newType
												),
											];
										this.plugin.settings.relationshipTypes[
											index
										] = newType;
										await this.plugin.saveSettings();
										// Schedule the display update after the current event
										setTimeout(() => this.display(), 0);
									}
								}
							);
						})
				)
				.addExtraButton((button) => {
					button
						.setIcon("trash")
						.setTooltip("Delete relationship type")
						.onClick(async () => {
							const index =
								this.plugin.settings.relationshipTypes.indexOf(
									type
								);
							this.plugin.settings.relationshipTypes.splice(
								index,
								1
							);
							await this.plugin.saveSettings();
							this.display();
						});
				});
		});

		// ("Default tab" setting retired 2026-07-22 — the contact page now
		// stacks Ideas / Timeline / Notes / Markdown instead of tabs.)
	}
}
