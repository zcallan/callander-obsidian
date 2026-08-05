/**
 * The smallest Chrome DevTools Protocol client that will do.
 *
 * Obsidian is Electron, so launching it with `--remote-debugging-port`
 * exposes the renderer as an ordinary CDP target. That's all we need:
 * `Runtime.evaluate` lets a test run assertions *inside* the running app,
 * against the real `app.vault`, the real metadata cache and the real
 * plugin instance.
 *
 * puppeteer would do this too, but it drags in a browser download and a
 * page abstraction we'd never use.
 */

import WebSocket from "ws";

/** Poll the HTTP side of CDP until the renderer target shows up. */
export async function waitForTarget(port, { timeoutMs = 30000 } = {}) {
	const deadline = Date.now() + timeoutMs;
	let lastError = "no response";
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`http://127.0.0.1:${port}/json/list`);
			const targets = await res.json();
			const page = targets.find(
				(t) => t.type === "page" && t.webSocketDebuggerUrl
			);
			if (page) return page;
			lastError = `no page target (saw ${targets.length})`;
		} catch (err) {
			lastError = err.message;
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error(
		`CDP target never appeared on port ${port} (${lastError})`
	);
}

export class CdpSession {
	constructor(ws) {
		this.ws = ws;
		this.nextId = 1;
		this.pending = new Map();
		ws.on("message", (raw) => {
			const msg = JSON.parse(raw.toString());
			const waiter = this.pending.get(msg.id);
			if (!waiter) return;
			this.pending.delete(msg.id);
			if (msg.error) waiter.reject(new Error(msg.error.message));
			else waiter.resolve(msg.result);
		});
	}

	static async connect(wsUrl) {
		const ws = new WebSocket(wsUrl, { maxPayload: 256 * 1024 * 1024 });
		await new Promise((resolve, reject) => {
			ws.once("open", resolve);
			ws.once("error", reject);
		});
		return new CdpSession(ws);
	}

	send(method, params = {}) {
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.ws.send(JSON.stringify({ id, method, params }));
		});
	}

	/**
	 * Run an async function inside the renderer and return its value.
	 *
	 * The function is serialised, so it cannot close over anything here —
	 * pass data in via `args`, which is JSON-encoded into the call.
	 */
	async evaluate(fn, ...args) {
		const expression = `(${fn.toString()})(...${JSON.stringify(args)})`;
		const result = await this.send("Runtime.evaluate", {
			expression,
			awaitPromise: true,
			returnByValue: true,
			// Obsidian's renderer has no opener, so this just keeps
			// evaluation off the page's own console.
			includeCommandLineAPI: false,
		});
		if (result.exceptionDetails) {
			const text =
				result.exceptionDetails.exception?.description ??
				result.exceptionDetails.text;
			throw new Error(`in-app error: ${text}`);
		}
		return result.result.value;
	}

	/**
	 * Re-run `fn` until it returns truthy, or give up.
	 *
	 * `args` is passed through to evaluate() the same way — the callback is
	 * serialised, so anything it needs has to arrive as an argument rather
	 * than a closure.
	 */
	async waitFor(fn, { timeoutMs = 20000, label = "condition", args = [] } = {}) {
		const deadline = Date.now() + timeoutMs;
		let last;
		while (Date.now() < deadline) {
			last = await this.evaluate(fn, ...args);
			if (last) return last;
			await new Promise((r) => setTimeout(r, 200));
		}
		throw new Error(`timed out waiting for ${label} (last value: ${JSON.stringify(last)})`);
	}

	close() {
		this.ws.close();
	}
}
