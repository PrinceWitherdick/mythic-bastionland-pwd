import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
/** The stylesheet with its comments taken out, so only declarations are read. */
const chat = readFileSync(join(root, "styles", "chat.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

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

/**
 * Every whole card the system posts, with the comments it opens on taken off so
 * the first tag is the card's own. The partials under `parts/` are left out:
 * they are pieces of a card, not one.
 */
const cards = readdirSync(join(root, "templates", "chat"), { withFileTypes: true })
	.filter((entry) => entry.isFile() && entry.name.endsWith(".hbs"))
	.map((entry) => ({
		name: entry.name,
		text: readFileSync(join(entry.parentPath, entry.name), "utf8").replace(/\{\{!(--)?[\s\S]*?(--)?\}\}/g, "")
	}));

describe("a card fills its chat message", () => {
	it("paints the message, not a box inside it", () => {
		const message = rule(".chat-message:has(.bastionland-card)");
		expect(message.background).toBe("var(--bastionland-paper)");
		expect(message["border-color"]).toBe("var(--bastionland-rule)");
		expect(message.color).toBe("var(--bastionland-ink)");
	});

	/** The message carries the frame now, so a second one inside it would show as a seam. */
	it("takes the card's own frame away inside a message", () => {
		const inside = rule(".chat-message .bastionland-card");
		expect(inside.background).toBe("none");
		expect(inside.border).toBe("none");
		expect(inside.padding).toBe("0");
		expect(inside["border-radius"]).toBe("0");
	});

	/** Foundry's header ink is a grey that Night's navy would swallow. */
	it("reads the sender against the card's paper", () => {
		const header = rule(".chat-message:has(.bastionland-card) .message-header");
		expect(header.color).toBe("var(--bastionland-ink-soft)");
		expect(header["font-family"]).toBe("var(--bastionland-font-body)");
	});

	/** The byline the card is posted under, in the hand the system names things in. */
	it("sets the sender in small caps, over the card's own words", () => {
		const sender = rule(".chat-message:has(.bastionland-card) .message-header .message-sender");
		expect(sender["font-family"]).toBe("var(--bastionland-font-caps)");
		expect(sender.color).toBe("var(--bastionland-ink)");
		// The card's words are 15px, and Foundry's header 14px; the name is over both.
		expect(Number.parseFloat(sender["font-size"]) * 16).toBeGreaterThan(15);
		// Held to one line, a long name pushes the time off the card or is cut in half.
		expect(sender["white-space"]).toBe("normal");
	});

	/** 12px, the size Foundry sets the time at, is under the floor the system keeps. */
	it("lifts the time to the card's small print", () => {
		const metadata = rule(".chat-message:has(.bastionland-card) .message-header .message-metadata");
		expect(metadata["font-size"]).toBe("var(--bastionland-font-note)");
	});

	/** A Phase's or a Season's colour has to reach the edges like any other card's. */
	it("carries every painted tone up to the message", () => {
		const tones = [...chat.matchAll(/^\.bastionland-card--([a-z]+),$/gm)].map((match) => match[1]);
		expect(tones.length).toBeGreaterThan(5);
		for (const tone of tones) {
			expect(chat, `${tone} paints the card but not the message`)
				.toContain(`.chat-message:has(.bastionland-card--${tone}) {`);
		}
	});

	/**
	 * The fill hangs off the one class, so a card rooted in anything else would
	 * go back to sitting in Foundry's frame.
	 */
	it("roots every chat template in the card class", () => {
		expect(cards.length).toBeGreaterThan(20);
		const stray = cards
			.filter(({ text }) => !/^\s*<\w+[^>]*\sclass="bastionland-card[\s"{]/.test(text))
			.map(({ name }) => name);
		expect(stray).toEqual([]);
	});
});
