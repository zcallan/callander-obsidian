import { createSuite } from "./harness.mjs";
import {
	GETTING_STARTED_STEPS,
	gettingStartedProgress,
} from "./.build/callander.mjs";

/** Every step false, with the given ones true. */
function facts(...on) {
	return Object.fromEntries(
		GETTING_STARTED_STEPS.map(({ id }) => [id, on.includes(id)])
	);
}

/**
 * The Getting started checklist ticks itself off from the vault, and keeps
 * a tick once it's earned — these pin down both halves.
 */
export function run() {
	const { eq, result } = createSuite("getting started");

	{
		const p = gettingStartedProgress(facts(), []);
		eq("a fresh vault has nothing done", p.done, []);
		eq("…and nothing to save", p.newlyDone, []);
	}
	{
		const p = gettingStartedProgress(facts("friend", "event"), []);
		eq("what the vault shows is done", p.done, ["friend", "event"]);
		eq("…and newly so, to be remembered", p.newlyDone, ["friend", "event"]);
	}
	{
		const p = gettingStartedProgress(facts(), ["quickNote"]);
		eq(
			"a remembered step stays done once the vault stops showing it",
			p.done,
			["quickNote"]
		);
		eq("…without being saved again", p.newlyDone, []);
	}
	{
		const p = gettingStartedProgress(facts("friend"), ["friend"]);
		eq("done and remembered isn't new", p.newlyDone, []);
	}
	{
		const p = gettingStartedProgress(facts("diary"), ["friend", "retired-step"]);
		eq(
			"done comes back in the checklist's order, retired ids dropped",
			p.done,
			["friend", "diary"]
		);
	}

	return result();
}
