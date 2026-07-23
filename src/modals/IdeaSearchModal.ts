import { App, FuzzySuggestModal } from "obsidian";
import type { ContactWithCountdown, Idea } from "@/types";
import { IDEA_CATEGORIES } from "@/constants";

interface IdeaHit {
	contact: ContactWithCountdown;
	idea: Idea;
}

/**
 * "Where did I write that mug idea?" — fuzzy search across every idea,
 * jump to the friend it belongs to.
 */
export class IdeaSearchModal extends FuzzySuggestModal<IdeaHit> {
	private hits: IdeaHit[];

	constructor(
		app: App,
		contacts: ContactWithCountdown[],
		private onChoose: (hit: IdeaHit) => void
	) {
		super(app);
		this.setPlaceholder("Search all ideas…");
		this.hits = contacts.flatMap((contact) =>
			contact.ideas.map((idea) => ({ contact, idea }))
		);
	}

	getItems(): IdeaHit[] {
		return this.hits;
	}

	getItemText(hit: IdeaHit): string {
		const cat = IDEA_CATEGORIES.find((c) => c.id === hit.idea.category);
		return `${cat?.emoji ?? "✨"} ${hit.idea.text} — ${
			hit.contact.displayName
		}${hit.idea.done ? " (done)" : ""}`;
	}

	onChooseItem(hit: IdeaHit): void {
		this.onChoose(hit);
	}
}
