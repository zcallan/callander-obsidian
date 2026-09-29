import { createSuite } from "./harness.mjs";
import {
	activatable,
	FocusKeeper,
	keepingFocus,
	makeActivatable,
	makeDisclosure,
	setFocusKey,
} from "./.build/callander.mjs";

/**
 * Keyboard access for clickable rows, cells and headers that aren't
 * <button>s: which keys run them, what they're announced as, and focus
 * coming back to them after the page redraws. Duck-typed elements, the way
 * the helpers read them.
 */
export function run() {
	const { eq, result } = createSuite("activatable");

	// A document of elements, with the one focused and those findable by key.
	const doc = { activeElement: null, all: [] };
	doc.body = { querySelectorAll: () => doc.all.filter((e) => e.isConnected && "focusKey" in e.dataset) };
	const element = () => {
		const listeners = {};
		const el = {
			classes: new Set(), attrs: {}, dataset: {}, tabIndex: -1, ownerDocument: doc, isConnected: true,
			addClass(c) { this.classes.add(c); },
			hasClass(c) { return this.classes.has(c); },
			toggleClass(c, on) { if (on) this.classes.add(c); else this.classes.delete(c); },
			setAttribute(k, v) { this.attrs[k] = v; },
			addEventListener(type, cb) { (listeners[type] ??= []).push(cb); },
			fire(type, e = {}) {
				// The same object, so what a handler does to it can be read after.
				if (!("target" in e)) e.target = el;
				e.currentTarget = el;
				for (const cb of listeners[type] ?? []) cb(e);
			},
			closest: () => null,
			focus(opts) { doc.activeElement = el; el.focusedWith = opts; },
		};
		doc.all.push(el);
		return el;
	};
	const key = (k, extra = {}) => ({ key: k, repeat: false, preventDefault() { this.prevented = true; }, ...extra });

	// ---------- makeActivatable ----------
	{
		const row = element();
		let runs = 0;
		makeActivatable(row, () => runs++, { label: "Open Ann", focusKey: "friend:Ann" });
		eq(
			"announced as a button, in the Tab order, ringed, labelled, keyed",
			[row.attrs.role, row.tabIndex, row.classes.has("callander-activatable"), row.attrs["aria-label"], row.dataset.focusKey],
			["button", 0, true, "Open Ann", "friend:Ann"]
		);
		row.fire("click");
		const enter = key("Enter");
		row.fire("keydown", enter);
		const space = key(" ");
		row.fire("keydown", space);
		eq("a click, Enter and Space each run it once", runs, 3);
		eq("…with the keys' defaults held back (Space would scroll)", [enter.prevented, space.prevented], [true, true]);
		row.fire("keydown", key("a"));
		row.fire("keydown", key("Enter", { repeat: true }));
		row.fire("keydown", key("Enter", { target: {} }));
		eq("not another key, a held one, or one meant for a control inside it", runs, 3);
	}
	{
		const link = element();
		makeActivatable(link, () => {}, { role: "link" });
		eq("a link when it goes somewhere", link.attrs.role, "link");
	}
	{
		// A row's title, when the row holds buttons of its own.
		const title = element();
		let runs = 0;
		makeActivatable(title, () => runs++, { keysOnly: true });
		title.fire("click");
		eq("keys only: the row keeps the click", runs, 0);
		title.fire("keydown", key("Enter"));
		eq("…and Enter still runs it", runs, 1);
	}

	// ---------- focus after a redraw ----------
	{
		// Activating it redraws the page, replacing it with a successor.
		const header = element();
		let successor = null;
		makeActivatable(header, () => {
			header.isConnected = false;
			successor = element();
			setFocusKey(successor, "diary:note");
		}, { focusKey: "diary:note" });
		header.focus();
		header.fire("keydown", key("Enter"));
		eq("focus follows its key to the redrawn element, without scrolling", [doc.activeElement === successor, successor.focusedWith], [true, { preventScroll: true }]);
	}
	{
		const button = element();
		setFocusKey(button, "nav:Next");
		doc.activeElement = null;
		let next = null;
		keepingFocus(button, () => {
			button.isConnected = false;
			next = element();
			setFocusKey(next, "nav:Next");
		});
		eq("not taken if it didn't have focus", doc.activeElement === null, true);
		// Another with the same key ahead of it: a refocus would land there.
		const other = element();
		setFocusKey(other, "nav:Prev");
		const still = element();
		setFocusKey(still, "nav:Prev");
		still.focus();
		keepingFocus(still, () => {});
		eq("nor moved when the element survived", doc.activeElement === still, true);
	}
	{
		// A redraw from elsewhere — a sync, a setting saved.
		const keeper = new FocusKeeper();
		const container = { ownerDocument: doc, contains: (el) => el.inPage === true, querySelectorAll: () => doc.all.filter((e) => e.isConnected && e.inPage) };
		doc.all.length = 0;
		const row = element();
		row.inPage = true;
		setFocusKey(row, "row:a");
		row.focus();
		keeper.hold(container);
		row.isConnected = false;
		const redrawn = element();
		redrawn.inPage = true;
		setFocusKey(redrawn, "row:a");
		keeper.restore(container);
		eq("the page's keeper gives focus back to the same row", doc.activeElement === redrawn, true);

		// Held once, restored once: a second restore finds nothing to do.
		const elsewhere = element();
		elsewhere.focus();
		keeper.restore(container);
		eq("…and a hold is spent by one restore", doc.activeElement === elsewhere, true);

		// Focus in another page's element with the same key.
		const outside = element();
		setFocusKey(outside, "row:a");
		outside.focus();
		keeper.hold(container);
		keeper.restore(container);
		eq("…but not when focus was outside the page", doc.activeElement === outside, true);
	}

	// ---------- makeDisclosure ----------
	{
		const header = element();
		const wrap = element();
		makeDisclosure(header, wrap, () => wrap.toggleClass("is-open", !wrap.hasClass("is-open")), "section:a");
		const before = header.attrs["aria-expanded"];
		header.fire("keydown", key("Enter"));
		eq("a disclosure says whether it's open, before and after", [before, header.attrs["aria-expanded"], header.dataset.focusKey], ["false", "true", "section:a"]);
	}

	// ---------- activatable(), for JSX ----------
	{
		let runs = 0;
		const props = activatable(() => runs++, "row is-done", { label: "Open", focusKey: "goal:1" });
		eq(
			"props: a button in the Tab order, the ring's class first",
			[props.role, props.tabIndex, props.className, props["aria-label"], props["data-focus-key"], typeof props.onClick],
			["button", 0, "callander-activatable row is-done", "Open", "goal:1", "function"]
		);
		const self = {};
		props.onKeyDown(key("Enter", { target: self, currentTarget: self }));
		props.onKeyDown(key("Tab", { target: self, currentTarget: self }));
		eq("…and Enter runs it from the keys handler", runs, 1);
		const titleProps = activatable(() => {}, "", { keysOnly: true });
		eq("keys only has no click, and no class but the ring's", [typeof titleProps.onClick, titleProps.className], ["undefined", "callander-activatable"]);
	}
	return result();
}
