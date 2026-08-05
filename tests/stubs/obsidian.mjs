/**
 * A stand-in for the `obsidian` module, plus an in-memory vault the service
 * layer can actually run against.
 *
 * Two jobs:
 *
 *  1. Satisfy the imports of the pure modules (TFile, normalizePath …) so
 *     they can be bundled and exercised in Node at all.
 *  2. Model enough of Vault / MetadataCache / FileManager that
 *     ContactOperations and PlanOperations run unmodified — which is where
 *     the persistence and migration bugs actually live.
 *
 * Everything is in memory. No test can reach a real vault, because there is
 * no filesystem access here at all.
 *
 * Known divergence: the real metadata cache is populated by an async
 * indexing pass, so a file written a moment ago may not be in it yet. Here
 * it updates synchronously with every write. That keeps tests deterministic
 * but means this harness cannot reproduce cache-lag races — those need a
 * real Obsidian (see the Tier 3 notes in tests/README.md).
 */

import { parse as parseYamlImpl, stringify as stringifyYamlImpl } from "yaml";

export function normalizePath(path) {
	return String(path)
		.replace(/\\/g, "/")
		.replace(/\/+/g, "/")
		.replace(/^\/|\/$/g, "");
}

export function parseYaml(text) {
	return parseYamlImpl(text);
}

export function stringifyYaml(value) {
	return stringifyYamlImpl(value);
}

export class Notice {
	constructor(message) {
		this.message = message;
		Notice.all.push(message);
	}
}
Notice.all = [];

export class TAbstractFile {
	constructor(path) {
		this.path = path;
		this.name = path.split("/").pop() ?? path;
	}
}

export class TFile extends TAbstractFile {
	constructor(path) {
		super(path);
		const dot = this.name.lastIndexOf(".");
		this.basename = dot > 0 ? this.name.slice(0, dot) : this.name;
		this.extension = dot > 0 ? this.name.slice(dot + 1) : "";
		this.stat = { ctime: 0, mtime: 0, size: 0 };
	}
}

export class TFolder extends TAbstractFile {
	constructor(path) {
		super(path);
		this.children = [];
	}
}

/** Split a note into its frontmatter block and everything after it. */
function splitNote(content) {
	if (!content.startsWith("---\n")) {
		return { frontmatter: null, body: content };
	}
	const end = content.indexOf("\n---", 3);
	if (end === -1) return { frontmatter: null, body: content };
	const afterFence = content.indexOf("\n", end + 1);
	return {
		frontmatter: content.slice(4, end),
		body: afterFence === -1 ? "" : content.slice(afterFence + 1),
	};
}

export class FakeVault {
	constructor() {
		/** path -> string contents */
		this.contents = new Map();
		/** path -> TFile | TFolder */
		this.nodes = new Map();
		this.handlers = new Map();
		/** Every write, in order — lets a test assert how many times a save
		 * actually hit disk, which is how write-amplification bugs surface. */
		this.writeLog = [];
	}

	// --- events ---
	on(name, cb) {
		if (!this.handlers.has(name)) this.handlers.set(name, []);
		this.handlers.get(name).push(cb);
		return { name, cb };
	}
	offref() {}
	trigger(name, ...args) {
		for (const cb of this.handlers.get(name) ?? []) cb(...args);
	}

	// --- lookups ---
	getAbstractFileByPath(path) {
		return this.nodes.get(normalizePath(path)) ?? null;
	}
	getFileByPath(path) {
		const node = this.getAbstractFileByPath(path);
		return node instanceof TFile ? node : null;
	}
	getFolderByPath(path) {
		const node = this.getAbstractFileByPath(path);
		return node instanceof TFolder ? node : null;
	}
	getAllLoadedFiles() {
		return [...this.nodes.values()];
	}
	getMarkdownFiles() {
		return [...this.nodes.values()].filter(
			(n) => n instanceof TFile && n.extension === "md"
		);
	}

	// --- mutation ---
	async createFolder(path) {
		const normalized = normalizePath(path);
		// Parents first, so folder.children stays walkable like the real API
		const parts = normalized.split("/");
		let soFar = "";
		for (const part of parts) {
			soFar = soFar ? `${soFar}/${part}` : part;
			if (!this.nodes.has(soFar)) {
				const folder = new TFolder(soFar);
				this.nodes.set(soFar, folder);
				this.#linkToParent(folder);
			}
		}
		return this.nodes.get(normalized);
	}

	async create(path, content) {
		const normalized = normalizePath(path);
		if (this.nodes.has(normalized)) {
			throw new Error(`File already exists: ${normalized}`);
		}
		const parent = normalized.split("/").slice(0, -1).join("/");
		if (parent && !this.nodes.has(parent)) await this.createFolder(parent);
		const file = new TFile(normalized);
		this.nodes.set(normalized, file);
		this.contents.set(normalized, content);
		this.#linkToParent(file);
		this.writeLog.push({ op: "create", path: normalized });
		this.trigger("create", file);
		return file;
	}

	async read(file) {
		const content = this.contents.get(file.path);
		if (content === undefined) throw new Error(`Not found: ${file.path}`);
		return content;
	}

	/** Same contents as read() — the real one is cached, which callers must
	 * not depend on for correctness. */
	async cachedRead(file) {
		return this.read(file);
	}

	async modify(file, content) {
		this.contents.set(file.path, content);
		this.writeLog.push({ op: "modify", path: file.path });
		this.trigger("modify", file);
	}

	async process(file, fn) {
		const next = fn(this.contents.get(file.path) ?? "");
		await this.modify(file, next);
		return next;
	}

	async delete(file) {
		this.nodes.delete(file.path);
		this.contents.delete(file.path);
		this.writeLog.push({ op: "delete", path: file.path });
		this.trigger("delete", file);
	}

	#linkToParent(node) {
		const parentPath = node.path.split("/").slice(0, -1).join("/");
		const parent = parentPath ? this.nodes.get(parentPath) : null;
		if (parent instanceof TFolder && !parent.children.includes(node)) {
			parent.children.push(node);
			node.parent = parent;
		}
	}
}

export class FakeMetadataCache {
	constructor(vault) {
		this.vault = vault;
		this.handlers = new Map();
	}

	on(name, cb) {
		if (!this.handlers.has(name)) this.handlers.set(name, []);
		this.handlers.get(name).push(cb);
		return { name, cb };
	}
	offref() {}

	/** Parsed straight from current contents — no staleness, by design. */
	getFileCache(file) {
		const content = this.vault.contents.get(file?.path);
		if (content === undefined) return null;
		const { frontmatter } = splitNote(content);
		if (frontmatter === null) return {};
		try {
			const parsed = parseYaml(frontmatter);
			return parsed && typeof parsed === "object"
				? { frontmatter: parsed }
				: {};
		} catch {
			return {};
		}
	}

	getCache(path) {
		const file = this.vault.getAbstractFileByPath(path);
		return file ? this.getFileCache(file) : null;
	}

	/** Resolves a wikilink target by basename, which is all the plugin uses
	 * it for (plan members -> person files). */
	getFirstLinkpathDest(linkpath, _from) {
		const target = String(linkpath).split("/").pop();
		for (const node of this.vault.nodes.values()) {
			if (node instanceof TFile && node.basename === target) return node;
		}
		return null;
	}
}

export class FakeFileManager {
	constructor(vault) {
		this.vault = vault;
		this.trashed = [];
	}

	/**
	 * Faithful to the real contract, including the sharp edge that bit us:
	 * the callback receives a plain object, and *removing* a key requires
	 * `delete` — assigning over the object cannot express a removal.
	 */
	async processFrontMatter(file, fn) {
		const content = this.vault.contents.get(file.path) ?? "";
		const { frontmatter, body } = splitNote(content);
		let data = {};
		if (frontmatter !== null) {
			try {
				const parsed = parseYaml(frontmatter);
				if (parsed && typeof parsed === "object") data = parsed;
			} catch {
				data = {};
			}
		}
		fn(data);
		const yaml = Object.keys(data).length > 0 ? stringifyYaml(data) : "";
		const next = yaml ? `---\n${yaml.replace(/\n$/, "")}\n---\n${body}` : body;
		await this.vault.modify(file, next);
	}

	async trashFile(file) {
		this.trashed.push(file.path);
		await this.vault.delete(file);
	}

	async renameFile(file, newPath) {
		const normalized = normalizePath(newPath);
		const content = this.vault.contents.get(file.path);
		await this.vault.delete(file);
		await this.vault.create(normalized, content ?? "");
	}
}

export class FakeApp {
	constructor() {
		this.vault = new FakeVault();
		this.metadataCache = new FakeMetadataCache(this.vault);
		this.fileManager = new FakeFileManager(this.vault);
		this.workspace = {
			getLeavesOfType: () => [],
			getActiveFile: () => null,
			onLayoutReady: (cb) => cb(),
			trigger: () => {},
			on: () => ({}),
		};
	}
}

// --- API surface the plugin imports but tests never exercise ---
export class Plugin {}
export class Modal {}
export class ItemView {}
export class PluginSettingTab {}
export class Setting {}
export class AbstractInputSuggest {}
export class SuggestModal {}
export class FuzzySuggestModal {}
export class Component {}
export class MarkdownRenderer {
	static async render() {}
}
export const Platform = { isMobile: false, isDesktop: true };
export function setIcon() {}
export function requireApiVersion() {
	return true;
}
export function debounce(fn) {
	return fn;
}
