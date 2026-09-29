import { Component, MarkdownRenderer, type TFile } from "obsidian";
import { splitFrontmatter } from "@/utils/quotesMarkdown";
import type { PageContext } from "@/views/ContactPageView/context";
import { followRenderedLink } from "@/views/ContactPageView/sections/links";

/**
 * The Markdown accordion: the note's body as Obsidian renders it, with
 * Edit markdown beside it.
 *
 * The content is drawn only once the accordion is open — it's collapsed by
 * default, and reading a whole note and rendering it into a hidden box on
 * every redraw was work nobody saw. It renders into a component of its
 * own, unloaded when the page next redraws or closes: rendered against the
 * view itself, every post-processor child it ever made stayed alive until
 * the view closed.
 *
 * @param wrap The section wrap — the Edit button hangs off this, so it
 * stays visible while the section is collapsed.
 * @param body The collapsible area holding the rendered markdown.
 * @returns What draws the content; call it when the accordion opens.
 */
export function renderExtrasSection(
	ctx: PageContext,
	wrap: HTMLElement,
	body: HTMLElement
): () => void {
	const extrasSection = body.createDiv({
		cls: "contact-extras-section",
	});

	const file = ctx.model.file;
	if (!file) return () => {};

	// Outside the accordion body, so it's reachable without expanding.
	// It no longer sits inside .contact-extras-section, so it brings its
	// own gutters rather than inheriting that section's padding.
	const footer = wrap.createDiv({
		cls: "contact-section-footer contact-extras-footer",
	});
	const editButton = footer.createEl("button", {
		cls: "callander-button",
		text: "Edit markdown",
	});
	editButton.addEventListener("click", () => {
		// Bypass the contact-view intercept — here we WANT raw markdown
		ctx.plugin.openPathAsMarkdown(file.path);
	});

	let drawn = false;
	return () => {
		if (drawn) return;
		drawn = true;
		const child = new Component();
		child.load();
		ctx.disposeOnRedraw(() => child.unload());
		void drawExtras(ctx, file, extrasSection, child);
	};
}

async function drawExtras(
	ctx: PageContext,
	file: TFile,
	section: HTMLElement,
	child: Component
): Promise<void> {
	const { app } = ctx;
	const path = file.path;
	const headerContainer = section.createDiv({
		cls: "contact-extras-header",
	});
	try {
		const extrasContent = splitFrontmatter(
			await app.vault.cachedRead(file)
		).body;

		// Add helper text if no markdown content
		if (!extrasContent.trim()) {
			headerContainer.createDiv({
				cls: "section-helper-text",
				text: "Add formatted text, links, and other Markdown content",
			});
			return;
		}

		const contentDiv = section.createDiv({
			cls: "contact-extras-content",
		});
		await MarkdownRenderer.render(
			app,
			extrasContent,
			contentDiv,
			path,
			child
		);
		contentDiv.addEventListener("click", (event) =>
			followRenderedLink(app, event, contentDiv, path)
		);
	} catch (error) {
		console.error(`Error reading extras from file ${path}:`, error);
	}
}
