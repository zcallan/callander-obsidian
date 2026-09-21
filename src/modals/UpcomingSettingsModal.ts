import { App, Modal } from "obsidian";
import type FriendTracker from "@/main";
import { categoryShown, setCategoryShown } from "@/utils/eventCategories";
import { EVENT_TYPES } from "@/constants";

/**
 * What the dashboard's Upcoming shows: events, plans, and which event
 * categories. Laid out like Getting started — a row per choice, a line on
 * what it does, and the control at the end — and applied as it's ticked:
 * the save is what redraws the section behind the modal.
 */
export class UpcomingSettingsModal extends Modal {
	constructor(app: App, private plugin: FriendTracker) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("upcoming-settings-modal");
		contentEl.createEl("h2", { text: "Upcoming" });
		const settings = this.plugin.settings;

		this.section("Calendars");
		this.row(
			"Events",
			"Everything on your calendar this week and next.",
			settings.upcomingShowEvents,
			(on) => {
				settings.upcomingShowEvents = on;
			}
		);
		// upcomingShowPlans, which used to be a toggle in the plugin's own
		// settings — this is its only home now, beside the section it's for.
		this.row(
			"Plans",
			"Trips and plans starting soon, among the events.",
			settings.upcomingShowPlans,
			(on) => {
				settings.upcomingShowPlans = on;
			}
		);

		// Calendar entries only — a timeline record is kept on someone's
		// page and never reaches Upcoming, so it's no reason to list a type.
		const events = this.plugin.eventOperations
			.getEvents()
			.filter((e) => e.variant !== "timeline");

		const categories = this.plugin.eventOperations.getEventCategories();
		if (categories.length > 0) {
			this.section("Event category");
			for (const category of categories) {
				const key = category.toLowerCase();
				const n = events.filter((e) =>
					e.categories.some((c) => c.toLowerCase() === key)
				).length;
				this.row(
					category,
					`${n} event${n === 1 ? "" : "s"}`,
					categoryShown(settings.upcomingHiddenCategories, category),
					(on) => {
						settings.upcomingHiddenCategories = setCategoryShown(
							settings.upcomingHiddenCategories,
							category,
							on
						);
					}
				);
			}
		}

		// Only types in use: fourteen rows for kinds of thing you've never
		// logged would bury the ones you have.
		const types = EVENT_TYPES.filter((t) =>
			events.some((e) => e.type === t.id)
		);
		if (types.length > 0) {
			this.section("Event type");
			for (const type of types) {
				const n = events.filter((e) => e.type === type.id).length;
				this.row(
					`${type.emoji} ${type.label}`,
					`${n} event${n === 1 ? "" : "s"}`,
					!settings.upcomingHiddenTypes.includes(type.id),
					(on) => {
						const others = settings.upcomingHiddenTypes.filter(
							(id) => id !== type.id
						);
						settings.upcomingHiddenTypes = on
							? others
							: [...others, type.id];
					}
				);
			}
		}
	}

	private list: HTMLElement | null = null;

	private section(heading: string) {
		this.contentEl.createDiv({
			cls: "modal-section-label upcoming-settings-heading",
			text: heading,
		});
		this.list = this.contentEl.createDiv({ cls: "getting-started-list" });
	}

	/** A choice as a Getting started row: the whole row is the label, so
	 * a tap anywhere on it ticks the box at its end. */
	private row(
		title: string,
		blurb: string,
		checked: boolean,
		onChange: (on: boolean) => void
	) {
		const list = this.list ?? this.contentEl;
		const row = list.createEl("label", {
			cls: "getting-started-step upcoming-settings-row",
		});
		const text = row.createDiv({ cls: "getting-started-text" });
		text.createDiv({ cls: "getting-started-title", text: title });
		text.createDiv({ cls: "getting-started-blurb", text: blurb });
		const box = row.createEl("input", { attr: { type: "checkbox" } });
		box.checked = checked;
		box.addEventListener("change", () => {
			onChange(box.checked);
			void this.plugin.saveSettings();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
