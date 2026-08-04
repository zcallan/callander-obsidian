/**
 * A tiny arithmetic evaluator for amount fields — so "7+7" can stand in
 * for 14 when you're copying a receipt line by line.
 *
 * Hand-written on purpose. `eval` and `new Function` would run whatever
 * text the field contains as JavaScript; a cost input has no business
 * being able to do that, so this only ever recognises numbers, the four
 * operators, and parentheses. Anything else fails to parse.
 *
 * Returns null when the text isn't a complete, valid expression — which
 * includes the empty string and half-typed input like "7+", so a caller
 * can simply not count it yet.
 */

type Token =
	| { type: "num"; value: number }
	| { type: "op"; value: string };

const OPERATORS = "+-*/()";

function tokenize(src: string): Token[] | null {
	const tokens: Token[] = [];
	let i = 0;
	while (i < src.length) {
		const ch = src[i];
		if (ch === " " || ch === "\t") {
			i++;
			continue;
		}
		if (OPERATORS.includes(ch)) {
			tokens.push({ type: "op", value: ch });
			i++;
			continue;
		}
		if ((ch >= "0" && ch <= "9") || ch === ".") {
			let j = i;
			let dots = 0;
			while (j < src.length) {
				const c = src[j];
				if (c >= "0" && c <= "9") {
					j++;
				} else if (c === ".") {
					dots++;
					j++;
				} else {
					break;
				}
			}
			// "1.2.3" is a typo, not a number
			if (dots > 1) return null;
			const value = Number(src.slice(i, j));
			if (!Number.isFinite(value)) return null;
			tokens.push({ type: "num", value });
			i = j;
			continue;
		}
		// Letters, symbols, anything else — not arithmetic
		return null;
	}
	return tokens;
}

export function evaluateAmount(input: string): number | null {
	const src = input.trim();
	if (!src) return null;

	const tokens = tokenize(src);
	if (!tokens || tokens.length === 0) return null;

	let pos = 0;
	const peek = (): Token | undefined => tokens[pos];
	const isOp = (value: string): boolean => {
		const t = peek();
		return !!t && t.type === "op" && t.value === value;
	};

	// factor := number | "(" expr ")" | ("+" | "-") factor
	const parseFactor = (): number | null => {
		if (isOp("-")) {
			pos++;
			const v = parseFactor();
			return v === null ? null : -v;
		}
		if (isOp("+")) {
			pos++;
			return parseFactor();
		}
		if (isOp("(")) {
			pos++;
			const v = parseExpr();
			if (v === null || !isOp(")")) return null;
			pos++;
			return v;
		}
		const t = peek();
		if (!t || t.type !== "num") return null;
		pos++;
		return t.value;
	};

	// term := factor (("*" | "/") factor)*
	const parseTerm = (): number | null => {
		let left = parseFactor();
		if (left === null) return null;
		while (isOp("*") || isOp("/")) {
			const op = (peek() as { value: string }).value;
			pos++;
			const right = parseFactor();
			if (right === null) return null;
			left = op === "*" ? left * right : left / right;
		}
		return left;
	};

	// expr := term (("+" | "-") term)*
	function parseExpr(): number | null {
		let left = parseTerm();
		if (left === null) return null;
		while (isOp("+") || isOp("-")) {
			const op = (peek() as { value: string }).value;
			pos++;
			const right = parseTerm();
			if (right === null) return null;
			left = op === "+" ? left + right : left - right;
		}
		return left;
	}

	const result = parseExpr();
	// Trailing junk ("7 7", "7)") means it didn't really parse
	if (result === null || pos !== tokens.length) return null;
	// Divide-by-zero lands here as Infinity/NaN
	if (!Number.isFinite(result)) return null;
	// Money: never carry more than cents
	return Math.round(result * 100) / 100;
}
