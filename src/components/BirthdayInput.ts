import {
	parseFlexDate,
	toFlexString,
	formatFlexDate,
} from "@/utils/flexdate";

type BirthdayPrecision = "full" | "yearMonth" | "monthDay";

/**
 * Birthday input with honest imprecision: exact date, month + year (day
 * unknown), or month + day (year unknown). Calls onChange with the
 * canonical flex string ("1990-03-14" | "1990-03" | "03-14" | "").
 * Shared by AddContactModal and the contact page editor.
 */
export function createBirthdayPrecisionInput(
	container: HTMLElement,
	initialValue: string | number | null | undefined,
	onChange: (value: string) => void,
	options?: { inputClass?: string }
): void {
	const inputClass = options?.inputClass ?? "contact-field-input";

	const initialFlex = parseFlexDate(initialValue);
	let currentValue = initialFlex ? toFlexString(initialFlex) : "";

	const setValue = (value: string) => {
		currentValue = value;
		onChange(value);
	};

	let precision: BirthdayPrecision = "full";
	if (initialFlex) {
		if (initialFlex.day === null) precision = "yearMonth";
		else if (initialFlex.year === null) precision = "monthDay";
	}

	const controls = container.createEl("div", {
		cls: "contact-met-controls",
	});

	const precisionSelect = controls.createEl("select", {
		cls: "dropdown contact-met-precision",
		attr: { "aria-label": "How precisely do you know it?" },
	});
	(
		[
			["full", "Exact date"],
			["yearMonth", "Month + year"],
			["monthDay", "Month + day"],
		] as Array<[BirthdayPrecision, string]>
	).forEach(([id, label]) => {
		precisionSelect.createEl("option", { value: id, text: label });
	});
	precisionSelect.value = precision;

	const inputWrap = controls.createEl("div", {
		cls: "contact-bday-inputs",
	});

	const pad = (n: number) => String(n).padStart(2, "0");

	const renderInputs = () => {
		inputWrap.empty();
		const parsed = parseFlexDate(currentValue);

		if (precision === "full") {
			const input = inputWrap.createEl("input", {
				cls: inputClass,
				attr: { type: "date" },
			});
			if (parsed?.year && parsed?.month && parsed?.day) {
				input.value = `${parsed.year}-${pad(parsed.month)}-${pad(
					parsed.day
				)}`;
			}
			input.addEventListener("change", () => {
				const parsedInput = parseFlexDate(input.value.trim());
				setValue(parsedInput ? toFlexString(parsedInput) : "");
			});
		} else if (precision === "yearMonth") {
			const input = inputWrap.createEl("input", {
				cls: inputClass,
				attr: { type: "month" },
			});
			if (parsed?.year && parsed?.month) {
				input.value = `${parsed.year}-${pad(parsed.month)}`;
			}
			input.addEventListener("change", () => {
				const parsedInput = parseFlexDate(input.value.trim());
				setValue(parsedInput ? toFlexString(parsedInput) : "");
			});
		} else {
			// Month + day, year unknown
			const monthSelect = inputWrap.createEl("select", {
				cls: "dropdown contact-bday-month-select",
				attr: { "aria-label": "Month" },
			});
			monthSelect.createEl("option", { value: "", text: "Month…" });
			for (let m = 1; m <= 12; m++) {
				monthSelect.createEl("option", {
					value: String(m),
					text: formatFlexDate({ year: null, month: m, day: null }),
				});
			}
			const dayInput = inputWrap.createEl("input", {
				cls: `${inputClass} contact-bday-day-input`,
				attr: {
					type: "number",
					min: "1",
					max: "31",
					placeholder: "Day",
				},
			});
			if (parsed?.month) {
				monthSelect.value = String(parsed.month);
				if (parsed.day) dayInput.value = String(parsed.day);
			}

			const save = () => {
				const month = Number(monthSelect.value);
				const day = Number(dayInput.value);
				if (month >= 1 && day >= 1 && day <= 31) {
					setValue(toFlexString({ year: null, month, day }));
				} else if (!monthSelect.value && !dayInput.value) {
					setValue("");
				}
			};
			monthSelect.addEventListener("change", save);
			dayInput.addEventListener("change", save);
		}
	};

	precisionSelect.addEventListener("change", () => {
		precision = precisionSelect.value as BirthdayPrecision;

		// Dropping to a partial precision is a statement about what you
		// actually know — truncate the stored value immediately.
		const parsed = parseFlexDate(currentValue);
		if (parsed) {
			let truncated = { ...parsed };
			if (precision === "yearMonth") {
				truncated = { ...truncated, day: null };
				if (truncated.year === null) truncated = parsed;
			} else if (precision === "monthDay") {
				truncated = { ...truncated, year: null };
				if (truncated.day === null) truncated = parsed;
			}
			const truncatedStr = toFlexString(truncated);
			if (truncatedStr && truncatedStr !== toFlexString(parsed)) {
				setValue(truncatedStr);
			}
		}
		renderInputs();
	});

	renderInputs();
}
