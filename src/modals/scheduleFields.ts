import { ROUGH_TIMES, roughTime } from "@/constants";

/**
 * Shared Date / Time / People fields for plan-item modals (ideas, travel,
 * accommodation). Time mirrors the flexible date picker: choose "Roughly"
 * (a part of the day — Morning, Lunchtime…) or "Exact" (hour + minute).
 * Blank fields are omitted from the returned value.
 */

export interface ScheduleFieldValues {
	date?: string;
	time?: string;
	people?: string;
}

export interface ScheduleFieldsHandle {
	values: () => ScheduleFieldValues;
	inputs: HTMLElement[];
}

export function appendScheduleFields(
	container: HTMLElement,
	initial: ScheduleFieldValues = {}
): ScheduleFieldsHandle {
	// Date on its own line.
	const dateField = container.createEl("div", {
		cls: "plan-schedule-field",
	});
	dateField.createEl("div", { cls: "modal-section-label", text: "Date" });
	const dateInput = dateField.createEl("input", {
		cls: "quick-idea-input",
		attr: { type: "date" },
	});
	dateInput.value = initial.date ?? "";

	// Time on its own line: Roughly/Exact selector beside its value input.
	const timeField = container.createEl("div", {
		cls: "plan-schedule-field",
	});
	timeField.createEl("div", { cls: "modal-section-label", text: "Time" });
	const timeControls = timeField.createEl("div", {
		cls: "plan-time-controls",
	});

	const initialTime = initial.time ?? "";
	const isExact = /^\d{1,2}:\d{2}$/.test(initialTime);
	const [initHour, initMinute] = isExact
		? initialTime.split(":")
		: ["", ""];
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

	container.createEl("div", { cls: "modal-section-label", text: "People" });
	const peopleInput = container.createEl("input", {
		cls: "quick-idea-input",
		attr: { type: "text", placeholder: "e.g. Callan, Steve" },
	});
	peopleInput.value = initial.people ?? "";

	return {
		values: () => {
			const date = dateInput.value.trim();
			let time = "";
			if (precision === "exact" && hourSelect && minuteSelect) {
				time = `${hourSelect.value}:${minuteSelect.value}`;
			} else if (roughSelect) {
				time = roughSelect.value;
			}
			const people = peopleInput.value.trim();
			return {
				...(date && { date }),
				...(time && { time }),
				...(people && { people }),
			};
		},
		inputs: [dateInput, peopleInput, precisionSelect],
	};
}
