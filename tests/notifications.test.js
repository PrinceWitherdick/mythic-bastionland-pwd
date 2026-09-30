import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { withBookText } from "../module/rules/book-text.js";

const root = join(import.meta.dirname, "..");
const strings = withBookText(JSON.parse(readFileSync(join(root, "languages/en.json"), "utf8"))).bastionland;

/** A page number as the book's own pages are cited: "(p6)", "(pp6-7)". */
const PAGE = /\(pp?\s?\d/i;

/** Where a notification is raised: `ui.notifications.info(…)`, and the `warn` shorthand for the same. */
const CALLS = /ui\.notifications\.\w+\(|(?<![.\w])warn\(/g;

/** How much of the source after a call to look through for the keys it hands the notification. */
const ARGUMENTS = 240;

/** A localization key in quotes, whole or built around one `${…}`. */
const KEYS = /[`"]([A-Za-z][A-Za-z0-9_.]*(?:\$\{[^`"}]*\})?)[`"]/g;

/** @returns {string[]} Every .js file under module/. */
function sources(dir = join(root, "module")) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return sources(path);
		return entry.name.endsWith(".js") ? [path] : [];
	});
}

/**
 * The English a key stands for: one string, or every string under it when the
 * key is built around a `${…}`, such as `attack.refusals.${check.refusal}`.
 * @param {string} key The key as far as the source spells it out.
 * @returns {[string, string][]} Each full key and its English. Empty for anything that isn't a key.
 */
function localizations(key) {
	const built = key.includes("${");
	const path = (built ? key.slice(0, key.indexOf("${")) : key).replace(/\.$/, "").split(".").filter(Boolean);
	const found = path.reduce((node, step) => (node && typeof node === "object" ? node[step] : undefined), strings);
	if (typeof found === "string") return built ? [] : [[path.join("."), found]];
	if (!found || !built) return [];
	return Object.entries(found)
		.filter(([, value]) => typeof value === "string")
		.map(([name, value]) => [`${path.join(".")}.${name}`, value]);
}

/** @returns {string[]} Every localized string a file's notifications can show. */
function notified(source) {
	const found = [];
	for (const call of source.matchAll(CALLS)) {
		const args = source.slice(call.index, call.index + ARGUMENTS);
		for (const [, key] of args.matchAll(KEYS)) found.push(...localizations(key));
	}
	return found;
}

describe("what notifications say", () => {
	it("finds the keys the notifications are raised with", () => {
		// A guard that matched nothing would pass whatever the notifications said.
		const source = readFileSync(join(root, "module/canvas/company-placement.js"), "utf8");
		expect(notified(source).map(([key]) => key)).toEqual(expect.arrayContaining(["company.placed", "company.placing.later", "company.placing.stop"]));
	});

	// A notification is plain text: there's nothing in it for a page number to
	// open, and a player shown one can't turn to the book at all.
	it("never cites a page of the book", () => {
		const cited = [];
		for (const file of sources()) {
			for (const [key, text] of notified(readFileSync(file, "utf8"))) {
				if (PAGE.test(text)) cited.push(`${relative(root, file)} — ${key}: ${text}`);
			}
		}
		expect(cited).toEqual([]);
	});
});
