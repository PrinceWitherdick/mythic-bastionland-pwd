import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The walk itself is tested in text-marks.test.js, so here it stands in for
 * one run of printed text: every match the mark finds is made in order, and
 * the elements it makes are answered for.
 */
const marked = { text: "" };

vi.mock("../../module/rulebook/text-marks.js", () => ({
	leaveAlone: (className, ...also) => [...also, `.${className}`].join(", "),
	wrapMatches: (_root, { find, make }) => {
		for (const match of find({ nodeValue: marked.text })) {
			marked.made.push(make(fakeDocument, match, marked.text.slice(match.index, match.index + match.length)));
		}
	}
}));

const { markDice, restoreDiceRolls, showDiceRoll } = await import("../../module/rulebook/dice-in-text.js");

/** Just enough of an element for a die and the roll printed after it. */
function element(tag) {
	return {
		tag,
		dataset: {},
		textContent: "",
		classes: [],
		siblings: [],
		ownerDocument: fakeDocument,
		get classList() {
			return { contains: (name) => this.classes.includes(name) };
		},
		set className(value) {
			this.classes = value.split(" ");
		},
		get className() {
			return this.classes.join(" ");
		},
		get nextElementSibling() {
			return this.siblings[0] ?? null;
		},
		after(node) {
			this.siblings.unshift(node);
			node.remove = () => this.siblings.splice(this.siblings.indexOf(node), 1);
		}
	};
}

const fakeDocument = { createElement: (tag) => element(tag) };

/** Mark the dice in a run of printed text, as a window's render does. */
function mark(text) {
	marked.text = text;
	marked.made = [];
	return markDice({});
}

beforeEach(() => {
	globalThis.game = { i18n: { format: (path, data) => `${path}:${JSON.stringify(data)}`, localize: (path) => path } };
});

afterEach(() => {
	delete globalThis.game;
});

describe("markDice", () => {
	it("makes each die a button the window's rollDice action answers", () => {
		const [die] = mark("paint patches of d12 hexes in one terrain");
		expect(die.tag).toBe("button");
		expect(die.type).toBe("button");
		expect(die.textContent).toBe("d12");
		expect(die.className).toContain("bastionland-dice");
		// The faces say which die is drawn before the words.
		expect(die.dataset).toMatchObject({ action: "rollDice", formula: "1d12", faces: "12" });
		expect(die.dataset.tooltip).toContain("bastionland.dice.roll");
	});

	it("keys two of the same die in one text apart, so their rolls don't swap", () => {
		const dice = mark("clusters of d12 hexes, then d12 more, then lose d6 VIG");
		expect(dice.map((die) => die.dataset.die)).toEqual(["1d12#0", "1d12#1", "1d6#0"]);
	});
});

describe("showDiceRoll", () => {
	it("prints what the die gave beside it, and offers another roll", () => {
		const [die] = mark("clusters of d12 hexes");
		const result = showDiceRoll(die, 7, { landing: true });
		expect(result.textContent).toContain("7");
		expect(result.className.split(" ")).toContain("is-landing");
		expect(die.nextElementSibling).toBe(result);
		expect(die.dataset.rolled).toBe("7");
		expect(die.dataset.tooltip).toContain("bastionland.dice.again");
	});

	it("puts a fresh roll in the last one's place", () => {
		const [die] = mark("clusters of d12 hexes");
		showDiceRoll(die, 7);
		const second = showDiceRoll(die, 2);
		expect(die.siblings).toEqual([second]);
		expect(die.dataset.rolled).toBe("2");
	});

	it("takes a roll away again", () => {
		const [die] = mark("clusters of d12 hexes");
		showDiceRoll(die, 7);
		expect(showDiceRoll(die, null)).toBeNull();
		expect(die.siblings).toEqual([]);
		expect(die.dataset.rolled).toBeUndefined();
	});
});

describe("restoreDiceRolls", () => {
	it("prints each die's last roll again when the window draws, without the flash", () => {
		const dice = mark("clusters of d12 hexes, then lose d6 VIG");
		restoreDiceRolls(dice, new Map([["1d12#0", 9]]));
		expect(dice[0].nextElementSibling.textContent).toContain("9");
		expect(dice[0].nextElementSibling.className).not.toContain("is-landing");
		// A die never rolled says nothing.
		expect(dice[1].nextElementSibling).toBeNull();
	});
});
