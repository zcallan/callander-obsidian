/** The parts of a TFile this reads: where it is, and when it last changed. */
interface WrittenFile {
	path: string;
	stat: { mtime: number };
}

/**
 * Tells a view's own writes apart from everyone else's — exactly, where a
 * clock window after each write could only guess.
 *
 * Obsidian fires `modify` from inside a write, before the awaited call
 * resolves (CLAUDE.md's table measures it), so a write is counted while it
 * runs and any event for its file in that time is its own. Once it lands,
 * the file's new mtime is kept: an event that arrives late for that same
 * write — slow storage, iOS file coordination — still carries that mtime
 * and still reads as ours. Anything else, a sync or an edit in another pane,
 * changes the mtime again and reads as someone else's.
 *
 * The window it replaces dropped a genuine change that landed within a
 * second of a local write, and let the page's own event through whenever a
 * write took longer than that.
 */
export class OwnWrites {
	/** Writes in flight, per path. */
	private running = new Map<string, number>();
	/** Each path's mtime just after this view last wrote it. */
	private landed = new Map<string, number>();

	/** Run `write` as one of ours. It should write `file` and nothing else. */
	async run<T>(file: WrittenFile, write: () => Promise<T>): Promise<T> {
		const path = file.path;
		this.running.set(path, (this.running.get(path) ?? 0) + 1);
		try {
			return await write();
		} finally {
			const left = (this.running.get(path) ?? 1) - 1;
			if (left > 0) this.running.set(path, left);
			else this.running.delete(path);
			// Even after a failure: whatever the file's mtime is now, it's
			// either still the old one or the result of this write.
			this.landed.set(file.path, file.stat.mtime);
		}
	}

	/** Whether a `modify` for `file`, arriving now, came from one of ours. */
	isOwn(file: WrittenFile): boolean {
		return (
			(this.running.get(file.path) ?? 0) > 0 ||
			this.landed.get(file.path) === file.stat.mtime
		);
	}
}
