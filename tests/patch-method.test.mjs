import { createSuite } from "./harness.mjs";
import { patchMethod } from "./.build/callander.mjs";

/**
 * Patching a method another plugin may also patch. Removing ours must never
 * undo theirs, and ours must go quiet once removed, whichever order the
 * two are taken off in.
 */
export function run() {
	const { eq, result } = createSuite("patch method");
	const make = () => ({ calls: [], greet(name) { this.calls.push("base"); return `hi ${name}`; } });
	const wrapWith = (tag) => (original) =>
		function (name) {
			this.calls.push(tag);
			return original.call(this, name);
		};

	{
		const o = make();
		const base = o.greet;
		const unpatch = patchMethod(o, "greet", wrapWith("ours"));
		eq("the wrap runs, with `this` kept", [o.greet("Ann"), o.calls], ["hi Ann", ["ours", "base"]]);
		unpatch();
		eq("removed on top: the original is back", o.greet === base, true);
	}
	{
		// Theirs goes on after ours; ours comes off first.
		const o = make();
		const unpatchOurs = patchMethod(o, "greet", wrapWith("ours"));
		const theirs = patchMethod(o, "greet", wrapWith("theirs"));
		const theirsFn = o.greet;
		unpatchOurs();
		eq("theirs is left in place", o.greet === theirsFn, true);
		o.calls.length = 0;
		o.greet("Bo");
		eq("…and ours only passes calls through", o.calls, ["theirs", "base"]);
		theirs();
		o.calls.length = 0;
		o.greet("Cy");
		eq("theirs off too: ours, still under it, does nothing", o.calls, ["base"]);
	}
	return result();
}
