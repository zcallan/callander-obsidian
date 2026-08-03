import { ROUGH_TIMES, roughTime } from "@/constants";

/**
 * Shared Date / Time / People fields for plan-item modals (ideas, travel,
 * accommodation). Time mirrors the flexible date picker (Roughly / Exact).
 * When the plan has an exact date range, Date is a dropdown of its days; and
 * when trip people are known, People is a dropdown that adds removable pills.
 * Blank fields are omitted from the returned value.
 */

export interface ScheduleFieldValues {
	date?: string;
	time?: string;
	people?: string;
}

export interface ScheduleFieldOptions {
	/** When set, Date is a dropdown of these days instead of a date picker. */
	dayOptions?: Array<{ value: string; label: string }>;
	/** When set, People is a dropdown of these names (adds pills). */
	people?: string[];
	/** Stays close out their day, so they don't carry a clock time. */
	hideTime?: boolean;
	/** Fired when the date changes — lets a caller track it live. */
	onDateChange?: () => void;
	/** Skip People here so a caller can place it elsewhere in the form. */
	hidePeople?: boolean;
	/** ISO date the plan ends — a stay can't check out after it. */
	lastDay?: string;
}

export interface PeopleFieldHandle {
	value: () => string;
	/** The free-text input, when there's no known cast to pick from. */
	input: HTMLInputElement | null;
}

export interface ScheduleFieldsHandle {
	values: () => ScheduleFieldValues;
	inputs: HTMLElement[];
}

export function appendScheduleFields(
	container: HTMLElement,
	initial: ScheduleFieldValues = {},
	options: ScheduleFieldOptions = {}
): ScheduleFieldsHandle {
	// --- Date ---
	const dateField = container.createDiv({ cls: "plan-schedule-field" });
	dateField.createDiv({ cls: "modal-section-label", text: "Date" });
	const initialDate = initial.date ?? "";
	let dateInput: HTMLInputElement | null = null;
	let dateSelect: HTMLSelectElement | null = null;
	if (options.dayOptions && options.dayOptions.length > 0) {
		dateSelect = dateField.createEl("select", {
			cls: "quick-idea-input plan-date-select",
		});
		dateSelect.createEl("option", { value: "", text: "—" });
		for (const d of options.dayOptions) {
			const opt = dateSelect.createEl("option", {
				value: d.value,
				text: d.label,
			});
			if (d.value === initialDate) opt.selected = true;
		}
		// Preserve a stored date that falls outside the current range.
		if (
			initialDate &&
			!options.dayOptions.some((d) => d.value === initialDate)
		) {
			const opt = dateSelect.createEl("option", {
				value: initialDate,
				text: initialDate,
			});
			opt.selected = true;
		}
	} else {
		dateInput = dateField.createEl("input", {
			cls: "quick-idea-input",
			attr: { type: "date" },
		});
		dateInput.value = initialDate;
	}
	if (options.onDateChange) {
		const notify = options.onDateChange;
		(dateSelect ?? dateInput)?.addEventListener("change", () => notify());
	}

	// --- Time: Roughly / Exact ---
	// Skipped entirely for stays, which have no clock time of their own.
	const initialTime = initial.time ?? "";
	const isExact = /^\d{1,2}:\d{2}$/.test(initialTime);
	const [initHour, initMinute] = isExact ? initialTime.split(":") : ["", ""];
	let precision: "rough" | "exact" = isExact ? "exact" : "rough";

	let precisionSelect: HTMLSelectElement | null = null;
	let dynamic: HTMLElement | null = null;
	let roughSelect: HTMLSelectElement | null = null;
	let hourSelect: HTMLSelectElement | null = null;
	let minuteSelect: HTMLSelectElement | null = null;

	if (!options.hideTime) {
		const timeField = container.createDiv({ cls: "plan-schedule-field" });
		timeField.createDiv({ cls: "modal-section-label", text: "Time" });
		const timeControls = timeField.createDiv({
			cls: "plan-time-controls",
		});

		precisionSelect = timeControls.createEl("select", {
			cls: "dropdown plan-time-precision",
			attr: { "aria-label": "How precisely do you know the time?" },
		});
		precisionSelect.createEl("option", { value: "rough", text: "Roughly" });
		precisionSelect.createEl("option", { value: "exact", text: "Exact" });
		precisionSelect.value = precision;

		dynamic = timeControls.createDiv({ cls: "plan-time-dynamic" });
	}

	const renderTime = () => {
		if (!dynamic) return;
		const host = dynamic;
		host.empty();
		roughSelect = hourSelect = minuteSelect = null;

		if (precision === "rough") {
			roughSelect = host.createEl("select", {
				cls: "quick-idea-input plan-time-select plan-rough-select",
			});
			roughSelect.createEl("option", { value: "", text: "—" });
			const current = roughTime(initialTime)?.id;
			ROUGH_TIMES.forEach((r) => {
				const opt = roughSelect!.createEl("option", {
					value: r.id,
					text: r.label,
				});
				if (r.id === current) opt.selected = true;
			});
			return;
		}

		const selects = host.createDiv({ cls: "plan-time-selects" });
		hourSelect = selects.createEl("select", {
			cls: "quick-idea-input plan-time-select",
		});
		for (let h = 0; h < 24; h++) {
			const v = String(h).padStart(2, "0");
			// Value stays 24h ("00".."23") for storage/sorting; label is 12h.
			const label = `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
			const opt = hourSelect.createEl("option", { value: v, text: label });
			if (v === (initHour || "12")) opt.selected = true;
		}
		selects.createSpan({ cls: "plan-time-colon", text: ":" });
		minuteSelect = selects.createEl("select", {
			cls: "quick-idea-input plan-time-select",
		});
		for (const m of ["00", "15", "30", "45"]) {
			const opt = minuteSelect.createEl("option", { value: m, text: m });
			if (m === (initMinute || "00")) opt.selected = true;
		}
	};

	if (precisionSelect) {
		const select = precisionSelect;
		select.addEventListener("change", () => {
			precision = select.value as "rough" | "exact";
			renderTime();
		});
	}
	renderTime();

	// --- People ---
	const people = options.hidePeople
		? null
		: appendPeopleField(container, initial.people, options.people);

	const inputs: HTMLElement[] = [];
	if (precisionSelect) inputs.push(precisionSelect);
	if (dateInput) inputs.push(dateInput);
	if (people?.input) inputs.push(people.input);

	return {
		values: () => {
			const date = dateSelect
				? dateSelect.value
				: dateInput?.value.trim() ?? "";
			let time = "";
			if (precision === "exact" && hourSelect && minuteSelect) {
				time = `${hourSelect.value}:${minuteSelect.value}`;
			} else if (roughSelect) {
				time = roughSelect.value;
			}
			const value = people?.value() ?? "";
			return {
				...(date && { date }),
				...(time && { time }),
				...(value && { people: value }),
			};
		},
		inputs,
	};
}

/**
 * "People", on its own so a form can place it wherever it belongs. With a
 * known cast (`options`) it's a dropdown that adds removable pills; without
 * one it falls back to free text.
 */
export function appendPeopleField(
	container: HTMLElement,
	initial: string | undefined,
	options?: string[]
): PeopleFieldHandle {
	container.createDiv({ cls: "modal-section-label", text: "People" });

	if (options && options.length > 0) {
		const peopleOptions = options;
		const selected = (initial ?? "")
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);

		const wrap = container.createDiv({ cls: "plan-people-field" });
		const select = wrap.createEl("select", {
			cls: "quick-idea-input plan-people-select",
		});
		const pillsEl = wrap.createDiv({ cls: "plan-people-pills" });

		const renderSelect = () => {
			select.empty();
			select.createEl("option", { value: "", text: "Add a person…" });
			for (const p of peopleOptions) {
				if (!selected.includes(p)) {
					select.createEl("option", { value: p, text: p });
				}
			}
			select.value = "";
		};
		const renderPills = () => {
			pillsEl.empty();
			selected.forEach((name, i) => {
				const pill = pillsEl.createSpan({ cls: "plan-people-pill" });
				pill.createSpan({ text: name });
				const x = pill.createEl("button", {
					cls: "plan-people-pill-x",
					attr: { type: "button", "aria-label": `Remove ${name}` },
				});
				x.setText("✕");
				x.addEventListener("click", (e) => {
					e.preventDefault();
					selected.splice(i, 1);
					renderPills();
					renderSelect();
				});
			});
		};
		select.addEventListener("change", () => {
			const v = select.value;
			if (v && !selected.includes(v)) selected.push(v);
			renderPills();
			renderSelect();
		});
		renderSelect();
		renderPills();
		return { value: () => selected.join(", "), input: null };
	}

	const input = container.createEl("input", {
		cls: "quick-idea-input",
		attr: { type: "text", placeholder: "e.g. Callan, Steve" },
	});
	input.value = initial ?? "";
	return { value: () => input.value.trim(), input };
}
