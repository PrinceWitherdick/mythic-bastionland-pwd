import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { withBookText } from "../module/rules/book-text.js";
import { pageReferences } from "../module/rules/rulebook.js";

const root = join(import.meta.dirname, "..");
const strings = withBookText(JSON.parse(readFileSync(join(root, "languages/en.json"), "utf8"))).bastionland;

/** Whether text cites a page, as the system finds one to link ("p6", "pp6–7", "page 151"), or fills one in ("p{page}"). */
const citesPage = (text) => pageReferences(text).length > 0 || /\{page\}/.test(text);

/** The one tip that may name a page: a page link's own, saying the click opens it. */
const CLICKED_THROUGH = new Set(["rulebook.openPage"]);

/** A template's tooltip given straight from the language file: `data-tooltip="{{localize 'bastionland.…'}}"`. */
const TEMPLATE_TIPS = /data-tooltip(?:-text)?="\{\{localize ['"]bastionland\.([^'"]+)['"]/g;

/** Where code sets a tooltip, as a `tooltip:` field or onto `dataset.tooltip`; the keys are read from the rest of its line. */
const CODE_TIPS = /\btooltip(?:Text)?\s*[:=](?!=)[^\n]*/g;

/** A localization key in quotes, whole or built around one `${…}`. */
const KEYS = /[`"]([A-Za-z][A-Za-z0-9_.]*(?:\$\{[^`"}]*\})?)[`"]/g;

/** @returns {string[]} Every file under a folder of the system with the given ending. */
function files(dir, ending) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return files(path, ending);
		return entry.name.endsWith(ending) ? [path] : [];
	});
}

/**
 * The English a key stands for: one string, or every string under it when the
 * key is built around a `${…}`.
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

/** @returns {[string, string, string][]} Each file, key and English a tooltip in the system can show. */
function tooltips() {
	const found = [];
	for (const file of files(join(root, "templates"), ".hbs")) {
		for (const [, key] of readFileSync(file, "utf8").matchAll(TEMPLATE_TIPS)) found.push(...localizations(key).map((pair) => [file, ...pair]));
	}
	for (const file of files(join(root, "module"), ".js")) {
		for (const [line] of readFileSync(file, "utf8").matchAll(CODE_TIPS)) {
			for (const [, key] of line.matchAll(KEYS)) found.push(...localizations(key).map((pair) => [file, ...pair]));
		}
	}
	// A rule word's tip is set by keyword-tips.js from its own entry, or this until the book is read.
	found.push(...localizations("keywords.unread").map((pair) => ["module/rulebook/keyword-tips.js", ...pair]));
	return found;
}

describe("what tooltips say", () => {
	it("finds the keys the tooltips are given", () => {
		// A guard that matched nothing would pass whatever the tooltips said.
		const keys = tooltips().map(([, key]) => key);
		expect(keys).toEqual(expect.arrayContaining(["gmToolkit.myths.chooseTooltip", "npc.rollVirtuesHint", "hexGm.seer.hint"]));
	});

	// A tooltip is gone as the pointer leaves it: there's nothing in it for a
	// page number to open, so it says what to do instead of where it's written.
	it("never cites a page of the book", () => {
		const cited = tooltips()
			.filter(([, key, text]) => !CLICKED_THROUGH.has(key) && citesPage(text))
			.map(([file, key, text]) => `${relative(root, file)} — ${key}: ${text}`);
		expect(cited).toEqual([]);
	});
});
