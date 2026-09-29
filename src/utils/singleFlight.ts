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
