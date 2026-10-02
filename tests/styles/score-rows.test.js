import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const css = readFileSync(join(root, "styles", "mythic-bastionland.css"), "utf8");

/**
 * The classes the scores grid hands cells to, and the column each is pinned to.
 * A score row is `display: contents`, so its children are the grid's own items:
 * left to auto-placement they run on into whatever column comes next and shear
 * the rows apart, which is why every one of them names its column outright.
 */
const CELLS = {
	".bastionland-scores .bastionland-score__name": 1,
	// An NPC's or Structure's Armour name, with its note beneath it.
	".bastionland-scores .bastionland-npc-armour": 1,
	".bastionland-scores .bastionland-box": 2,
	".bastionland-scores .bastionland-box--max": 3,
	".bastionland-armour--score": 4
};

/** Classes that sit inside a cell rather than being one: the lettering of a name, the Armour's note. */
const INSIDE = ["bastionland-score__abbr", "bastionland-score__tail", "bastionland-score__die", "bastionland-npc-armour-note"];

/** The `display: contents` wrapper standing for a row without taking a cell of its own. */
const ROW = "bastionland-score";

/**
 * The declarations of one rule, by its exact selector.
 * @param {string} selector
 * @returns {Record<string, string>}
 */
function rule(selector) {
	const pattern = new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{\r?\n([\\s\\S]*?)^\\}`, "m");
	const found = pattern.exec(css);
	expect(found, `no ${selector} rule in mythic-bastionland.css`).not.toBeNull();
	return Object.fromEntries(
		[...found[1].matchAll(/^\t([\w-]+):\s*([^;]+);/gm)].map((match) => [match[1], match[2].trim()])
	);
}

/**
 * The tracks of a `grid-template-columns`, keeping each `minmax()` whole.
 * @param {string} value As the stylesheet writes it.
 * @returns {string[]}
 */
function tracks(value) {
	return value.match(/minmax\([^)]*\)|\S+/g) ?? [];
}

/**
 * @param {string} directory
 * @returns {string[]} Every template under it, by path.
 */
function templates(directory) {
	return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) return templates(path);
		return entry.isFile() && entry.name.endsWith(".hbs") ? [path] : [];
	});
}

/** The shared partial, spliced in wherever a sheet includes it. */
const partial = readFileSync(join(root, "templates", "actor", "parts", "virtue-scores.hbs"), "utf8");

/**
 * Every scores section in the system, its partial inlined.
 * @returns {[string, string][]} Each section's template path and its markup.
 */
function sections() {
	const found = [];
	for (const path of templates(join(root, "templates"))) {
		const markup = readFileSync(path, "utf8").replace(/\r/g, "");
		for (const match of markup.matchAll(/<section class="bastionland-scores"[^>]*>([\s\S]*?)<\/section>/g)) {
			const inlined = match[1].replace(/\{\{>\s*"bastionland\.virtue-scores"\s*\}\}/g, partial);
			found.push([path.slice(root.length + 1), inlined]);
		}
	}
	expect(found.length, "scores sections found to check").toBeGreaterThan(0);
	return found;
}

describe("the scores grid on the Knight, Squire, NPC and Structure sheets", () => {
	it("pins every cell to a column of its own", () => {
		for (const [selector, column] of Object.entries(CELLS)) {
			expect(rule(selector)["grid-column"], `the column ${selector} sits in`).toBe(String(column));
		}
	});

	it("declares exactly as many columns as the cells are pinned to", () => {
		const columns = tracks(rule(".bastionland-scores")["grid-template-columns"]);
		expect(columns).toHaveLength(Math.max(...Object.values(CELLS)));
	});

	/*
	 * The three score columns want 271px between them, and a Knight's left-hand
	 * column is only about 274px once the sheet is narrow. So the name gives up
	 * its width first, and the Armour's column is never let below the badge's own.
	 */
	it("lets the name give way before the Armour spills over the next column", () => {
		const columns = tracks(rule(".bastionland-scores")["grid-template-columns"]);
		expect(columns.at(0), "the name's column").toMatch(/^minmax\(min-content,/);
		expect(columns.at(-1), "the Armour's column").toMatch(/^minmax\(max-content,/);
		expect(rule(".bastionland-scores .bastionland-score__name")["min-width"], "the name's own floor").toBe("0");
	});

	it("keeps a score row out of the grid, so its children are the cells", () => {
		expect(rule(`.${ROW}`).display).toBe("contents");
	});

	/*
	 * The guard that matters: anything new dropped into a scores section is a grid
	 * item too, and without a column of its own it shears the rows apart. Only the
	 * classes above are known to be placed, so a fresh one fails here until it is
	 * pinned. Lettering held inside a cell is not itself a cell.
	 */
	it.each(sections())("places everything %s puts in the grid", (_path, markup) => {
		const known = [...Object.keys(CELLS).map((selector) => selector.split(" ").at(-1).slice(1)), ...INSIDE, ROW];
		for (const [, value] of markup.matchAll(/class="([^"{}]*)"/g)) {
			const classes = value.trim().split(/\s+/);
			// A bare Font Awesome glyph is always lettering inside a cell, never one itself.
			const ours = classes.filter((name) => name.startsWith("bastionland-"));
			if (!ours.length) continue;
			const placed = ours.some((name) => known.includes(name));
			expect(placed, `${ours.join(" ")} is in the scores grid without a column`).toBe(true);
		}
	});
});
