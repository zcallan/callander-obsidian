/**
 * One run at a time: a call while a run is in flight gets that run's
 * promise rather than starting another, so `await` means it has finished.
 * The next call after it settles starts a fresh run.
 */
export function singleFlight<T>(fn: () => Promise<T>): () => Promise<T> {
	let inFlight: Promise<T> | null = null;
	return () => {
		if (inFlight) return inFlight;
		const run = fn().finally(() => {
			inFlight = null;
		});
		inFlight = run;
		return run;
	};
}

/**
 * One run at a time, and a call while one runs queues exactly one more
 * after it, however many calls arrive meanwhile. Every caller's `await`
 * ends after a run that started after it asked, so a change that landed
 * mid-read still gets drawn — where singleFlight's caller would get the
 * run already reading, and could be shown what was there before.
 */
export function queuedFlight(fn: () => Promise<void>): () => Promise<void> {
	let inFlight: Promise<void> | null = null;
	let again = false;
	return () => {
		if (inFlight) {
			again = true;
			return inFlight;
		}
		inFlight = (async () => {
			try {
				do {
					again = false;
					await fn();
				} while (again);
			} finally {
				inFlight = null;
			}
		})();
		return inFlight;
	};
}
