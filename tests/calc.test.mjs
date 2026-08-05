import { createSuite } from "./harness.mjs";
import { evaluateAmount } from "./.build/callander.mjs";

/**
 * evaluateAmount() parses user input from a cost field. It exists precisely
 * so that field never reaches `eval` or `new Function`, so the injection
 * cases below are the point of the module rather than an afterthought —
 * every one of them must come back null rather than execute, throw, or
 * return a number.
 */
export function run() {
	const { eq, result } = createSuite("calc (secure arithmetic)");

	// ---------- the everyday cases ----------
	eq("plain number", evaluateAmount("14"), 14);
	eq("decimal", evaluateAmount("7.5"), 7.5);
	eq("leading decimal", evaluateAmount(".5"), 0.5);
	eq("addition", evaluateAmount("7+7"), 14);
	eq("many terms", evaluateAmount("5+5+5+5+5+5"), 30);
	eq("subtraction", evaluateAmount("20-6"), 14);
	eq("multiplication", evaluateAmount("7*3"), 21);
	eq("division", evaluateAmount("21/3"), 7);
	eq("precedence: * before +", evaluateAmount("2+3*4"), 14);
	eq("parentheses override precedence", evaluateAmount("(2+3)*4"), 20);
	eq("nested parentheses", evaluateAmount("((1+2)*(3+4))"), 21);
	eq("unary minus", evaluateAmount("-5"), -5);
	eq("unary plus", evaluateAmount("+5"), 5);
	eq("whitespace is ignored", evaluateAmount("  7 + 7  "), 14);
	eq("tabs are ignored", evaluateAmount("7\t+\t7"), 14);

	// ---------- money rounding ----------
	eq("rounds to cents", evaluateAmount("10/3"), 3.33);
	eq("keeps exact cents", evaluateAmount("19.99+0.01"), 20);

	// ---------- incomplete or malformed input returns null ----------
	eq("empty string", evaluateAmount(""), null);
	eq("whitespace only", evaluateAmount("   "), null);
	eq("trailing operator (mid-typing)", evaluateAmount("7+"), null);
	eq("leading binary operator", evaluateAmount("*7"), null);
	eq("double operator", evaluateAmount("7**7"), null);
	eq("unbalanced open paren", evaluateAmount("(7+7"), null);
	eq("unbalanced close paren", evaluateAmount("7+7)"), null);
	eq("empty parentheses", evaluateAmount("()"), null);
	eq("two numbers, no operator", evaluateAmount("7 7"), null);
	eq("malformed decimal", evaluateAmount("1.2.3"), null);
	eq("bare decimal point", evaluateAmount("."), null);
	eq("divide by zero is not a number", evaluateAmount("7/0"), null);
	eq("comma is not a thousands separator", evaluateAmount("1,000"), null);
	eq("currency symbol rejected", evaluateAmount("$7"), null);
	eq("percent rejected", evaluateAmount("7%"), null);

	// ---------- code execution attempts: all must be null ----------
	const attacks = [
		"alert(1)",
		"require('fs')",
		"process.exit(1)",
		"globalThis",
		"this.constructor",
		"constructor.constructor('return 1')()",
		"(()=>1)()",
		"`${1+1}`",
		"7;alert(1)",
		"7,alert(1)",
		"[].constructor",
		"process.env.HOME",
		"import('fs')",
		"new Function('return 1')()",
		"eval('1+1')",
		"__proto__",
		"7 || alert(1)",
		"7 && process.exit()",
		"0x10",
		"1e3",
		"Number('7')",
		"Math.max(1,2)",
		"await fetch('http://x')",
		"module.exports",
		"{}.toString",
	];
	for (const src of attacks) {
		eq(`rejects: ${src}`, evaluateAmount(src), null);
	}

	// A number is still a number even when the string looks hostile around it
	eq("no partial evaluation of hostile input", evaluateAmount("7+alert(1)"), null);
	eq("no silent truncation", evaluateAmount("7abc"), null);

	return result();
}
