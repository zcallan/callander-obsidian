import { App } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import type FriendTracker from "@/main";
import { appendColorRow, closeColorPopover } from "@/components/colorPicker";
import { EVENT_TYPES, eventColour } from "@/constants";
import {
	DEFAULT_GROUP_COLORS,
	categoryColor,
	categoryColors,
	ensureGroupColors,
	type GroupColors,
} from "@/utils/categoryColor";

/** Settings are saved this long after the last colour change. */
const SETTINGS_SAVE_DELAY_MS = 200;

/**
 * Colours picked by hand for the Calendar page, one of three sets: "kinds"
 * is "Color by group"'s plans, birthdays and events; "categories" is each
 * event category, for "Color by category"; "types" is every event type,
 * for "Color by type".
 *
 * Changes show on the calendar behind the modal as they're made — the save
 * is what tells the page to redraw — so there's no Save button to forget.
 * Anything left on its default keeps following the calendar's own choice,
 * including a category added later, which picks a colour of its own.
 */
export class CalendarColorsModal extends FormModal {
	private saveTimer: number | null = null;

	constructor(
		app: App,
		private plugin: FriendTracker,
		private section: "kinds" | "categories" | "types",
		private categories: string[] = [],
		/** Leave out the Birthdays row — for the Events page, which has
		 * none to colour. */
		private withBirthdays = true
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("calendar-colors-modal");
		const kinds = this.section === "kinds";
		const types = this.section === "types";
		contentEl.createEl("h2", {
			text: kinds ? "Group colors" : types ? "Type colors" : "Category colors",
		});
		// Two short paragraphs rather than one — what this does, then where
		// it's set — as two elements, since a single text node collapses a
		// line break rather than showing it.
		const [what, where] = kinds
			? [
					"Set different colours for plans, birthdays and events on the calendar — for example, a shade of green for birthdays so they stand out from everything else.",
					'These are the calendar\'s base colours: plans and birthdays always use theirs, and an event falls back to its "Events" colour once no category or type colour applies to it.',
			  ]
			: types
			? [
					"Set different colours for each event type — for example, a specific shade for Sports, or for Concerts.",
					"You can set an event's type from the row of icons near the top when adding or editing it.",
			  ]
			: [
					"Set different colours for your event categories — for example, a certain shade of blue for your favourite sports team's colours.",
					"You can set a category on an event while adding or editing it, inside the \"Additional details\" dropdown.",
			  ];
		contentEl.createDiv({ cls: "section-helper-text", text: what });
		contentEl.createDiv({
			cls: "section-helper-text calendar-colors-where",
			text: where,
		});

		// Filled in from an older settings file, where some of these keys
		// won't exist yet.
		const colors = ensureGroupColors(this.plugin.settings);

		if (kinds) this.appendKinds(contentEl, colors);
		else if (types) this.appendTypes(contentEl, colors);
		else this.appendCategories(contentEl, colors);

		const buttons = contentEl.createDiv({ cls: "callander-modal-buttons" });
		const done = buttons.createEl("button", {
			text: "Done",
			cls: "callander-modal-button mod-cta",
		});
		done.addEventListener("click", () => this.close());
	}

	private appendKinds(contentEl: HTMLElement, colors: GroupColors) {
		const kinds = contentEl.createDiv({ cls: "calendar-colors-section" });
		appendColorRow(kinds, {
			label: "Plans",
			value: colors.plan,
			fallback: DEFAULT_GROUP_COLORS.plan,
			onChange: (v) => {
				colors.plan = v;
				this.save();
			},
		});
		if (this.withBirthdays) {
			appendColorRow(kinds, {
				label: "Birthdays",
				value: colors.birthday,
				fallback: DEFAULT_GROUP_COLORS.birthday,
				onChange: (v) => {
					colors.birthday = v;
					this.save();
				},
			});
		}
		appendColorRow(kinds, {
			label: "Events",
			value: colors.event,
			fallback: DEFAULT_GROUP_COLORS.event,
			onChange: (v) => {
				colors.event = v;
				this.save();
			},
		});
	}

	private appendTypes(contentEl: HTMLElement, colors: GroupColors) {
		const section = contentEl.createDiv({ cls: "calendar-colors-section" });
		for (const type of EVENT_TYPES) {
			appendColorRow(section, {
				label: `${type.emoji} ${type.label}`,
				value: colors.types[type.id] ?? "",
				fallback: eventColour(type.id),
				onChange: (v) => {
					if (v) colors.types[type.id] = v;
					else delete colors.types[type.id];
					this.save();
				},
			});
		}
	}

	private appendCategories(contentEl: HTMLElement, colors: GroupColors) {
		const palette = categoryColors(this.categories);
		if (this.categories.length === 0) {
			contentEl.createDiv({
				cls: "section-helper-text calendar-colors-empty",
				text: "No events have a category yet. Add one under Additional details when editing an event, or when importing events.",
			});
			return;
		}
		const cats = contentEl.createDiv({ cls: "calendar-colors-section" });
		for (const name of this.categories) {
			const key = name.toLowerCase();
			appendColorRow(cats, {
				label: name,
				value: colors.categories[key] ?? "",
				fallback: palette.get(key) ?? categoryColor(name),
				onChange: (v) => {
					if (v) colors.categories[key] = v;
					else delete colors.categories[key];
					this.save();
				},
			});
		}
	}

	/** Saved a beat after the last change: dragging across the picker
	 * fires a colour per pixel, and each save redraws the calendar. */
	private save() {
		if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
		this.saveTimer = window.setTimeout(() => {
			this.saveTimer = null;
			void this.plugin.saveSettings();
		}, SETTINGS_SAVE_DELAY_MS);
	}

	onClose() {
		closeColorPopover();
		if (this.saveTimer !== null) {
			window.clearTimeout(this.saveTimer);
			this.saveTimer = null;
			void this.plugin.saveSettings();
		}
		this.contentEl.empty();
	}
}
