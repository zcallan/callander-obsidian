import {
	App,
	AbstractInputSuggest,
	PluginSettingTab,
	Setting,
	TFolder,
	normalizePath,
	type SettingDefinitionItem,
} from "obsidian";
import type FriendTracker from "@/main";
import type { FriendTrackerSettings } from "@/types";

// The declarative settings API arrived in 1.13; below that Obsidian renders
// display() instead.

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

const TRIVIA_TOGGLES: Array<{
	key:
		| "showStarSign"
		| "showChineseZodiac"
		| "showBirthstone"
		| "showBirthFlower";
	name: string;
}> = [
	{ key: "showStarSign", name: "Show star sign" },
	{ key: "showBirthstone", name: "Show birthstone" },
	{ key: "showBirthFlower", name: "Show birth flower" },
	{ key: "showChineseZodiac", name: "Show Chinese zodiac" },
];

export class FriendTrackerSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: FriendTracker) {
		super(app, plugin);
	}

	// ---- Declarative path (Obsidian 1.13+) --------------------------------
	// On 1.13+ Obsidian renders these definitions (and indexes them for
	// settings search); display() below is the fallback for older versions.

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			// Unheaded — Obsidian's review guidelines (enforced by the
			// no-problematic-settings-headings lint rule) disallow a
			// "General" heading, since the whole tab is already understood
			// to be this plugin's settings.
			{
				name: "Base folder",
				desc: "Folder that holds your Callander data — the People, Groups, Plans and Somedays folders live inside it",
				control: {
					type: "folder",
					key: "baseFolder",
					placeholder: "Enter folder name",
				},
			},
			{
				name: "Your name",
				desc: 'Included automatically in shared plan messages ("Copy as message"), so you don\'t have to add yourself as a guest',
				control: {
					type: "text",
					key: "yourName",
					placeholder: "e.g. Callan",
				},
			},
			{
				name: "Open friends in Callander view",
				desc: "Clicking a friend's note anywhere (file explorer, quick switcher, links, graph) opens their Callander page instead of raw markdown. The Markdown tab still gets you to the underlying note.",
				control: {
					type: "toggle",
					key: "openContactsInCallanderView",
				},
			},
			{
				name: "Birthday reminders on startup",
				desc: "Show a notice with today's and upcoming birthdays when Obsidian opens (once per day)",
				control: {
					type: "toggle",
					key: "showBirthdayReminders",
				},
			},
			{
				name: "Birthday reminder window",
				desc: "Include birthdays up to this many days away",
				control: {
					type: "number",
					key: "birthdayReminderDays",
					min: 1,
					max: 60,
				},
			},
			{
				type: "group",
				heading: "Dashboard",
				items: [
					{
						name: "Dashboard file name",
						desc: "Note in the base folder that opens the Callander dashboard — quick ideas and drafts are stored in its properties",
						control: {
							type: "text",
							key: "dashboardFileName",
							placeholder: "Dashboard",
						},
					},
					{
						name: "Belated birthday window",
						desc: 'For this many days after a birthday, show "birthday was X days ago" so you can still send a belated message',
						control: {
							type: "number",
							key: "belatedBirthdayDays",
							min: 0,
							max: 60,
						},
					},
					{
						name: "Upcoming window",
						desc: "How far ahead the dashboard's Upcoming section looks. Anything further out stays tucked behind its \"Show all\" button",
						control: {
							type: "number",
							key: "upcomingDays",
							min: 1,
							max: 365,
						},
					},
				],
			},
			{
				type: "group",
				heading: "Friends",
				items: TRIVIA_TOGGLES.map(({ key, name }) => ({
					name,
					control: { type: "toggle", key },
				})),
			},
			{
				type: "group",
				heading: "Cost breakdown",
				items: [
					{
						name: "Default sales tax",
						desc: 'Pre-filled when you tick "Add sales tax?" on a by-receipt expense split (%)',
						control: {
							type: "number",
							key: "receiptTaxPercent",
							min: 0,
							max: 100,
						},
					},
					{
						name: "Default tip",
						desc: 'Pre-filled when you tick "Add tip?" on a by-receipt expense split (%)',
						control: {
							type: "number",
							key: "receiptTipPercent",
							min: 0,
							max: 100,
						},
					},
				],
			},
			{
				type: "group",
				heading: "Diary",
				items: [
					{
						name: "Diary folder",
						desc: "Folder where diary entries will be stored",
						control: {
							type: "folder",
							key: "diaryFolder",
							placeholder: "Enter folder name",
						},
					},
				],
			},
		];
	}

	// Only ever invoked on 1.13+, but written without any 1.13-only calls
	// (no super.*) so the plugin lints clean at the 1.7.2 floor.
	getControlValue(key: string): unknown {
		return this.plugin.settings[key as keyof FriendTrackerSettings];
	}

	setControlValue(key: string, value: unknown): void | Promise<void> {
		// Folder paths were normalized on entry before; keep that behavior
		if (key === "baseFolder" || key === "diaryFolder") {
			value = normalizePath(String(value));
		}
		// A basename, not a path — strip separators and stray whitespace
		if (key === "dashboardFileName") {
			value = String(value).replace(/[\\/]/g, "-").trim();
		}
		Object.assign(this.plugin.settings, { [key]: value });
		return this.plugin.saveSettings();
	}

	// ---- Imperative fallback (Obsidian < 1.13) ----------------------------

	display(): void {
		this.renderFallback();
	}

	// Split from display() so internal re-renders don't reference the
	// deprecated method name
	private renderFallback(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Unheaded — see the matching comment in getSettingDefinitions().
		new Setting(containerEl)
			.setName("Base folder")
			.setDesc(
				"Folder that holds your Callander data — the People, Groups, Plans and Somedays folders live inside it"
			)
			.addText((text) => {
				new FolderSuggest(this.app, text.inputEl);
				return text
					.setPlaceholder("Enter folder name")
					.setValue(this.plugin.settings.baseFolder)
					.onChange(async (value) => {
						this.plugin.settings.baseFolder =
							normalizePath(value);
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Your name")
			.setDesc(
				'Included automatically in shared plan messages ("Copy as message"), so you don\'t have to add yourself as a guest'
			)
			.addText((text) => {
				text.setPlaceholder("e.g. Callan")
					.setValue(this.plugin.settings.yourName)
					.onChange(async (value) => {
						this.plugin.settings.yourName = value.trim();
						await this.plugin.saveSettings();
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
			.setName("Birthday reminder window")
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

		new Setting(containerEl).setName("Dashboard").setHeading();

		new Setting(containerEl)
			.setName("Dashboard file name")
			.setDesc(
				"Note in the base folder that opens the Callander dashboard — quick ideas and drafts are stored in its properties"
			)
			.addText((text) => {
				text.setPlaceholder("Dashboard")
					.setValue(this.plugin.settings.dashboardFileName)
					.onChange(async (value) => {
						this.plugin.settings.dashboardFileName = value
							.replace(/[\\/]/g, "-")
							.trim();
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Belated birthday window")
			.setDesc(
				'For this many days after a birthday, show "birthday was X days ago" so you can still send a belated message'
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
			.setName("Upcoming window")
			.setDesc(
				'How far ahead the dashboard\'s Upcoming section looks. Anything further out stays tucked behind its "Show all" button'
			)
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "1";
				text.inputEl.max = "365";
				text.setValue(
					String(this.plugin.settings.upcomingDays)
				).onChange(async (value) => {
					const parsed = Number(value);
					if (Number.isFinite(parsed)) {
						this.plugin.settings.upcomingDays = Math.min(
							365,
							Math.max(1, Math.round(parsed))
						);
						await this.plugin.saveSettings();
					}
				});
			});

		new Setting(containerEl).setName("Friends").setHeading();

		for (const { key, name } of TRIVIA_TOGGLES) {
			new Setting(containerEl).setName(name).addToggle((toggle) => {
				toggle
					.setValue(this.plugin.settings[key])
					.onChange(async (value) => {
						this.plugin.settings[key] = value;
						await this.plugin.saveSettings();
					});
			});
		}

		new Setting(containerEl).setName("Cost breakdown").setHeading();

		const percentSetting = (
			name: string,
			desc: string,
			key: "receiptTaxPercent" | "receiptTipPercent"
		) => {
			new Setting(containerEl)
				.setName(name)
				.setDesc(desc)
				.addText((text) => {
					text.inputEl.type = "number";
					text.inputEl.min = "0";
					text.inputEl.max = "100";
					text.setValue(String(this.plugin.settings[key])).onChange(
						async (value) => {
							const parsed = Number(value);
							if (Number.isFinite(parsed)) {
								this.plugin.settings[key] = Math.min(
									100,
									Math.max(0, parsed)
								);
								await this.plugin.saveSettings();
							}
						}
					);
				});
		};
		percentSetting(
			"Default sales tax",
			'Pre-filled when you tick "Add sales tax?" on a by-receipt expense split (%)',
			"receiptTaxPercent"
		);
		percentSetting(
			"Default tip",
			'Pre-filled when you tick "Add tip?" on a by-receipt expense split (%)',
			"receiptTipPercent"
		);

		new Setting(containerEl).setName("Diary").setHeading();

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
	}
}
