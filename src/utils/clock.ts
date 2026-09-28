import { pad2 } from "@/utils/dates";

/** An exact time as it's stored: "H:MM" or "HH:MM", on a 24-hour clock. */
const EXACT_TIME = /^(\d{1,2}):(\d{2})$/;

/** The picker's minutes run in steps of this many. */
const MINUTE_STEP = 5;

/** What the picker shows with no exact time stored: noon. */
const DEFAULT_HOUR = "12";
const DEFAULT_MINUTE = "00";

export interface ExactTimeChoices {
	/** The hour to select, "00"–"23". */
	hour: string;
	/** The minute to select, "00"–"59". */
	minute: string;
	/** Every minute to offer, in order. */
	minutes: string[];
}

/**
 * What an hour-and-minute picker offers, and selects, for a stored time.
 *
 * Every time a note can hold has to be one the picker can show. Otherwise
 * the select falls back to its first option, and saving a form whose time
 * nobody touched writes that over the time instead: "9:30" matched none of
 * the zero-padded hours and saved as "00:30", and "19:07", between the
 * five-minute steps, saved as "19:00". So the hour is padded, and a minute
 * off the steps is offered alongside them.
 */
export function exactTimeChoices(stored: string | undefined): ExactTimeChoices {
	const minutes: number[] = [];
	for (let m = 0; m < 60; m += MINUTE_STEP) minutes.push(m);

	const match = EXACT_TIME.exec(stored ?? "");
	const hour = Number(match?.[1]);
	const minute = Number(match?.[2]);
	if (!match || hour > 23 || minute > 59) {
		return {
			hour: DEFAULT_HOUR,
			minute: DEFAULT_MINUTE,
			minutes: minutes.map(pad2),
		};
	}
	if (!minutes.includes(minute)) {
		minutes.push(minute);
		minutes.sort((a, b) => a - b);
	}
	return { hour: pad2(hour), minute: pad2(minute), minutes: minutes.map(pad2) };
}
