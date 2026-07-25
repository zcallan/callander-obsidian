/**
 * Shared Date / Time / People fields for plan-item modals (ideas, travel,
 * accommodation). Appends the three inputs to `container` and hands back a
 * `values()` reader plus the inputs (so the modal can wire Enter-to-save).
 * Blank fields are omitted from the returned value.
 */

export interface ScheduleFieldValues {
	date?: string;
	time?: string;
	people?: string;
}

export interface ScheduleFieldsHandle {
	values: () => ScheduleFieldValues;
	inputs: HTMLInputElement[];
}

export function appendScheduleFields(
	container: HTMLElement,
	initial: ScheduleFieldValues = {}
): ScheduleFieldsHandle {
	// Date + Time as a two-column row that wraps on narrow screens.
	const row = container.createEl("div", { cls: "plan-schedule-row" });

	const dateField = row.createEl("div", { cls: "plan-schedule-field" });
	dateField.createEl("div", { cls: "modal-section-label", text: "Date" });
	const dateInput = dateField.createEl("input", {
		cls: "quick-idea-input",
		attr: { type: "date" },
	});
	dateInput.value = initial.date ?? "";

	const timeField = row.createEl("div", { cls: "plan-schedule-field" });
	timeField.createEl("div", { cls: "modal-section-label", text: "Time" });
	const timeInput = timeField.createEl("input", {
		cls: "quick-idea-input",
		attr: { type: "time" },
	});
	timeInput.value = initial.time ?? "";

	container.createEl("div", { cls: "modal-section-label", text: "People" });
	const peopleInput = container.createEl("input", {
		cls: "quick-idea-input",
		attr: { type: "text", placeholder: "e.g. me, Riley, Laura" },
	});
	peopleInput.value = initial.people ?? "";

	return {
		values: () => {
			const date = dateInput.value.trim();
			const time = timeInput.value.trim();
			const people = peopleInput.value.trim();
			return {
				...(date && { date }),
				...(time && { time }),
				...(people && { people }),
			};
		},
		inputs: [dateInput, timeInput, peopleInput],
	};
}
