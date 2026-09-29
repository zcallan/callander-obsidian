import { Component, MarkdownRenderer } from "obsidian";
import { NotesSection } from "@/ui/sections/NotesSection";
import {
	NativeNotesSection,
	NotesChooser,
} from "@/ui/sections/NativeNotesSection";
import { mountEmbeddedEditor } from "@/components/embeddedMarkdownEditor";
import { normalizeNotes } from "@/utils/notesMarkdown";
import type { PageContext } from "@/views/ContactPageView/context";
import type { ContactPageModel } from "@/views/ContactPageView/model";
import { saveModel, writeNotes } from "@/views/ContactPageView/persistence";
import { followRenderedLink } from "@/views/ContactPageView/sections/links";

/** The notes box saves this long after the last keystroke. */
const NOTES_AUTOSAVE_MS = 800;

/**
 * The Notes section — the same island on every kind of page, in Obsidian's
 * own editor when the experimental setting is on, with the standard section
 * standing by in case that editor can't start — and the edit it's holding.
 */
export class NotesController {
	/**
	 * Notes typed in the native editor and not yet written. It writes as you
	 * go rather than on leaving, so the edit waits here for a pause in the
	 * typing. It keeps the model it was typed into: the page can move on to
	 * another note before the timer fires, and the text belongs to the one
	 * it was typed in.
	 */
	private draft: {
		model: ContactPageModel;
		text: string;
		timer: number;
	} | null = null;
	/**
	 * The model whose notes the standard section last drew. It saves when
	 * it loses focus, and moving to another note can be what takes the
	 * focus (the page redraws, and the island is re-attached) — by then the
	 * page's current model is the next note, so the text is saved against
	 * the one it was showing instead.
	 */
	private shown: ContactPageModel | null = null;

	constructor(private readonly ctx: PageContext) {}

	/** Reads differently for plans, groups and friends. */
	private placeholder(): string {
		const kind = this.ctx.model.kind;
		if (kind === "plan") {
			return "Anything else about the plan — booking details, addresses, who's driving...";
		}
		if (kind === "group") {
			return "Notes about this group — running jokes, how you all met, anything worth remembering...";
		}
		return "Add notes about anything here that you want to remember...";
	}

	/** Write `text` as `model`'s notes, if it changed them. */
	private async save(model: ContactPageModel, text: string): Promise<void> {
		if (!model.file) return;
		if (normalizeNotes(text) === (model.bodyNotes ?? "")) return;
		await writeNotes(this.ctx, model, text);
		// The body write leaves frontmatter alone, so the last-updated stamp
		// has to be set on its own. That save also bumps the store, which is
		// what redraws the preview — no render() needed.
		await saveModel(this.ctx, model);
	}

	/**
	 * Notes rendered the way Obsidian renders a note, into a box of their
	 * own that the returned function takes away again.
	 *
	 * A fresh box and component per render, rather than rendering into the
	 * same element: rendering is async, so a slow one finishing after a
	 * newer one started would otherwise add its output beside it. Here a
	 * late finisher writes into a box that's already gone. The component is
	 * what other plugins' post-processors hang their own work from, so it
	 * has to be unloaded with the render or it outlives it.
	 */
	private renderMarkdown(text: string, el: HTMLElement): () => void {
		const { app } = this.ctx;
		const sourcePath = this.ctx.model.file?.path ?? "";
		const child = new Component();
		child.load();
		const box = el.createDiv({
			cls: "markdown-rendered contact-notes-rendered",
		});
		void MarkdownRenderer.render(app, text, box, sourcePath, child);
		const onClick = (event: MouseEvent) =>
			followRenderedLink(app, event, box, sourcePath);
		box.addEventListener("click", onClick);
		return () => {
			box.removeEventListener("click", onClick);
			box.remove();
			child.unload();
		};
	}

	/** Hold a native-editor edit for a pause in the typing. See `draft`. */
	private queue(text: string) {
		const model = this.ctx.model;
		if (!model.file) return;
		const pending = this.draft;
		if (pending && pending.model !== model) void this.flush();
		else if (pending) window.clearTimeout(pending.timer);
		this.draft = {
			model,
			text,
			timer: window.setTimeout(
				() => void this.flush(),
				NOTES_AUTOSAVE_MS
			),
		};
	}

	/** Write the held native-editor edit now, to the note it was typed in. */
	async flush(): Promise<void> {
		const draft = this.draft;
		if (!draft) return;
		window.clearTimeout(draft.timer);
		this.draft = null;
		await this.save(draft.model, draft.text);
	}

	/** The section's island. */
	island(): HTMLElement {
		const ctx = this.ctx;
		const openEditor = () =>
			ctx.plugin.openPathAsMarkdown(ctx.model.file?.path ?? "");
		const plain = (
			<NotesSection
				store={ctx.store}
				value={() => {
					this.shown = ctx.model;
					return ctx.model.bodyNotes ?? "";
				}}
				placeholder={() => this.placeholder()}
				onSave={(text) => this.save(this.shown ?? ctx.model, text)}
				renderMarkdown={(text, el) => this.renderMarkdown(text, el)}
				onOpenEditor={openEditor}
			/>
		);
		return ctx.island(
			"notes",
			<NotesChooser
				store={ctx.store}
				native={() => ctx.plugin.settings.nativeNotesEditor}
				plainSection={plain}
				nativeSection={
					<NativeNotesSection
						store={ctx.store}
						value={() => ctx.model.bodyNotes ?? ""}
						placeholder={() => this.placeholder()}
						mount={(host, initial, events) =>
							mountEmbeddedEditor(ctx.app, host, {
								value: initial,
								file: () => ctx.model.file,
								...events,
							})
						}
						onChange={(text) => this.queue(text)}
						onFlush={() => this.flush()}
						onOpenEditor={openEditor}
						fallback={plain}
					/>
				}
			/>
		);
	}
}
