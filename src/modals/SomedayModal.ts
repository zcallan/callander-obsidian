import { App, TFile, setIcon } from "obsidian";
import { FormModal } from "@/modals/FormModal";
import { ConfirmModal } from "@/modals/ConfirmModal";
import type FriendTracker from "@/main";
import type { ContactWithCountdown, SomedayInfo } from "@/types";
import type { SomedayFields } from "@/services/SomedayOperations";
import {
	SOMEDAY_DAYS,
	SOMEDAY_DAY_PRESETS,
	SOMEDAY_SEASONS,
	SOMEDAY_COMPANY,
	SOMEDAY_TIMES,
	SOMEDAY_TYPES,
	SomedayDay,
	SomedayCompany,
	SomedayTime,
	SomedayType,
} from "@/constants";
import {
	parseFlexDate,
	toFlexString,
	flexPrecision,
	todayISO,
} from "@/utils/flexdate";

type WhenMode = "anytime" | "within" | "year" | "month" | "day" | "season";

/**
 * Create or edit a Someday — a wishlist idea. Deliberately lighter than a plan:
 * a name, a type, a rough when (a calendar date at any precision, a from/until
 * window, or one/more seasons), which days suit it, an estimated cost,
 * solo/group, suggested people, and notes. Sub-ideas are managed on the full
 * page.
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

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", {
			text: this.existing ? "Edit someday" : "New someday",
		});

		// Needed for the Suggested people picker below — fetched once,
		// up front, so the rest of the form doesn't wait on it twice.
		const contacts = await this.plugin.contactOperations.getContacts();

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

		// ---- Type ----
		const typeField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		typeField.createEl("label", { text: "Types (optional)" });
		const types = new Set<SomedayType>(this.existing?.types ?? []);
		const typeRow = typeField.createDiv({
			cls: "someday-timeframe-chips",
		});
		const typeButtons = new Map<SomedayType, HTMLButtonElement>();
		const refreshType = () =>
			typeButtons.forEach((el, id) =>
				el.toggleClass("selected", types.has(id))
			);
		SOMEDAY_TYPES.forEach((t) => {
			const btn = typeRow.createEl("button", {
				cls: "quick-idea-category-button",
				attr: { type: "button", "aria-label": t.label },
			});
			btn.createSpan({
				cls: "quick-idea-category-emoji",
				text: t.emoji,
			});
			btn.createSpan({ text: t.label });
			btn.addEventListener("click", () => {
				// Multi-select — one someday can be a few things at once
				// (a food stop on a short trip). Click again to drop one.
				if (types.has(t.id)) types.delete(t.id);
				else types.add(t.id);
				refreshType();
			});
			typeButtons.set(t.id, btn);
		});
		refreshType();

		// ---- Best date: a rough/exact date, or one or more seasons ----
		const whenField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		whenField.createEl("label", { text: "Best date" });

		let dateValue = this.existing?.date ?? "";
		let fromValue = this.existing?.fromDate ?? "";
		let untilValue = this.existing?.untilDate ?? "";
		const seasons = new Set<string>(this.existing?.seasons ?? []);
		const initialFlex = parseFlexDate(dateValue);
		let whenMode: WhenMode =
			seasons.size > 0
				? "season"
				: fromValue || untilValue
				? "within"
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
				["anytime", "Any date"],
				["within", "Within dates"],
				["day", "Exact day"],
				["season", "Season"],
				["month", "Month"],
				["year", "Year"],
			] as Array<[WhenMode, string]>
		).forEach(([id, label]) =>
			modeSelect.createEl("option", { value: id, text: label })
		);
		modeSelect.value = whenMode;

		// Inside the flex row, not below it — the precision dropdown and the
		// value it qualifies read as one control, and on a phone
		// .contact-met-controls stacks them anyway.
		const whenSlot = whenControls.createDiv({
			cls: "someday-when-slot",
		});
		const pad = (n: number) => String(n).padStart(2, "0");

		// Each mode owns the slot's state: rendering one zeroes the others',
		// so whatever is on screen is exactly what a save will store.
		const renderWhenSlot = () => {
			whenSlot.empty();
			// The From/Until labels sit above their inputs, making the slot
			// taller than the dropdown — bottom-align the row so the dropdown
			// lines up with the inputs, not the labels.
			whenControls.toggleClass(
				"someday-when-within",
				whenMode === "within"
			);
			if (whenMode === "anytime") {
				dateValue = "";
				fromValue = "";
				untilValue = "";
				seasons.clear();
				whenSlot.createDiv({
					cls: "section-helper-text",
					text: "No particular time — a someday for whenever.",
				});
				return;
			}
			if (whenMode === "within") {
				// A window, not a point — it can open later ("tickets go on
				// sale") and it can close ("last day of the show"). Either
				// side may stay blank: from now / no deadline.
				dateValue = "";
				seasons.clear();
				const range = whenSlot.createDiv({
					cls: "someday-when-range",
				});
				// Assigned after both inputs exist; the change listeners fire
				// long after that, this just keeps the declarations tidy.
				let syncBounds = () => {};
				const half = (
					label: string,
					value: string,
					apply: (v: string) => void
				) => {
					const field = range.createDiv({
						cls: "someday-when-range-field",
					});
					field.createEl("label", { text: label });
					const input = field.createEl("input", {
						cls: "callander-modal-input someday-when-date",
						attr: { type: "date" },
					});
					input.value = value;
					input.addEventListener("change", () => {
						apply(input.value.trim());
						syncBounds();
					});
					return input;
				};
				const fromInput = half(
					"From date",
					fromValue,
					(v) => (fromValue = v)
				);
				const untilInput = half(
					"Until date",
					untilValue,
					(v) => (untilValue = v)
				);
				// Native pickers grey out the impossible half of the range.
				syncBounds = () => {
					untilInput.min = fromValue;
					fromInput.max = untilValue;
				};
				syncBounds();
				return;
			}
			if (whenMode === "season") {
				dateValue = ""; // a date and seasons are mutually exclusive
				fromValue = "";
				untilValue = "";
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
				fromValue = "";
				untilValue = "";
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

		const DATE_MODES: WhenMode[] = ["year", "month", "day"];
		modeSelect.addEventListener("change", () => {
			const prev = whenMode;
			whenMode = modeSelect.value as WhenMode;
			// Moving to a coarser date precision truncates the stored value
			if (DATE_MODES.includes(whenMode) && DATE_MODES.includes(prev)) {
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
			// Picking "Within dates" starts the window at today — the common
			// case is "from now until X", so the From half comes pre-filled.
			// (Only on a fresh pick: an existing window keeps its own From.)
			if (whenMode === "within" && !fromValue) {
				fromValue = todayISO();
			}
			renderWhenSlot();
		});
		renderWhenSlot();

		// ---- Best time ----
		// "Any" is stored as all three windows (see SOMEDAY_TIMES), but shown
		// as its own chip with the others dark — so the display state can't
		// be read straight off the set, and `anyTime` tracks it explicitly.
		const timeField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		timeField.createEl("label", { text: "Best time" });
		const storedTimes = this.existing?.times ?? [];
		// Every window (or, for a someday saved before this field existed,
		// none at all) is what "Any" looks like on disk.
		let anyTime =
			storedTimes.length === 0 ||
			storedTimes.length === SOMEDAY_TIMES.length;
		const times = new Set<SomedayTime>(anyTime ? [] : storedTimes);
		const timeRow = timeField.createDiv({
			cls: "someday-timeframe-chips",
		});
		const timeButtons = new Map<SomedayTime | "any", HTMLButtonElement>();
		const refreshTimes = () =>
			timeButtons.forEach((el, id) =>
				el.toggleClass(
					"selected",
					id === "any" ? anyTime : !anyTime && times.has(id)
				)
			);
		const timeChip = (
			id: SomedayTime | "any",
			label: string,
			emoji: string
		) => {
			const btn = timeRow.createEl("button", {
				cls: "quick-idea-category-button",
				attr: { type: "button", "aria-label": label },
			});
			btn.createSpan({ cls: "quick-idea-category-emoji", text: emoji });
			btn.createSpan({ text: label });
			btn.addEventListener("click", () => {
				if (id === "any") {
					anyTime = true;
					times.clear();
				} else {
					if (times.has(id)) times.delete(id);
					else times.add(id);
					// Picking every window individually *is* Any — collapse to
					// it so what's on screen matches what gets stored. Clearing
					// the last one lands there too, rather than on an empty
					// state that would mean the same thing but look broken.
					anyTime =
						times.size === 0 || times.size === SOMEDAY_TIMES.length;
					if (anyTime) times.clear();
				}
				refreshTimes();
			});
			timeButtons.set(id, btn);
		};
		timeChip("any", "Any", "🕒");
		SOMEDAY_TIMES.forEach((t) => timeChip(t.id, t.label, t.emoji));
		refreshTimes();

		// ---- Best days ----
		const daysField = contentEl.createDiv({
			cls: "callander-modal-field",
		});
		daysField.createEl("label", { text: "Best days (optional)" });
		const days = new Set<SomedayDay>(this.existing?.days ?? []);
		const dayRow = daysField.createDiv({ cls: "someday-day-chips" });
		const dayButtons = new Map<SomedayDay, HTMLButtonElement>();
		// Preset buttons light up while the selection is exactly their set —
		// hand-picking Sat+Sun reads as "Weekend" without using the button.
		const presetButtons: Array<{
			el: HTMLButtonElement;
			set: readonly SomedayDay[];
		}> = [];
		const refreshDays = () => {
			dayButtons.forEach((el, id) =>
				el.toggleClass("is-on", days.has(id))
			);
			presetButtons.forEach(({ el, set }) =>
				el.toggleClass(
					"selected",
					days.size === set.length && set.every((d) => days.has(d))
				)
			);
		};
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
			presetButtons.push({ el: btn, set: preset.days });
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
		presetButtons.push({
			el: allBtn,
			set: SOMEDAY_DAYS.map((d) => d.id),
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

		// ---- Additional details: solo/group, suggested people, cost, notes
		// — collapsed by default so the form leads with what/type/when/time/
		// days. Reuses the same accordion mechanics as the Dashboard and
		// Person page (.plan-accordion), just without their persisted
		// collapsed state — a modal opens fresh every time, so there's
		// nothing to remember between opens.
		const detailsWrap = contentEl.createDiv({
			cls: "callander-modal-field plan-accordion someday-modal-accordion",
		});
		const detailsHeader = detailsWrap.createDiv({
			cls: "plan-accordion-header callander-modal-accordion-header",
		});
		detailsHeader.createSpan({ text: "Additional details" });
		setIcon(
			detailsHeader.createSpan({ cls: "plan-accordion-chevron" }),
			"chevron-down"
		);
		const accordionBody = detailsWrap.createDiv({
			cls: "plan-accordion-body",
		});
		detailsHeader.addEventListener("click", () => {
			detailsWrap.toggleClass("is-open", !detailsWrap.hasClass("is-open"));
		});

		// ---- Solo or group ----
		// Directly above Suggested people, which it shows and hides.
		const companyField = accordionBody.createDiv({
			cls: "callander-modal-field",
		});
		companyField.createEl("label", { text: "Solo or group?" });
		// Required — defaults to "Either" (an edit keeps whatever was saved).
		let company: SomedayCompany = this.existing?.company || "either";
		const companyRow = companyField.createDiv({
			cls: "someday-timeframe-chips",
		});
		const companyButtons = new Map<SomedayCompany, HTMLButtonElement>();
		// Reassigned once the people picker below exists — a solo activity
		// has no one to suggest, so its field hides rather than just sitting
		// there empty. Starts as a no-op since refreshCompany() (called
		// immediately, to set the buttons' initial state) would otherwise
		// run before that picker is built.
		let updatePeopleVisibility = () => {};
		const refreshCompany = () => {
			companyButtons.forEach((el, id) =>
				el.toggleClass("selected", company === id)
			);
			updatePeopleVisibility();
		};
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

		// ---- Suggested people: picked from real contacts, stored as
		// wikilinks (not free text) so a Person page can later show which
		// somedays suggest them. Hidden for "solo" — see updatePeopleVisibility.
		const peopleWrap = accordionBody.createDiv({
			cls: "callander-modal-field",
		});
		peopleWrap.createEl("label", { text: "Suggested people (optional)" });
		const peoplePicker = peopleWrap.createDiv({
			cls: "plan-people-field",
		});
		const peopleSelect = peoplePicker.createEl("select", {
			cls: "quick-idea-input plan-people-select",
		});
		const peoplePills = peoplePicker.createDiv({
			cls: "plan-people-pills",
		});

		// Seeded by resolving the existing wikilinks back to real contacts —
		// a link to a since-renamed or deleted file is silently dropped
		// rather than shown as a dead entry with nothing to display.
		const selectedPeople: ContactWithCountdown[] = [];
		if (this.existing) {
			for (const raw of this.existing.people) {
				const linktext = raw.replace(/^\[\[|\]\]$/g, "");
				const dest = this.app.metadataCache.getFirstLinkpathDest(
					linktext,
					this.existing.file.path
				);
				const match = dest
					? contacts.find((c) => c.file.path === dest.path)
					: undefined;
				if (match) selectedPeople.push(match);
			}
		}

		const renderPeopleSelect = () => {
			peopleSelect.empty();
			peopleSelect.createEl("option", { value: "", text: "Add a person…" });
			for (const c of contacts) {
				if (!selectedPeople.some((p) => p.file.path === c.file.path)) {
					peopleSelect.createEl("option", {
						value: c.file.path,
						text: c.displayName,
					});
				}
			}
			peopleSelect.value = "";
		};
		const renderPeoplePills = () => {
			peoplePills.empty();
			selectedPeople.forEach((c, i) => {
				const pill = peoplePills.createSpan({ cls: "plan-people-pill" });
				pill.createSpan({ text: c.displayName });
				const x = pill.createEl("button", {
					cls: "plan-people-pill-x",
					attr: {
						type: "button",
						"aria-label": `Remove ${c.displayName}`,
					},
				});
				x.setText("✕");
				x.addEventListener("click", (e) => {
					e.preventDefault();
					selectedPeople.splice(i, 1);
					renderPeoplePills();
					renderPeopleSelect();
				});
			});
		};
		peopleSelect.addEventListener("change", () => {
			const path = peopleSelect.value;
			if (!path) return;
			const match = contacts.find((c) => c.file.path === path);
			if (match) selectedPeople.push(match);
			renderPeoplePills();
			renderPeopleSelect();
		});
		renderPeopleSelect();
		renderPeoplePills();

		updatePeopleVisibility = () => {
			peopleWrap.style.display = company === "solo" ? "none" : "";
		};
		updatePeopleVisibility();

		// ---- Estimated cost ----
		const costField = accordionBody.createDiv({
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

		// ---- Notes ----
		const notesField = accordionBody.createDiv({
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
				// "Any" persists as every window, so a later filter can ask
				// "does this suit the evening?" with a plain includes().
				times: anyTime
					? SOMEDAY_TIMES.map((t) => t.id)
					: SOMEDAY_TIMES.filter((t) => times.has(t.id)).map(
							(t) => t.id
					  ),
				fromDate: whenMode === "within" ? fromValue : "",
				untilDate: whenMode === "within" ? untilValue : "",
				cost,
				notes: notesInput.value.trim(),
				company,
				// Saved in SOMEDAY_TYPES' natural order, so types[0] is
				// always the lead wherever it's shown.
				types: SOMEDAY_TYPES.filter((t) => types.has(t.id)).map(
					(t) => t.id
				),
				// A solo activity never persists suggested people, even if
				// some were picked before switching to Solo — toggling
				// company back and forth mid-edit shouldn't lose them
				// in-session, but the saved data stays consistent.
				people:
					company === "solo"
						? []
						: selectedPeople.map((c) => `[[${c.file.basename}]]`),
			};
			const ops = this.plugin.somedayOperations;
			const file = this.existing
				? (await ops.updateSomeday(this.existing.file, fields),
				  this.existing.file)
				: await ops.createSomeday(fields);
			await this.onSaved(file);
			this.close();
		};
		saveBtn.addEventListener("click", () => void submit());
		nameInput.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				void submit();
			}
		});

		if (this.existing) this.blurInitialFocus();
		else window.setTimeout(() => nameInput.focus(), 0);
	}

	onClose() {
		this.contentEl.empty();
	}
}
