import { App, TFile } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import { ConfirmModal } from "@/modals/ConfirmModal";
import { createFlexDateInput } from "@/components/FlexDateInput";
import type FriendTracker from "@/main";
import type { SomedayInfo } from "@/types";
import type { SomedayFields } from "@/services/SomedayOperations";
import {
	SOMEDAY_DAYS,
	SOMEDAY_DAY_PRESETS,
	SOMEDAY_TIMEFRAMES,
	SomedayDay,
} from "@/constants";

/**
 * Create or edit a Someday — a wishlist idea. Deliberately lighter than a plan:
 * a name, a rough when (calendar date and/or a season), which days could work,
 * a ballpark cost, a place, and notes. Sub-ideas are managed on the full page.
 */
export class SomedayModal extends FormModal {
	constructor(
		app: App,
		private plugin: FriendTracker,
		private existing: SomedayInfo | null,
		private onSaved: (file: TFile) => void | Promise<void>,
		private onDeleted?: () => void | Promise<void>
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", {
			text: this.existing ? "Edit someday" : "New someday",
		});

		// ---- Name ----
		const nameField = contentEl.createEl("div", {
			cls: "friend-tracker-modal-field",
		});
		nameField.createEl("label", { text: "What is it?" });
		const nameInput = nameField.createEl("input", {
			cls: "friend-tracker-modal-input",
			attr: {
				type: "text",
				placeholder: "e.g. Trip to Maine, Fox & Hounds bar",
			},
		});
		nameInput.value = this.existing?.name ?? "";

		// ---- When: rough/exact date, plus an optional season/timeframe ----
		const whenField = contentEl.createEl("div", {
			cls: "friend-tracker-modal-field",
		});
		whenField.createEl("label", { text: "When (as rough as you like)" });
		let dateValue = this.existing?.date ?? "";
		createFlexDateInput(
			whenField,
			dateValue,
			(v) => {
				dateValue = v;
			},
			{
				inputClass: "friend-tracker-modal-input",
				defaultPrecision: "month",
			}
		);

		whenField.createEl("div", {
			cls: "friend-tracker-modal-sublabel",
			text: "…or a rough timeframe",
		});
		let timeframe = this.existing?.timeframe ?? "";
		const tfRow = whenField.createEl("div", {
			cls: "someday-timeframe-chips",
		});
		const tfButtons = new Map<string, HTMLButtonElement>();
		let tfFree: HTMLInputElement;
		const isPreset = (v: string) =>
			SOMEDAY_TIMEFRAMES.some((t) => t.id === v);
		const refreshTimeframe = () => {
			tfButtons.forEach((el, id) =>
				el.toggleClass("selected", timeframe === id)
			);
			// Show free text only when it isn't one of the presets
			if (document.activeElement !== tfFree) {
				tfFree.value = timeframe && !isPreset(timeframe) ? timeframe : "";
			}
		};
		SOMEDAY_TIMEFRAMES.forEach((tf) => {
			const btn = tfRow.createEl("button", {
				cls: "quick-idea-category-button",
				attr: { "aria-label": tf.label, type: "button" },
			});
			btn.createSpan({
				cls: "quick-idea-category-emoji",
				text: tf.emoji,
			});
			btn.createSpan({ text: tf.label });
			btn.addEventListener("click", () => {
				timeframe = timeframe === tf.id ? "" : tf.id;
				refreshTimeframe();
			});
			tfButtons.set(tf.id, btn);
		});
		tfFree = whenField.createEl("input", {
			cls: "friend-tracker-modal-input someday-timeframe-free",
			attr: { type: "text", placeholder: "or type your own…" },
		});
		tfFree.addEventListener("input", () => {
			timeframe = tfFree.value.trim();
			tfButtons.forEach((el, id) =>
				el.toggleClass("selected", timeframe === id)
			);
		});
		refreshTimeframe();

		// ---- Days that work ----
		const daysField = contentEl.createEl("div", {
			cls: "friend-tracker-modal-field",
		});
		daysField.createEl("label", { text: "Good days (optional)" });
		const days = new Set<SomedayDay>(this.existing?.days ?? []);
		const dayRow = daysField.createEl("div", { cls: "someday-day-chips" });
		const dayButtons = new Map<SomedayDay, HTMLButtonElement>();
		const refreshDays = () =>
			dayButtons.forEach((el, id) => el.toggleClass("is-on", days.has(id)));
		SOMEDAY_DAYS.forEach((d) => {
			const btn = dayRow.createEl("button", {
				cls: "someday-day-chip",
				text: d.short,
				attr: { "aria-label": d.label, type: "button" },
			});
			btn.addEventListener("click", () => {
				days.has(d.id) ? days.delete(d.id) : days.add(d.id);
				refreshDays();
			});
			dayButtons.set(d.id, btn);
		});
		const presetRow = daysField.createEl("div", {
			cls: "someday-day-presets",
		});
		SOMEDAY_DAY_PRESETS.forEach((preset) => {
			const btn = presetRow.createEl("button", {
				cls: "friend-tracker-button",
				text: preset.label,
				attr: { type: "button" },
			});
			btn.addEventListener("click", () => {
				days.clear();
				preset.days.forEach((d) => days.add(d as SomedayDay));
				refreshDays();
			});
		});
		const anyBtn = presetRow.createEl("button", {
			cls: "friend-tracker-button",
			text: "Any",
			attr: { type: "button" },
		});
		anyBtn.addEventListener("click", () => {
			days.clear();
			refreshDays();
		});
		refreshDays();

		// ---- Cost ----
		const costField = contentEl.createEl("div", {
			cls: "friend-tracker-modal-field",
		});
		costField.createEl("label", { text: "Ballpark cost (optional)" });
		const costInput = costField.createEl("input", {
			cls: "friend-tracker-modal-input",
			attr: {
				type: "number",
				inputmode: "decimal",
				min: "0",
				placeholder: "e.g. 400",
			},
		});
		if (this.existing?.cost !== null && this.existing?.cost !== undefined) {
			costInput.value = String(this.existing.cost);
		}

		// ---- Location ----
		const locField = contentEl.createEl("div", {
			cls: "friend-tracker-modal-field",
		});
		locField.createEl("label", { text: "Where (optional)" });
		const locInput = locField.createEl("input", {
			cls: "friend-tracker-modal-input",
			attr: { type: "text", placeholder: "e.g. Maine, USA" },
		});
		locInput.value = this.existing?.location ?? "";

		// ---- Notes ----
		const notesField = contentEl.createEl("div", {
			cls: "friend-tracker-modal-field",
		});
		notesField.createEl("label", { text: "Notes (optional)" });
		const notesInput = notesField.createEl("textarea", {
			cls: "note-input-textarea",
			attr: {
				rows: "3",
				placeholder: "Anything worth remembering about this idea…",
			},
		});
		notesInput.value = this.existing?.notes ?? "";

		// ---- Buttons ----
		const buttons = contentEl.createEl("div", {
			cls: "friend-tracker-modal-buttons",
		});
		if (this.existing) {
			const deleteBtn = buttons.createEl("button", {
				text: "Delete",
				cls: "friend-tracker-modal-button friend-tracker-modal-button-danger",
			});
			deleteBtn.addEventListener("click", () => {
				const existing = this.existing!;
				new ConfirmModal(
					this.app,
					"Delete someday",
					`Delete "${existing.name}"?`,
					"Delete",
					async () => {
						await this.plugin.somedayOperations.deleteSomeday(
							existing.file
						);
						await this.onDeleted?.();
						this.close();
					}
				).open();
			});
		}
		const saveBtn = buttons.createEl("button", {
			text: "Save",
			cls: "friend-tracker-modal-button mod-cta",
		});

		const submit = async () => {
			const name = nameInput.value.trim();
			if (!name) {
				nameInput.focus();
				return;
			}
			const rawCost = costInput.value.trim();
			const parsedCost = rawCost === "" ? null : Number(rawCost);
			const cost =
				parsedCost !== null && Number.isFinite(parsedCost)
					? parsedCost
					: null;
			const fields: SomedayFields = {
				name,
				date: dateValue,
				timeframe,
				days: SOMEDAY_DAYS.filter((d) => days.has(d.id)).map(
					(d) => d.id
				),
				cost,
				location: locInput.value.trim(),
				notes: notesInput.value.trim(),
			};
			const ops = this.plugin.somedayOperations;
			const file = this.existing
				? (await ops.updateSomeday(this.existing.file, fields),
				  this.existing.file)
				: await ops.createSomeday(fields);
			await this.onSaved(file);
			this.close();
		};
		saveBtn.addEventListener("click", submit);
		nameInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				submit();
			}
		});

		setTimeout(() => nameInput.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
