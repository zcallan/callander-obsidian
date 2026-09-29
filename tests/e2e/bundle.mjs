import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/** The newest file under `dir`, as [path, mtimeMs]. */
function newestUnder(dir) {
	let newest = ["", 0];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		const found = entry.isDirectory()
			? newestUnder(full)
			: [full, statSync(full).mtimeMs];
		if (found[1] > newest[1]) newest = found;
	}
	return newest;
}

/**
 * Why the root build can't be trusted for an e2e run, or null when it can.
 *
 * The suite installs whatever main.js and styles.css the root holds, and
 * `test:e2e` doesn't build. Run on its own after an edit, it tested the old
 * bundle and reported on code that wasn't there.
 */
export function staleBundleReason(root) {
	const [source, sourceTime] = newestUnder(path.join(root, "src"));
	for (const name of ["main.js", "styles.css"]) {
		const built = path.join(root, name);
		if (!existsSync(built)) return `${name} is missing`;
		if (statSync(built).mtimeMs < sourceTime) {
			return `${name} is older than ${path.relative(root, source)}`;
		}
	}
	return null;
}
