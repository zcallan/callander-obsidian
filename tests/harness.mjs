/**
 * A deliberately tiny assertion harness — no dependencies, no globals, no
 * watch mode. The point is that `npm test` stays a plain `node` invocation
 * that works identically on a laptop and in CI, with nothing to keep in
 * sync as the toolchain moves.
 */

export function createSuite(name) {
	let pass = 0;
	const failures = [];

	const record = (label, ok, detail) => {
		if (ok) pass++;
		else failures.push({ label, detail });
	};

	return {
		/** Deep equality by JSON shape — enough for the plain data these
		 * modules pass around, and it prints a readable diff. */
		eq(label, actual, expected) {
			const a = JSON.stringify(actual);
			const e = JSON.stringify(expected);
			record(label, a === e, `  got:      ${a}\n  expected: ${e}`);
		},
		ok(label, condition) {
			record(label, !!condition, "  expected a truthy value");
		},
		/** Asserts the callback throws; used for the calc guardrails. */
		throws(label, fn) {
			let threw = false;
			try {
				fn();
			} catch {
				threw = true;
			}
			record(label, threw, "  expected it to throw");
		},
		result() {
			return { name, pass, failures };
		},
	};
}
