import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";
import Handlebars from "handlebars";
import { describe, expect, it } from "vitest";
import { AGES, ARMOUR_KINDS, FEATS, GAMBITS, PROPERTY_TYPES } from "../module/config.js";
import { RANKS } from "../module/rules/glory.js";
import { SCARS } from "../module/rules/scars.js";
import { VIRTUES } from "../module/rules/virtues.js";

const root = join(import.meta.dirname, "..");
const systemManifest = JSON.parse(readFileSync(join(root, "system.json"), "utf8"));
const lang = JSON.parse(readFileSync(join(root, "languages/en.json"), "utf8"));

/** @returns {string[]} Every file under `dir` with the given extension. */
function walk(dir, extension) {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return walk(path, extension);
		return extname(entry.name) === extension ? [path] : [];
	});
}

const lookup = (key) => key.split(".").reduce((node, part) => node?.[part], lang);
const templates = walk(join(root, "templates"), ".hbs");
const scripts = [...walk(join(root, "module"), ".js"), join(root, "mythic-bastionland.js")];

describe("templates", () => {
	it.each(templates.map((file) => [relative(root, file), file]))("%s compiles", (_name, file) => {
		expect(() => Handlebars.precompile(readFileSync(file, "utf8"))).not.toThrow();
	});
});

describe("localization", () => {
	// Full keys quoted in templates, such as localize "bastionland.oath.line1".
	const templateKeys = templates.flatMap((file) =>
		[...readFileSync(file, "utf8").matchAll(/["'](bastionland\.[\w.]+)["']/g)].map((match) => match[1]));

	// Keys passed to the t/localize/format shorthands, which add the prefix.
	const scriptKeys = scripts.flatMap((file) =>
		[...readFileSync(file, "utf8").matchAll(/\b(?:t|localize|format)\(\s*"([\w.]+)"/g)].map((match) => `bastionland.${match[1]}`));

	// Keys built at runtime from the rule tables.
	const builtKeys = [
		...VIRTUES.flatMap((key) => ["abbr", "tail", "label", "hint"].map((part) => `virtues.${key}.${part}`)),
		...VIRTUES.map((key) => `recovery.${key}`),
		...AGES.map((key) => `age.${key}`),
		...RANKS.map((rank) => `rank.${rank.key}`),
		...["fatigued", "exposed", "mortalWound", "exhausted", "impaired"]
			.flatMap((key) => [`conditions.${key}.label`, `conditions.${key}.hint`]),
		...FEATS.flatMap((feat) => ["name", "tagline", "summary", "use"].map((part) => `feats.${feat.key}.${part}`)),
		...GAMBITS.map((key) => `gambits.${key}`),
		...SCARS.flatMap((scar) => ["name", "flavour", "effect"].map((part) => `scars.${scar.key}.${part}`)),
		...SCARS.filter((scar) => scar.detail).flatMap((scar) => [1, 2, 3, 4, 5, 6].map((n) => `scars.${scar.key}.detail.${n}`)),
		...ARMOUR_KINDS.map((key) => `item.kinds.${key}`),
		...["hefty", "long", "slow", "ranged"].map((key) => `item.${key}`),
		...["none", "evaded", "scar", "wounded", "mortal", "slain"].map((key) => `damage.outcomes.${key}`)
	].map((key) => `bastionland.${key}`);

	const typeKeys = [
		...Object.keys(systemManifest.documentTypes.Actor).map((type) => `TYPES.Actor.${type}`),
		...Object.keys(systemManifest.documentTypes.Item).map((type) => `TYPES.Item.${type}`),
		...PROPERTY_TYPES.map((type) => `TYPES.Item.${type}`)
	];

	it.each([...new Set([...templateKeys, ...scriptKeys, ...builtKeys, ...typeKeys])])("%s exists", (key) => {
		expect(typeof lookup(key)).toBe("string");
	});
});
