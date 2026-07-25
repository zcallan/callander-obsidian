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
	const dateField = container.createEl("div", { cls: "plan-schedule-field" });
	dateField.createEl("div", { cls: "modal-section-label", text: "Date" });
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

	// --- Time: Roughly / Exact ---
	const timeField = container.createEl("div", { cls: "plan-schedule-field" });
	timeField.createEl("div", { cls: "modal-section-label", text: "Time" });
	const timeControls = timeField.createEl("div", {
		cls: "plan-time-controls",
	});

	const initialTime = initial.time ?? "";
	const isExact = /^\d{1,2}:\d{2}$/.test(initialTime);
	const [initHour, initMinute] = isExact ? initialTime.split(":") : ["", ""];
	let precision: "rough" | "exact" = isExact ? "exact" : "rough";

	const precisionSelect = timeControls.createEl("select", {
		cls: "dropdown plan-time-precision",
		attr: { "aria-label": "How precisely do you know the time?" },
	});
	precisionSelect.createEl("option", { value: "rough", text: "Roughly" });
	precisionSelect.createEl("option", { value: "exact", text: "Exact" });
	precisionSelect.value = precision;

	const dynamic = timeControls.createEl("div", { cls: "plan-time-dynamic" });
	let roughSelect: HTMLSelectElement | null = null;
	let hourSelect: HTMLSelectElement | null = null;
	let minuteSelect: HTMLSelectElement | null = null;

	const renderTime = () => {
		dynamic.empty();
		roughSelect = hourSelect = minuteSelect = null;

		if (precision === "rough") {
			roughSelect = dynamic.createEl("select", {
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

		const selects = dynamic.createEl("div", { cls: "plan-time-selects" });
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
		selects.createEl("span", { cls: "plan-time-colon", text: ":" });
		minuteSelect = selects.createEl("select", {
			cls: "quick-idea-input plan-time-select",
		});
		for (const m of ["00", "15", "30", "45"]) {
			const opt = minuteSelect.createEl("option", { value: m, text: m });
			if (m === (initMinute || "00")) opt.selected = true;
		}
	};

	precisionSelect.addEventListener("change", () => {
		precision = precisionSelect.value as "rough" | "exact";
		renderTime();
	});
	renderTime();

	// --- People ---
	container.createEl("div", { cls: "modal-section-label", text: "People" });
	let peopleInput: HTMLInputElement | null = null;
	let getPeople: () => string;

	if (options.people && options.people.length > 0) {
		const peopleOptions = options.people;
		const selected = (initial.people ?? "")
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);

		const wrap = container.createEl("div", { cls: "plan-people-field" });
		const select = wrap.createEl("select", {
			cls: "quick-idea-input plan-people-select",
		});
		const pillsEl = wrap.createEl("div", { cls: "plan-people-pills" });

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
				const pill = pillsEl.createEl("span", {
					cls: "plan-people-pill",
				});
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
		getPeople = () => selected.join(", ");
	} else {
		peopleInput = container.createEl("input", {
			cls: "quick-idea-input",
			attr: { type: "text", placeholder: "e.g. Callan, Steve" },
		});
		peopleInput.value = initial.people ?? "";
		getPeople = () => peopleInput!.value.trim();
	}

	const inputs: HTMLElement[] = [precisionSelect];
	if (dateInput) inputs.push(dateInput);
	if (peopleInput) inputs.push(peopleInput);

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
			const people = getPeople();
			return {
				...(date && { date }),
				...(time && { time }),
				...(people && { people }),
			};
		},
		inputs,
	};
}
