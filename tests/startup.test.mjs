import { createSuite } from "./harness.mjs";
import { Notice, runAction, runLogged, runStartupTasks } from "./.build/callander.mjs";

/** A startup step that throws is reported, and the rest still run. */
export async function run() {
	const { eq, result } = createSuite("startup");
	const errors = console.error;
	console.error = () => {};
	try {
		const ran = [];
		const failed = await runStartupTasks([
			{ name: "a", run: async () => void ran.push("a") },
			{ name: "b", run: async () => { ran.push("b"); throw new Error("bad yaml"); } },
			{ name: "c", run: async () => void ran.push("c") },
			{ name: "d", run: () => Promise.reject("not an Error") },
		]);
		eq("every step runs, in order", ran, ["a", "b", "c"]);
		eq("the failures are named", failed, ["b", "d"]);
		eq("none failing, nothing reported", await runStartupTasks([{ name: "x", run: async () => {} }]), []);

		Notice.all.length = 0;
		runLogged("background", () => Promise.reject(new Error("x")));
		runLogged("asked for", () => Promise.reject(new Error("y")), "Couldn't log that entry");
		runLogged("fine", async () => "ok", "never shown");
		await new Promise((resolve) => setTimeout(resolve, 0));
		eq("only work the person asked for says so", Notice.all, ["Couldn't log that entry"]);

		Notice.all.length = 0;
		let acted = false;
		runAction("save the sort", () => Promise.reject(new Error("locked")));
		runAction("file the idea", async () => void (acted = true));
		await new Promise((resolve) => setTimeout(resolve, 0));
		eq("an action says what it couldn't do, and only when it fails", [Notice.all, acted], [["Couldn't save the sort"], true]);
	} finally {
		console.error = errors;
	}
	return result();
}
