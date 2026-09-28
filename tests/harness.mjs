/**
 * A deliberately tiny assertion harness — no dependencies, no globals, no
 * watch mode. The point is that `npm test` stays a plain `node` invocation
 * that works identically on a laptop and in CI, with nothing to keep in
 * sync as the toolchain moves.
 */

/**
 * Assertions made after their suite's result() was taken — almost always a
 * missing `await`, which would otherwise drop them without a word. The
 * runner reports them at the end of the run.
 */
export const late = [];

/**
 * JSON, with the values plain JSON would blur made visible: NaN and
 * ±Infinity (JSON writes them as null) and Map and Set (written as {}).
 * Without it, `eq(x, null)` passed with x at Infinity. Everything else keeps
 * plain JSON's shape — a key set to undefined is still an absent key, which
 * expectations here rely on.
 */
function tagged(_key, value) {
	if (typeof value === "number" && !Number.isFinite(value)) {
		return { "§number": String(value) };
	}
	if (value instanceof Map) return { "§map": [...value] };
	if (value instanceof Set) return { "§set": [...value] };
	return value;
}

export function createSuite(name) {
	let pass = 0;
	let closed = false;
	const failures = [];

	const record = (label, ok, detail) => {
		if (closed) {
			late.push({ file: name, label });
			return;
		}
		if (ok) pass++;
		else failures.push({ label, detail });
	};

	return {
		/** Deep equality by JSON shape — enough for the plain data these
		 * modules pass around, and it prints a readable diff. */
		eq(label, actual, expected) {
			let a;
			let e;
			try {
				a = JSON.stringify(actual, tagged);
				e = JSON.stringify(expected, tagged);
			} catch (error) {
				// A cycle, most often: anything holding a TFile leads back
				// to its vault. Never a pass, since two different values
				// can fail with the same message.
				record(
					label,
					false,
					`  can't compare as JSON (${error.message}); compare a field instead`
				);
				return;
			}
			record(label, a === e, `  got:      ${a}\n  expected: ${e}`);
		},
		/** A truthy check. `detail` says what was wrong, for a failure a
		 * bare "expected a truthy value" wouldn't explain. */
		ok(label, condition, detail = "expected a truthy value") {
			record(label, !!condition, `  ${detail}`);
		},
		result() {
			closed = true;
			return { name, pass, failures };
		},
	};
}
