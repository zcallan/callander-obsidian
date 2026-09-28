/**
 * Runs `body` with the clock set to `at`: `new Date()` and `Date.now()`
 * start there, for code that reads the time itself rather than taking a
 * `now`. It keeps ticking from there in real time, so code that waits on
 * the clock still finishes; start at midday and a test won't cross a day.
 * Dates built from arguments are unaffected, and the real Date is put back
 * even if `body` throws.
 */
export async function atFixedDate(at, body) {
	const RealDate = Date;
	const offset = at.getTime() - RealDate.now();
	globalThis.Date = class extends RealDate {
		constructor(...args) {
			super(...(args.length > 0 ? args : [RealDate.now() + offset]));
		}
		static now() {
			return RealDate.now() + offset;
		}
	};
	try {
		return await body();
	} finally {
		globalThis.Date = RealDate;
	}
}
