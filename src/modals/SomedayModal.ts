import { App, TFile } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import { ConfirmModal } from "@/modals/ConfirmModal";
import type FriendTracker from "@/main";
import type { SomedayInfo } from "@/types";
import type { SomedayFields } from "@/services/SomedayOperations";
import {
	SOMEDAY_DAYS,
	SOMEDAY_DAY_PRESETS,
	SOMEDAY_SEASONS,
	SOMEDAY_COMPANY,
	SomedayDay,
	SomedayCompany,
} from "@/constants";
import { parseFlexDate, toFlexString, flexPrecision } from "@/utils/flexdate";

type WhenMode = "anytime" | "year" | "month" | "day" | "season";

/**
 * Create or edit a Someday — a wishlist idea. Deliberately lighter than a plan:
 * a name, a rough when (a calendar date at any precision, or one/more seasons),
 * which days suit it, an estimated cost, solo/group, and notes. Sub-ideas are
 * managed on the full page.
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
		const nameField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		nameField.createEl("label", { text: "What is it?" });
		const nameInput = nameField.createEl("input", {
			cls: "callander-modal-input",
			attr: {
				type: "text",
				placeholder: "e.g. Trip to Maine, Fox & Hounds bar",
			},
		});
		nameInput.value = this.existing?.name ?? "";

		// ---- When: a rough/exact date, or one or more seasons ----
		const whenField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		whenField.createEl("label", { text: "When (as rough as you like)" });

		let dateValue = this.existing?.date ?? "";
		const seasons = new Set<string>(this.existing?.seasons ?? []);
		const initialFlex = parseFlexDate(dateValue);
		let whenMode: WhenMode =
			seasons.size > 0
				? "season"
				: initialFlex
				? flexPrecision(initialFlex)
				: "anytime";

		const whenControls = whenField.createDiv({
			cls: "contact-met-controls",
		});
		const modeSelect = whenControls.createEl("select", {
			cls: "dropdown contact-met-precision",
		});
		(
			[
				["anytime", "Any time"],
				["year", "Year only"],
				["month", "Month"],
				["day", "Exact day"],
				["season", "Season"],
			] as Array<[WhenMode, string]>
		).forEach(([id, label]) =>
			modeSelect.createEl("option", { value: id, text: label })
		);
		modeSelect.value = whenMode;

		const whenSlot = whenField.createDiv({
			cls: "someday-when-slot",
		});
		const pad = (n: number) => String(n).padStart(2, "0");

		const renderWhenSlot = () => {
			whenSlot.empty();
			if (whenMode === "anytime") {
				dateValue = "";
				seasons.clear();
				whenSlot.createDiv({
					cls: "section-helper-text",
					text: "No particular time — a someday for whenever.",
				});
				return;
			}
			if (whenMode === "season") {
				dateValue = ""; // a date and seasons are mutually exclusive
				const pills = whenSlot.createDiv({
					cls: "someday-timeframe-chips",
				});
				SOMEDAY_SEASONS.forEach((s) => {
					const btn = pills.createEl("button", {
						cls: `quick-idea-category-button${
							seasons.has(s.id) ? " selected" : ""
						}`,
						attr: { type: "button", "aria-label": s.label },
					});
					btn.createSpan({
						cls: "quick-idea-category-emoji",
						text: s.emoji,
					});
					btn.createSpan({ text: s.label });
					btn.addEventListener("click", () => {
						if (seasons.has(s.id)) seasons.delete(s.id);
						else seasons.add(s.id);
						btn.toggleClass("selected", seasons.has(s.id));
					});
				});
			} else {
				seasons.clear();
				const input = whenSlot.createEl("input", {
					cls: "callander-modal-input someday-when-date",
				});
				const parsed = parseFlexDate(dateValue);
				if (whenMode === "year") {
					input.type = "number";
					input.placeholder = "e.g. 2026";
					input.min = "2000";
					if (parsed?.year) input.value = String(parsed.year);
				} else if (whenMode === "month") {
					input.type = "month";
					if (parsed?.year && parsed?.month) {
						input.value = `${parsed.year}-${pad(parsed.month)}`;
					}
				} else {
					input.type = "date";
					if (parsed?.year && parsed?.month && parsed?.day) {
						input.value = `${parsed.year}-${pad(
							parsed.month
						)}-${pad(parsed.day)}`;
					}
				}
				input.addEventListener("change", () => {
					const raw = input.value.trim();
					if (!raw) {
						dateValue = "";
						return;
					}
					const p = parseFlexDate(raw);
					if (p) dateValue = toFlexString(p);
				});
			}
		};

		modeSelect.addEventListener("change", () => {
			const prev = whenMode;
			whenMode = modeSelect.value as WhenMode;
			// Moving to a coarser date precision truncates the stored value
			if (whenMode !== "season" && prev !== "season") {
				const parsed = parseFlexDate(dateValue);
				if (parsed) {
					const t = { ...parsed };
					if (whenMode === "year") {
						t.month = null;
						t.day = null;
					} else if (whenMode === "month") {
						t.day = null;
					}
					dateValue = toFlexString(t);
				}
			}
			renderWhenSlot();
		});
		renderWhenSlot();

		// ---- Best days ----
		const daysField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		daysField.createEl("label", { text: "Best days (optional)" });
		const days = new Set<SomedayDay>(this.existing?.days ?? []);
		const dayRow = daysField.createDiv({ cls: "someday-day-chips" });
		const dayButtons = new Map<SomedayDay, HTMLButtonElement>();
		const refreshDays = () =>
			dayButtons.forEach((el, id) =>
				el.toggleClass("is-on", days.has(id))
			);
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
		const presetRow = daysField.createDiv({
			cls: "someday-day-presets",
		});
		SOMEDAY_DAY_PRESETS.forEach((preset) => {
			const btn = presetRow.createEl("button", {
				cls: "callander-button",
				text: preset.label,
				attr: { type: "button" },
			});
			btn.addEventListener("click", () => {
				days.clear();
				preset.days.forEach((d) => days.add(d));
				refreshDays();
			});
		});
		const allBtn = presetRow.createEl("button", {
			cls: "callander-button",
			text: "All days",
			attr: { type: "button" },
		});
		allBtn.addEventListener("click", () => {
			SOMEDAY_DAYS.forEach((d) => days.add(d.id));
			refreshDays();
		});
		const clearBtn = presetRow.createEl("button", {
			cls: "callander-button",
			text: "Clear",
			attr: { type: "button" },
		});
		clearBtn.addEventListener("click", () => {
			days.clear();
			refreshDays();
		});
		refreshDays();

		// ---- Estimated cost ----
		const costField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		costField.createEl("label", { text: "Estimated cost (optional)" });
		const costInput = costField.createEl("input", {
			cls: "callander-modal-input",
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

		// ---- Solo or group ----
		const companyField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		companyField.createEl("label", { text: "Solo or group?" });
		// Required — defaults to "Either" (an edit keeps whatever was saved).
		let company: SomedayCompany = this.existing?.company || "either";
		const companyRow = companyField.createDiv({
			cls: "someday-timeframe-chips",
		});
		const companyButtons = new Map<SomedayCompany, HTMLButtonElement>();
		const refreshCompany = () =>
			companyButtons.forEach((el, id) =>
				el.toggleClass("selected", company === id)
			);
		SOMEDAY_COMPANY.forEach((c) => {
			const btn = companyRow.createEl("button", {
				cls: "quick-idea-category-button",
				attr: { type: "button", "aria-label": c.label },
			});
			btn.createSpan({
				cls: "quick-idea-category-emoji",
				text: c.emoji,
			});
			btn.createSpan({ text: c.label });
			btn.addEventListener("click", () => {
				company = c.id;
				refreshCompany();
			});
			companyButtons.set(c.id, btn);
		});
		refreshCompany();

		// ---- Notes ----
		const notesField = contentEl.createDiv({
			cls: "callander-modal-field",
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
		const buttons = contentEl.createDiv({
			cls: "callander-modal-buttons",
		});
		if (this.existing) {
			const deleteBtn = buttons.createEl("button", {
				text: "Delete",
				cls: "callander-modal-button callander-modal-button-danger",
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
			cls: "callander-modal-button mod-cta",
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
				date:
					whenMode === "year" ||
					whenMode === "month" ||
					whenMode === "day"
						? dateValue
						: "",
				seasons:
					whenMode === "season"
						? SOMEDAY_SEASONS.filter((s) => seasons.has(s.id)).map(
								(s) => s.id
						  )
						: [],
				days: SOMEDAY_DAYS.filter((d) => days.has(d.id)).map(
					(d) => d.id
				),
				cost,
				notes: notesInput.value.trim(),
				company,
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

		window.setTimeout(() => nameInput.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
