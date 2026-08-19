import type { Expense, Credit } from "@/types";
import { asArray, fieldOf, isRecord, toText } from "@/utils/fm";

/**
 * Reading and dividing shared expenses. Pure functions over frontmatter and
 * plain objects — no file I/O, no Obsidian app, nothing that knows where the
 * expense came from. Whoever calls in supplies the participant list, so the
 * same maths serves a trip's members and a one-off split alike.
 */

/** How an expense is divided, for display: "By receipt", "Split evenly"… */
export function splitModeLabel(
	mode: "even" | "shares" | "percent" | "value" | "receipt"
): string {
	switch (mode) {
		case "percent":
			return "By percent";
		case "shares":
			return "By shares";
		case "value":
			return "By value";
		case "receipt":
			return "By receipt";
		default:
			return "Split evenly";
	}
}

export function expensesOf(metadata: unknown, key = "costs"): Expense[] {
	return asArray(fieldOf(metadata, key))
		.map((c): Expense => {
			const label = fieldOf(c, "label");
			const split = fieldOf(c, "split");
			const mode = fieldOf(split, "mode");
			const shares = fieldOf(split, "shares");
			const people = fieldOf(c, "people");
			const paid = fieldOf(c, "paid");
			return {
				label: typeof label === "string" ? label : "",
				amount: Number(fieldOf(c, "amount")) || 0,
				...(fieldOf(c, "settled") === true && { settled: true }),
				...(people !== undefined && {
					people: asArray(people).map(String),
				}),
				// Kept even when empty — see the `paid` doc on Expense, an
				// empty list means something different from no list.
				...(paid !== undefined && {
					paid: asArray(paid).map(String),
				}),
				split: {
					mode:
						mode === "shares" ||
						mode === "percent" ||
						mode === "value" ||
						mode === "receipt"
							? mode
							: "even",
					...(isRecord(shares) && {
						shares: shares as Record<string, number>,
					}),
					...(isRecord(fieldOf(split, "exprs")) && {
						exprs: fieldOf(split, "exprs") as Record<
							string,
							string
						>,
					}),
					...(typeof fieldOf(split, "tax") === "number" && {
						tax: fieldOf(split, "tax") as number,
					}),
					...(typeof fieldOf(split, "tip") === "number" && {
						tip: fieldOf(split, "tip") as number,
					}),
				},
			};
		})
		.filter((c) => c.label.length > 0);
}

/**
 * What a typed percentage field means.
 *
 * An empty field is 0%, not "nothing entered" — you have to be able to
 * backspace a figure away, and a field that refuses to stay empty can't be
 * cleared at all. Null for anything that isn't a usable percentage, which
 * the caller leaves alone rather than guessing at.
 */
export function percentFromInput(raw: string): number | null {
	const text = raw.trim();
	if (text === "") return 0;
	const value = Number(text);
	if (!Number.isFinite(value) || value < 0) return null;
	return value;
}

/**
 * The people who can be ticked off on an expense: everyone the split
 * actually charges. Someone named on it but charged nothing has nothing to
 * square up, so there's no box for them.
 */
export function payersOf(cost: Expense, participants: string[]): string[] {
	const owed = owedFor(cost, participants);
	return participants.filter((p) => (owed[p] ?? 0) > 0);
}

/**
 * Which boxes to show ticked, resolving the two cases where the expense
 * doesn't say outright:
 *
 * - nothing recorded and already settled — everything predating per-person
 *   ticks, so all of it counts as paid
 * - nothing recorded at all — you start ticked, since you're the one who
 *   put the money down
 *
 * An explicit empty list is left alone: that's "marked unsettled", which is
 * a decision, not an absence of one.
 */
export function paidStateOf(
	cost: Expense,
	payers: string[],
	yourName = ""
): string[] {
	if (cost.paid) return cost.paid.filter((p) => payers.includes(p));
	if (cost.settled) return [...payers];
	const you = yourName.trim();
	const mine = payers.find((p) => p.toLowerCase() === you.toLowerCase());
	return mine ? [mine] : [];
}

/**
 * Whether one person is square on one expense — their own tick, or the
 * whole expense being settled.
 *
 * This is what keeps "who owes what" honest while an expense is still
 * open: tick Riley and Riley's share stops counting, while Harry's keeps
 * showing until his box goes too.
 */
export function isPaidBy(cost: Expense, person: string): boolean {
	if (cost.settled) return true;
	return cost.paid?.includes(person) ?? false;
}

/**
 * Whether everyone's square — what `settled` is derived from when a box is
 * ticked. An expense that charges nobody can't settle itself into being
 * done; that stays the button's call.
 */
export function isFullyPaid(paid: string[], payers: string[]): boolean {
	if (payers.length === 0) return false;
	return payers.every((p) => paid.includes(p));
}

/**
 * Split a list into what's still owed and what's been squared up, keeping
 * each entry's index in the original list. The index is what every edit,
 * delete and settle writes back through, so it has to survive the split.
 */
export function partitionExpenses(list: Expense[]): {
	open: Array<{ expense: Expense; index: number }>;
	settled: Array<{ expense: Expense; index: number }>;
} {
	const open: Array<{ expense: Expense; index: number }> = [];
	const settled: Array<{ expense: Expense; index: number }> = [];
	list.forEach((expense, index) => {
		(expense.settled ? settled : open).push({ expense, index });
	});
	return { open, settled };
}

/** Credits (money already handed over), deducted from what a person owes. */
export function creditsOf(metadata: unknown): Credit[] {
	return asArray(fieldOf(metadata, "credits"))
		.map((c): Credit => {
			const note = fieldOf(c, "note");
			return {
				person: toText(fieldOf(c, "person")),
				amount: Number(fieldOf(c, "amount")) || 0,
				...(note ? { note: toText(note) } : {}),
			};
		})
		.filter((c) => c.person.length > 0 && c.amount > 0);
}

/** Total a person has already been credited. */
export function creditTotalFor(person: string, credits: Credit[]): number {
	return credits
		.filter((c) => c.person === person)
		.reduce((s, c) => s + c.amount, 0);
}

/**
 * Resolve who owes what for one expense. Participants are supplied by the
 * caller — a trip's members plus your name, or the people named on a one-off
 * expense; shares default to 1 (even) when unset.
 */
export function owedFor(
	cost: Expense,
	participants: string[]
): Record<string, number> {
	const result: Record<string, number> = {};
	if (participants.length === 0) return result;
	const shares = cost.split.shares ?? {};
	if (cost.split.mode === "shares") {
		const total = participants.reduce((sum, p) => sum + (shares[p] ?? 0), 0);
		if (total <= 0) return result;
		for (const p of participants) {
			result[p] = (cost.amount * (shares[p] ?? 0)) / total;
		}
	} else if (cost.split.mode === "receipt") {
		// Each person's own line off the receipt, with tax and tip added on
		// top in the same proportion. Both are charged against the subtotal —
		// the tip isn't taxed, and the tax isn't tipped.
		const uplift =
			1 + ((cost.split.tax ?? 0) + (cost.split.tip ?? 0)) / 100;
		for (const p of participants) {
			result[p] = (shares[p] ?? 0) * uplift;
		}
	} else if (cost.split.mode === "value") {
		// Exact dollar amounts, taken at face value — a split that doesn't
		// add up to the total is intentional and visible, the same way
		// percent mode leaves it to the modal's live total to keep honest.
		for (const p of participants) {
			result[p] = shares[p] ?? 0;
		}
	} else if (cost.split.mode === "percent") {
		// Literal percentages — under/over 100% is intentional and visible;
		// the modal's live total keeps it honest
		for (const p of participants) {
			result[p] = (cost.amount * (shares[p] ?? 0)) / 100;
		}
	} else {
		// Even split — among the included set if given, else everyone
		const included =
			Object.keys(shares).length > 0
				? participants.filter((p) => shares[p])
				: participants;
		if (included.length === 0) return result;
		const each = cost.amount / included.length;
		for (const p of included) result[p] = each;
	}
	return result;
}

/**
 * How one person's total splits across each expense they're part of: label,
 * a human "how" descriptor (e.g. "2 shares", "25%", "even"), and the amount
 * they owe for that item. Settled lines stay in the list — they're the
 * record of what was squared up — flagged so the caller can show them as
 * done and leave them out of the total.
 *
 * "Settled" here is per person, not per expense: an expense still open on
 * the whole can already be square for this one, if their box is ticked.
 */
export function breakdownFor(
	person: string,
	costs: Expense[],
	participants: string[],
	credits: Credit[] = []
): Array<{
	label: string;
	descriptor: string;
	amount: number;
	settled?: boolean;
}> {
	const rows: Array<{
		label: string;
		descriptor: string;
		amount: number;
		settled?: boolean;
	}> = [];
	for (const cost of costs) {
		const amount = owedFor(cost, participants)[person];
		if (!amount || amount <= 0) continue;
		const shares = cost.split.shares ?? {};
		// Shares and percent show the person's own number — more useful than
		// the mode name. Everything else reuses the same wording the expense
		// row and view modal already use for that mode.
		let descriptor: string;
		if (cost.split.mode === "shares") {
			const w = shares[person] ?? 1;
			descriptor = `${w} ${w === 1 ? "share" : "shares"}`;
		} else if (cost.split.mode === "percent") {
			descriptor = `${shares[person] ?? 0}%`;
		} else {
			descriptor = splitModeLabel(cost.split.mode).toLowerCase();
		}
		rows.push({
			label: cost.label,
			descriptor,
			amount,
			...(isPaidBy(cost, person) && { settled: true }),
		});
	}
	// Credits come off as negative lines
	for (const c of credits.filter((c) => c.person === person)) {
		rows.push({
			label: "Credit",
			descriptor: c.note || "already paid",
			amount: -c.amount,
		});
	}
	return rows;
}

/** One person's line in "Who owes what". */
export interface OwedRow {
	person: string;
	/** Owed across every unsettled expense, less any credits handed over. */
	net: number;
	/** You can't owe yourself — your row is read-only. */
	isYou: boolean;
	/** Owing nothing *is* settled, whether or not anyone ticked a box. */
	square: boolean;
	/** Ticked off, or square — both render as done. */
	done: boolean;
}

/**
 * "Who owes what", net of credits.
 *
 * A settled expense drops out entirely, and so does anyone already ticked
 * off on a specific expense — they've handed their share over even though
 * the expense as a whole is still waiting on someone else.
 *
 * `square` rounds the way the row displays, so someone showing "$0.00"
 * counts as settled even when a float has left a fraction of a cent behind.
 * The outstanding total counts only people who are neither you nor ticked
 * off, since those are the ones there's anything left to chase.
 */
export function planOwedSummary(
	costs: Expense[],
	credits: Credit[],
	participants: string[],
	yourName: string,
	paid: string[]
): { rows: OwedRow[]; outstanding: number } {
	const isYou = (p: string) =>
		!!yourName && p.toLowerCase() === yourName.toLowerCase();

	const owedTotals: Record<string, number> = {};
	for (const cost of costs) {
		if (cost.settled) continue;
		const owed = owedFor(cost, participants);
		for (const p of participants) {
			if (isPaidBy(cost, p)) continue;
			owedTotals[p] = (owedTotals[p] ?? 0) + (owed[p] ?? 0);
		}
	}

	const rows = participants.map((person): OwedRow => {
		const net = (owedTotals[person] ?? 0) - creditTotalFor(person, credits);
		const square = Math.abs(net) < 0.005;
		return {
			person,
			net,
			isYou: isYou(person),
			square,
			done: square || paid.includes(person),
		};
	});

	const done = new Set(paid);
	const outstanding = rows
		.filter((r) => !r.isYou && !done.has(r.person))
		.reduce((sum, r) => sum + r.net, 0);

	// Still to chase leads; whoever's square folds away behind its own
	// accordion, still there to check.
	return {
		rows: [...rows.filter((r) => !r.square), ...rows.filter((r) => r.square)],
		outstanding,
	};
}
