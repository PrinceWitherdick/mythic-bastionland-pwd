import { describe, expect, it } from "vitest";
import { cleanColour, cleanTagName, entryChip, filterKey, findTagByName, isKindTag, liveTag, normalizeCustomTag, readCustomTags, readKindColours } from "../../module/rules/timeline-tags.js";

const tags = [{ id: "tag-a", name: "Feasts", colour: "#aa3300" }];

describe("the table's own tags", () => {
	it("keeps only a named tag with a real colour, by name", () => {
		expect(normalizeCustomTag({ name: "  Feasts   and  Fairs ", colour: "#AA3300" }, "tag-a.b")).toEqual({ id: "tag-ab", name: "Feasts and Fairs", colour: "#aa3300" });
		expect(normalizeCustomTag({ name: "x", colour: "red" }, "tag-a")).toBe(null);
		expect(normalizeCustomTag({ name: "x", colour: "#112233" }, "myth")).toBe(null);
		expect(readCustomTags({ "tag-b": { name: "beta", colour: "#000000" }, "tag-a": { name: "Alpha", colour: "#ffffff" }, bad: {} }).map((t) => t.name)).toEqual(["Alpha", "beta"]);
		expect(cleanTagName("x".repeat(40))).toHaveLength(32);
	});

	it("finds a tag by its name whatever its case", () => {
		expect(findTagByName(tags, " feasts ")).toBe(tags[0]);
		expect(findTagByName(tags, "")).toBe(null);
	});

	it("lets a colour into a style only as #rrggbb", () => {
		expect(cleanColour("#ABCDEF")).toBe("#abcdef");
		expect(cleanColour("url(x)")).toBe("");
		expect(readKindColours({ myth: "#123456", hand: "nope", nonsense: "#000000" })).toEqual({ myth: "#123456" });
	});
});

describe("what an entry wears", () => {
	it("reads a typed entry's tag as that kind, or as the table's own while the world has it", () => {
		expect(isKindTag("wounds")).toBe(true);
		expect(isKindTag("hand")).toBe(false);
		expect(liveTag({ source: "hand", tag: "wounds" }, tags)).toBe("wounds");
		expect(liveTag({ source: "hand", tag: "tag-a" }, tags)).toBe("tag-a");
		expect(liveTag({ source: "hand", tag: "tag-gone" }, tags)).toBe("");
		expect(liveTag({ source: "scar", tag: "myth" }, tags)).toBe("");
	});

	it("files a milestone under its kind and a typed entry under its tag", () => {
		expect(filterKey({ source: "scar" }, tags)).toBe("wounds");
		expect(filterKey({ source: "hand", tag: "myth" }, tags)).toBe("myth");
		expect(filterKey({ source: "hand" }, tags)).toBe("hand");
	});

	it("gives its chip the kind's glyph, or the tag's name and colour", () => {
		expect(entryChip({ source: "visit" }, tags)).toMatchObject({ kind: "travels", tagged: false });
		expect(entryChip({ source: "hand", tag: "glory" }, tags)).toMatchObject({ kind: "glory", tagged: true });
		expect(entryChip({ source: "hand", tag: "tag-a" }, tags)).toMatchObject({ kind: "custom", tagged: true, tagName: "Feasts", colour: "#aa3300" });
		expect(entryChip({ source: "hand" }, tags)).toMatchObject({ kind: "hand", tagged: false });
	});
});
