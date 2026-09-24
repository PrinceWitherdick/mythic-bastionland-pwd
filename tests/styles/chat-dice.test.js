import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
/** The stylesheet with its comments taken out, so only declarations are read. */
const chat = readFileSync(join(root, "styles", "chat.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const card = readFileSync(join(root, "templates", "chat", "attack.hbs"), "utf8").replace(/\r/g, "");

/**
 * What one rule declares.
 * @param {string} selector Exactly as the stylesheet writes it.
 * @returns {Record<string, string>}
 */
function rule(selector) {
	const start = chat.indexOf(`\n${selector} {`);
	expect(start, `${selector} is missing from chat.css`).toBeGreaterThan(-1);
	const block = chat.slice(start + selector.length + 3, chat.indexOf("}", start));
	return Object.fromEntries(
		block
			.split(";")
			.map((line) => /^\s*([a-z-]+):\s*(.+)$/s.exec(line.trim()))
			.filter(Boolean)
			.map((match) => [match[1], match[2].trim()])
	);
}

describe("dice in chat cards", () => {
	/**
	 * Foundry holds every button to `--button-size`, so a die that doesn't say
	 * otherwise is squashed and its name printed over its own face. This cost a
	 * broken Attack card once; the guard is here so it can't cost another.
	 */
	it("lets a die button grow to the words under it", () => {
		const die = rule(".bastionland-die");
		expect(die.height).toBe("auto");
		expect(die["min-height"]).toBe("0");
	});

	it("draws the die itself in a square", () => {
		const face = rule(".bastionland-die .bastionland-die__face");
		expect(face.width).toMatch(/^[0-9.]+rem$/);
		expect(face.width).toBe(face.height);
		expect(rule(".bastionland-die__face").position).toBe("relative");
	});

	/**
	 * Foundry's server cleans a chat message's HTML against `ALLOWED_HTML_TAGS`,
	 * which has no `svg` in it: a card drawn with one arrives with the drawing
	 * taken out. Profiles are cut with `clip-path` instead, so nothing a card
	 * carries may be an svg.
	 */
	it("draws nothing in a chat card that the server would strip out", () => {
		const cards = readdirSync(join(root, "templates", "chat"), { recursive: true, withFileTypes: true })
			.filter((entry) => entry.isFile())
			.map((entry) => join(entry.parentPath, entry.name));
		expect(cards.length).toBeGreaterThan(10);
		const drawn = cards.filter((path) => /<(svg|polygon|path|canvas)[\s>/]/.test(readFileSync(path, "utf8")));
		expect(drawn).toEqual([]);
	});

	it("cuts the die out of a shape the card carries", () => {
		expect(card).toMatch(/style="--bastionland-die-mask: \{\{shape\}\}"/);
		expect(chat).toContain("mask: var(--bastionland-die-mask)");
	});

	it("holds the name outside the square, under the die", () => {
		const face = card.indexOf('class="bastionland-die__face"');
		const label = card.indexOf('class="bastionland-die__label"');
		expect(face).toBeGreaterThan(-1);
		// The result belongs inside the face; the size and the name follow it, outside.
		expect(card.indexOf('class="bastionland-die__result"')).toBeGreaterThan(face);
		expect(label).toBeGreaterThan(card.indexOf("</span>", face));
	});
});
