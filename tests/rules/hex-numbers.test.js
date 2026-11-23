import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { hexLabelText } from "../../module/rules/hex-names.js";
import { hexNumbering, hexNumberWords, hexPointWords } from "../../module/rules/hex-numbers.js";
import { REALM_GROWTH_FLAG, loggedGrowth } from "../../module/rules/realm-growth.js";
import { SYSTEM_ID } from "../../module/system-id.js";
import { root } from "../repo-files.js";

const t = (key, data) => (key === "realm.hex" ? `Column ${data.col}, Row ${data.row}`
	: key === "realm.readout.coordinates" ? `(${data.col}, ${data.row})`
		: key === "realm.hexNamed" ? `${data.name} (${data.hex})` : key);

const grown = loggedGrowth(null, { west: 3, north: 1, east: 0, south: 0 }, { when: 1, keepNumbers: true });
const scene = { flags: { [SYSTEM_ID]: { [REALM_GROWTH_FLAG]: grown } } };

describe("the numbers a hex is shown by", () => {
	it("prints a map that never grew as stored", () => {
		expect(hexNumberWords({ col: 5, row: 7 }, hexNumbering({ flags: {} }), t)).toBe("Column 5, Row 7");
		expect(hexPointWords({ col: 5, row: 7 }, null, t)).toBe("(5, 7)");
	});

	it("prints the numbers kept through an expansion, through 0 into negatives", () => {
		expect(hexNumberWords({ col: 8, row: 8 }, hexNumbering(scene), t)).toBe("Column 5, Row 7");
		expect(hexPointWords({ col: 1, row: 1 }, hexNumbering(scene), t)).toBe("(-2, 0)");
		expect(hexLabelText({ col: 3, row: 2 }, "Mossford", t, hexNumbering(scene))).toBe("Mossford (Column 0, Row 1)");
	});
});

/** Every file under a folder of the system, by its path from the repository's root. */
function filesUnder(dir) {
	return readdirSync(join(root, dir)).flatMap((name) => {
		const path = join(root, dir, name);
		return statSync(path).isDirectory() ? filesUnder(relative(root, path)) : [relative(root, path)];
	});
}

describe("printing a hex's column and row", () => {
	it("goes through hex-numbers.js alone, so nothing prints a stored number by mistake", () => {
		const strings = /["'`](?:bastionland\.)?realm\.(?:hex|readout\.coordinates)["'`]/;
		const offenders = [...filesUnder("module"), ...filesUnder("templates")]
			.filter((path) => /\.(js|hbs)$/.test(path) && path !== join("module", "rules", "hex-numbers.js"))
			.filter((path) => strings.test(readFileSync(join(root, path), "utf8")));
		expect(offenders).toEqual([]);
	});
});
