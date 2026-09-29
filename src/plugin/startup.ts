/**
 * The plugin's startup work, as named steps that fail on their own: one
 * that throws is logged and reported, and the rest still run. Steps that
 * depend on each other belong in one task, so their order holds.
 */

export interface StartupTask {
	name: string;
	run: () => Promise<void>;
}

/** Runs each task in order; resolves to the names of those that threw. */
export async function runStartupTasks(
	tasks: readonly StartupTask[]
): Promise<string[]> {
	const failed: string[] = [];
	for (const task of tasks) {
		try {
			await task.run();
		} catch (error) {
			console.error(
				`Callander: startup step "${task.name}" failed`,
				error
			);
			failed.push(task.name);
		}
	}
	return failed;
}
