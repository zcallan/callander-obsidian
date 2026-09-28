import { createSuite } from "./harness.mjs";
import {
	errorText,
	guardedAction,
	Notice,
	SAVE_FAILED,
} from "./.build/callander.mjs";

/** A write the test holds open, then lets finish (or fail) by hand. */
function heldWrite() {
	let finish;
	const done = new Promise((resolve) => {
		finish = resolve;
	});
	return { done, finish };
}

/**
 * What a promise has settled to within a moment, or "still waiting". For a
 * call that should come straight back: were it to wait on a held write
 * instead, awaiting it outright would hang the run rather than fail a test.
 */
function soon(promise) {
	return Promise.race([
		promise,
		new Promise((resolve) => setTimeout(() => resolve("still waiting"), 50)),
	]);
}

/** Runs `body` with console.error captured, so a failure test stays quiet. */
async function capturingErrors(body) {
	const logged = [];
	const original = console.error;
	console.error = (...args) => logged.push(args);
	try {
		await body(logged);
	} finally {
		console.error = original;
	}
}

/**
 * The guard every modal's Save and Delete runs behind. What it has to get
 * right is small, and each part of it is a bug when missing: a second press
 * mid-write makes a second note or deletes a second entry, a guard that never
 * lets go leaves a form that can't be saved again, and a failure that isn't
 * caught is silent.
 */
export async function run() {
	const { eq, result } = createSuite("guarded action");

	// ---------- one at a time ----------
	{
		let runs = 0;
		const write = heldWrite();
		const save = guardedAction(() => {
			runs++;
			return write.done;
		});
		const first = save();
		eq("a second press while it writes is turned away", await soon(save()), false);
		eq("…without running it again", runs, 1);
		write.finish();
		eq("the first runs to the end", await first, true);
		eq("once it's done it can run again", await save(), true);
		eq("…and does", runs, 2);
	}

	// ---------- its buttons ----------
	{
		const write = heldWrite();
		const saveButton = { disabled: false };
		// Disabled for its own reasons (say, nothing typed yet), which the
		// guard mustn't undo when it's finished.
		const offAlready = { disabled: true };
		const save = guardedAction(() => write.done, {
			buttons: [saveButton, offAlready],
		});
		const pending = save();
		eq(
			"its buttons are disabled while it writes",
			[saveButton.disabled, offAlready.disabled],
			[true, true]
		);
		write.finish();
		await pending;
		eq(
			"…and put back as they were after",
			[saveButton.disabled, offAlready.disabled],
			[false, true]
		);
	}

	// ---------- when the write fails ----------
	await capturingErrors(async (logged) => {
		Notice.all.length = 0;
		const deleteButton = { disabled: false };
		let calls = 0;
		const remove = guardedAction(
			async () => {
				calls++;
				if (calls === 1) throw new Error("disk full");
			},
			{ buttons: [deleteButton], failure: "Couldn't delete" }
		);
		eq("a write that throws resolves false", await remove(), false);
		eq("…and says why", Notice.all, ["Couldn't delete: disk full"]);
		eq("…logs it", logged.length, 1);
		eq("…gives its button back", deleteButton.disabled, false);
		eq("…and can be tried again", await remove(), true);
	});
	await capturingErrors(async () => {
		Notice.all.length = 0;
		const save = guardedAction(() => {
			throw "not an Error";
		});
		eq("a throw before any await is caught too", await save(), false);
		eq("…in the default wording", Notice.all, [`${SAVE_FAILED}: not an Error`]);
	});

	eq("an Error reads as its message", errorText(new Error("nope")), "nope");
	eq("anything else as itself", errorText(42), "42");

	return result();
}
