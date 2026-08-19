import { ALL_DAY_TIME, ANY_TIME, ROUGH_TIMES, roughTime } from "@/constants";
import {
	formatDurationLabel,
	formatHourLabel,
	parseDurationMinutes,
} from "@/utils/planFormat";

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
	/**
	 * When set, Date offers these days rather than a free date picker.
	 * A short run of them renders as pills — with only a few days to choose
	 * from, the weekday alone identifies each one and a dropdown is more
	 * work than the choice deserves. Longer ranges stay a dropdown.
	 */
	dayOptions?: Array<{ value: string; label: string; short?: string }>;
	/** When set, People is a dropdown of these names (adds pills). */
	people?: string[];
	/** Stays close out their day, so they don't carry a clock time. */
	hideTime?: boolean;
	/** Skip Date — for a form that picks its own days (a quick idea offers
	 * several candidates, which one date field can't express). */
	hideDate?: boolean;
	/** Fired when the date changes — lets a caller track it live. */
	onDateChange?: () => void;
	/** Skip People here so a caller can place it elsewhere in the form. */
	hidePeople?: boolean;
	/** ISO date the plan ends — a stay can't check out after it. */
	lastDay?: string;
	/** Heading over the Date control; "Date" unless a caller says otherwise. */
	dateLabel?: string;
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
	const dateField = options.hideDate
		? null
		: container.createDiv({ cls: "plan-schedule-field" });
	dateField?.createDiv({
		cls: "modal-section-label",
		text: options.dateLabel ?? "Date",
	});
	const initialDate = initial.date ?? "";
	let dateInput: HTMLInputElement | null = null;
	let dateSelect: HTMLSelectElement | null = null;
	// Above this many days the pills would wrap into a block of their own
	// and stop being quicker to read than a list.
	const PILL_LIMIT = 6;
	let pillDate = initialDate;
	if (!dateField) {
		// No date control at all — values() falls through to "".
	} else if (
		options.dayOptions &&
		options.dayOptions.length > 0 &&
		options.dayOptions.length < PILL_LIMIT
	) {
		const days = options.dayOptions;
		const row = dateField.createDiv({
			cls: "someday-filter-options plan-date-pills",
		});
		const pills = new Map<string, HTMLButtonElement>();
		const applyPills = () =>
			pills.forEach((el, v) => el.toggleClass("is-active", v === pillDate));
		for (const d of days) {
			const pill = row.createEl("button", {
				cls: "someday-filter-pill",
				// Just the weekday: within a handful of days there's only one
				// Thursday, and the date adds nothing you don't know.
				text: d.short || d.label.split(" ")[0],
				attr: { type: "button" },
			});
			pill.addEventListener("click", () => {
				// Re-clicking clears it — a date here is optional, and this
				// is the only way back to none.
				pillDate = pillDate === d.value ? "" : d.value;
				applyPills();
				options.onDateChange?.();
			});
			pills.set(d.value, pill);
		}
		applyPills();
	} else if (options.dayOptions && options.dayOptions.length > 0) {
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
		precisionSelect.createEl("option", {
			value: "exact",
			text: "Exactly",
		});
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
			// "Any time" is the default and the way back to no time at all.
			// "All day" answers the same question differently, so it sits
			// with it — ruled off from the hours, which are a different kind
			// of answer entirely.
			roughSelect.createEl("option", { value: "", text: "Any time" });
			roughSelect.createEl("option", {
				value: ALL_DAY_TIME.id,
				text: ALL_DAY_TIME.label,
			});
			const divider = roughSelect.createEl("option", { text: "—" });
			divider.disabled = true;
			const current = roughTime(initialTime)?.id;
			if (current === ALL_DAY_TIME.id) {
				roughSelect.value = ALL_DAY_TIME.id;
			}
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
		for (let m = 0; m < 60; m += 5) {
			const v = String(m).padStart(2, "0");
			const opt = minuteSelect.createEl("option", { value: v, text: v });
			if (v === (initMinute || "00")) opt.selected = true;
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
				: dateInput
				? dateInput.value.trim()
				: pillDate;
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
	options?: string[],
	label = "People"
): PeopleFieldHandle {
	container.createDiv({ cls: "modal-section-label", text: label });

	if (options && options.length > 0) {
		const peopleOptions = options;
		const selected = (initial ?? "")
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);

		const wrap = container.createDiv({ cls: "people-field" });
		const select = wrap.createEl("select", {
			cls: "quick-idea-input people-select",
		});
		const pillsEl = wrap.createDiv({ cls: "people-pills" });

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
				const pill = pillsEl.createSpan({ cls: "people-pill" });
				pill.createSpan({ text: name });
				const x = pill.createEl("button", {
					cls: "people-pill-x",
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

/** A duration control's handle — the stored string, or "" when unset. */
export interface DurationFieldHandle {
	value: () => string;
}

/**
 * "How long", as an hours + minutes pair rather than free text.
 *
 * Stores the same canonical string the field always held ("2h 30m"), so
 * existing values keep displaying unchanged everywhere they already appear
 * — the dropdowns are a nicer way to write one, not a new data shape.
 *
 * Minutes go in fives: a plan is not a stopwatch, and sixty options to
 * scroll past would make the common answers harder to reach, not easier.
 */
export function appendDurationField(
	container: HTMLElement,
	initial: string | undefined,
	label = "Duration (optional)"
): DurationFieldHandle {
	container.createDiv({ cls: "modal-section-label", text: label });
	const row = container.createDiv({ cls: "plan-time-selects" });

	const total = parseDurationMinutes(initial);
	const initialHours = total === null ? 0 : Math.floor(total / 60);
	// Snapped to the nearest five, so a legacy "1h 7m" still selects
	// something rather than silently falling back to zero.
	const initialMinutes =
		total === null ? 0 : Math.round((total % 60) / 5) * 5;

	const hourSelect = row.createEl("select", {
		cls: "quick-idea-input plan-time-select",
		attr: { "aria-label": "Hours" },
	});
	for (let h = 0; h <= 23; h++) {
		const opt = hourSelect.createEl("option", {
			value: String(h),
			text: `${h}h`,
		});
		if (h === initialHours) opt.selected = true;
	}

	const minuteSelect = row.createEl("select", {
		cls: "quick-idea-input plan-time-select",
		attr: { "aria-label": "Minutes" },
	});
	for (let m = 0; m < 60; m += 5) {
		const opt = minuteSelect.createEl("option", {
			value: String(m),
			text: `${m}m`,
		});
		// 60 isn't an option, so a snap that rounded up to it belongs on the
		// hour above — but that hour was already floored from the total, so
		// clamp here rather than leave nothing selected.
		if (m === Math.min(initialMinutes, 55)) opt.selected = true;
	}

	return {
		value: () =>
			formatDurationLabel(
				Number(hourSelect.value) * 60 + Number(minuteSelect.value)
			),
	};
}

/** A check-in/check-out pair — each "HH:MM" or "" when unset. */
export interface HourRangeHandle {
	values: () => { from: string; to: string };
}

/**
 * Two hour-only dropdowns side by side, each under its own label.
 *
 * Hours alone, no minutes: nobody records a 3:15pm check-in, and the pair
 * exists to give the stay a shape on a calendar rather than to be precise.
 * "Any time" is the blank — either can be left unset, which is what an
 * all-day booking looks like.
 */
export function appendHourRangeField(
	container: HTMLElement,
	labels: { from: string; to: string },
	initial: { from?: string; to?: string } = {}
): HourRangeHandle {
	const row = container.createDiv({ cls: "plan-time-selects" });

	const build = (label: string, current: string | undefined) => {
		const wrap = row.createDiv({ cls: "plan-hour-range-half" });
		// The label sits on the control itself — there's no section heading
		// above the pair, so this is the only thing naming either one.
		wrap.createDiv({ cls: "modal-section-label", text: label });
		const select = wrap.createEl("select", {
			cls: "quick-idea-input plan-time-select",
			attr: { "aria-label": label },
		});
		// Unset leads, because it's the honest default — most stays haven't
		// had their hours checked yet. "Any time" is a real answer sitting
		// below it, for when they genuinely don't matter; conflating the two
		// would claim you can arrive whenever before anyone has looked.
		select.createEl("option", { value: "", text: "—" });
		select.createEl("option", { value: ANY_TIME, text: "Any time" });
		if (current === ANY_TIME) {
			select.value = ANY_TIME;
		}
		const currentHour = /^(\d{1,2}):/.exec(current ?? "")?.[1];
		for (let h = 0; h <= 23; h++) {
			const value = `${String(h).padStart(2, "0")}:00`;
			const opt = select.createEl("option", {
				value,
				text: formatHourLabel(h),
			});
			if (currentHour !== undefined && Number(currentHour) === h) {
				opt.selected = true;
			}
		}
		return select;
	};

	const fromSelect = build(labels.from, initial.from);
	const toSelect = build(labels.to, initial.to);

	return {
		values: () => ({ from: fromSelect.value, to: toSelect.value }),
	};
}

/** An hours+minutes clock control's handle — "HH:MM", or "" when unset. */
export interface ClockFieldHandle {
	value: () => string;
}

/**
 * A time of day as hour + minute dropdowns, in the same shape as the
 * duration control beside it.
 *
 * Not `<input type="time">`: that renders as a different control on every
 * platform, and on mobile opens a spinner that fights the same keyboard
 * work the rest of these forms are careful about. Two selects behave
 * identically everywhere, and pair visually with Duration underneath.
 *
 * Both dropdowns carry a blank option, because a time is optional here —
 * clearing either one clears the value entirely rather than silently
 * meaning midnight.
 */
export function appendClockField(
	container: HTMLElement,
	initial: string | undefined,
	label = "Time (optional)"
): ClockFieldHandle {
	container.createEl("label", { text: label });
	const row = container.createDiv({ cls: "plan-time-selects" });

	const match = /^(\d{1,2}):(\d{2})$/.exec(initial ?? "");
	const initialHour = match ? Number(match[1]) : null;
	// Snapped to the nearest five so an existing "7:07" still selects
	// something rather than falling back to blank.
	const initialMinute = match
		? Math.min(Math.round(Number(match[2]) / 5) * 5, 55)
		: null;

	const hourSelect = row.createEl("select", {
		cls: "quick-idea-input plan-time-select",
		attr: { "aria-label": "Hour" },
	});
	hourSelect.createEl("option", { value: "", text: "—" });
	for (let h = 0; h < 24; h++) {
		const opt = hourSelect.createEl("option", {
			value: String(h),
			// 12-hour label, 24-hour value: the value is what sorts and
			// stores, the label is what reads.
			text: formatHourLabel(h),
		});
		if (h === initialHour) opt.selected = true;
	}

	const minuteSelect = row.createEl("select", {
		cls: "quick-idea-input plan-time-select",
		attr: { "aria-label": "Minute" },
	});
	for (let m = 0; m < 60; m += 5) {
		const opt = minuteSelect.createEl("option", {
			value: String(m),
			text: `:${String(m).padStart(2, "0")}`,
		});
		if (m === initialMinute) opt.selected = true;
	}

	return {
		value: () => {
			if (hourSelect.value === "") return "";
			const hour = Number(hourSelect.value);
			const minute = Number(minuteSelect.value);
			return `${String(hour).padStart(2, "0")}:${String(minute).padStart(
				2,
				"0"
			)}`;
		},
	};
}
