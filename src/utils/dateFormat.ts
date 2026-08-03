/**
 * House date style: en-AU (day before month) and never a comma.
 *
 * Always pass an explicit locale — `toLocaleDateString(undefined, …)` follows
 * whatever the device is set to, so the same note reads "Fri, Aug 14" on one
 * machine and "Fri, 14 Aug" on another.
 */
export function formatDate(
	date: Date,
	options: Intl.DateTimeFormatOptions
): string {
	return date.toLocaleDateString("en-AU", options).replace(/,/g, "");
}

/** 1 → "1st", 22 → "22nd", 13 → "13th". */
export function ordinalDay(day: number): string {
	const teens = day % 100;
	if (teens >= 11 && teens <= 13) return `${day}th`;
	switch (day % 10) {
		case 1:
			return `${day}st`;
		case 2:
			return `${day}nd`;
		case 3:
			return `${day}rd`;
		default:
			return `${day}th`;
	}
}
