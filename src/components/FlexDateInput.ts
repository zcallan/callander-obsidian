import {
	parseFlexDate,
	toFlexString,
	flexPrecision,
	FlexPrecision,
} from "@/utils/flexdate";

/**
 * Year-first flexible date input: record just the year ("2019"), the month
 * ("2019-03"), or the exact day ("2019-03-14") — as precisely as you
 * actually remember. Used for the "met" field and for events.
 * Calls onChange with the canonical flex string ("" when cleared).
 */
export function createFlexDateInput(
	container: HTMLElement,
	initialValue: string | number | null | undefined,
	onChange: (value: string) => void,
	options?: {
		inputClass?: string;
		defaultPrecision?: FlexPrecision;
		allowFuture?: boolean;
		/** Which precisions to offer. Defaults to all three. */
		precisions?: FlexPrecision[];
	}
): void {
	const inputClass = options?.inputClass ?? "contact-field-input";
	const allowed: FlexPrecision[] = options?.precisions?.length
		? options.precisions
		: ["year", "month", "day"];

	const initialFlex = parseFlexDate(initialValue);
	let currentValue = initialFlex ? toFlexString(initialFlex) : "";
	let precision: FlexPrecision = initialFlex
		? flexPrecision(initialFlex)
		: options?.defaultPrecision ?? "year";
	// A stored value can be coarser than this field now offers (or the
	// caller's default may not be on the list) — fall back to the coarsest
	// option rather than rendering a control that isn't there.
	if (!allowed.includes(precision)) precision = allowed[0];

	const setValue = (value: string) => {
		currentValue = value;
		onChange(value);
	};

	const controls = container.createDiv({
		cls: "contact-met-controls",
	});

	const precisionSelect = controls.createEl("select", {
		cls: "dropdown contact-met-precision",
		attr: { "aria-label": "How precisely do you remember?" },
	});
	(
		[
			["year", "Year only"],
			["month", "Month"],
			["day", "Exact day"],
		] as Array<[FlexPrecision, string]>
	)
		.filter(([id]) => allowed.includes(id))
		.forEach(([id, label]) => {
			precisionSelect.createEl("option", { value: id, text: label });
		});
	precisionSelect.value = precision;

	let input: HTMLInputElement | null = null;

	const pad = (n: number) => String(n).padStart(2, "0");

	const renderInput = () => {
		input?.remove();
		input = controls.createEl("input", {
			cls: `${inputClass} contact-met-input`,
		});
		const parsed = parseFlexDate(currentValue);

		if (precision === "year") {
			input.type = "number";
			input.placeholder = "e.g. 2019";
			input.min = "1900";
			input.max = String(
				new Date().getFullYear() + (options?.allowFuture ? 50 : 0)
			);
			if (parsed?.year) input.value = String(parsed.year);
		} else if (precision === "month") {
			input.type = "month";
			if (parsed?.year && parsed?.month) {
				input.value = `${parsed.year}-${pad(parsed.month)}`;
			}
		} else {
			input.type = "date";
			if (parsed?.year && parsed?.month && parsed?.day) {
				input.value = `${parsed.year}-${pad(parsed.month)}-${pad(
					parsed.day
				)}`;
			}
		}

		input.addEventListener("change", () => {
			const raw = input!.value.trim();
			if (!raw) {
				setValue("");
				return;
			}
			const parsedInput = parseFlexDate(raw);
			if (parsedInput) {
				setValue(toFlexString(parsedInput));
			}
		});
	};

	precisionSelect.addEventListener("change", () => {
		precision = precisionSelect.value as FlexPrecision;

		// Choosing a coarser precision is a statement — "I only know the
		// year" — so truncate the stored value to match immediately.
		const parsed = parseFlexDate(currentValue);
		if (parsed) {
			const truncated = { ...parsed };
			if (precision === "year") {
				truncated.month = null;
				truncated.day = null;
			} else if (precision === "month") {
				truncated.day = null;
			}
			const truncatedStr = toFlexString(truncated);
			if (truncatedStr !== toFlexString(parsed)) {
				setValue(truncatedStr);
			}
		}
		renderInput();
	});

	renderInput();
}
