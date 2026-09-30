import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Just enough of the DOM for the walker: elements matched by tag, class and
 * attribute, text nodes, fragments, and a TreeWalker that honours its filter.
 */

/** @param {FakeElement} element @param {string} selector One of tag, .class or [attr]. */
function matchesOne(element, selector) {
	if (selector.startsWith(".")) return element.classes.has(selector.slice(1));
	if (selector.startsWith("[")) return selector.slice(1, -1) in element.attrs;
	return element.tag === selector;
}

class FakeText {
	nodeType = 3;
	parent = null;
	constructor(value) {
		this.nodeValue = value;
	}

	get parentElement() {
		return this.parent;
	}

	replaceWith(fragment) {
		const siblings = this.parent.children;
		siblings.splice(siblings.indexOf(this), 1, ...fragment.children);
		for (const child of fragment.children) child.parent = this.parent;
	}
}

class FakeElement {
	nodeType = 1;
	parent = null;
	dataset = {};
	constructor(tag, { classes = [], attrs = {} } = {}, children = []) {
		this.tag = tag;
		this.classes = new Set(classes);
		this.attrs = attrs;
		this.children = [];
		for (const child of children) this.append(child);
	}

	get parentElement() {
		return this.parent;
	}

	get ownerDocument() {
		return fakeDocument;
	}

	set className(value) {
		this.classes = new Set(value.split(" "));
	}

	get classList() {
		return { contains: (name) => this.classes.has(name) };
	}

	set textContent(value) {
		this.children = [];
		this.append(value);
	}

	append(...items) {
		for (const item of items) {
			const node = typeof item === "string" ? new FakeText(item) : item;
			node.parent = this;
			this.children.push(node);
		}
	}

	matches(selector) {
		return selector.split(/,\s*/).some((one) => matchesOne(this, one));
	}

	closest(selector) {
		for (let node = this; node; node = node.parent) if (node.matches(selector)) return node;
		return null;
	}

	querySelector(selector) {
		for (const child of this.children) {
			if (child.nodeType !== 1) continue;
			if (child.matches(selector)) return child;
			const found = child.querySelector(selector);
			if (found) return found;
		}
		return null;
	}
}

/** The markup a fake element stands for, marks and all. */
function html(node) {
	if (node.nodeType === 3) return node.nodeValue;
	const classes = node.classes.size ? ` class="${[...node.classes].join(" ")}"` : "";
	return `<${node.tag}${classes}>${node.children.map(html).join("")}</${node.tag}>`;
}

const fakeDocument = {
	createElement: (tag) => new FakeElement(tag),
	createDocumentFragment: () => new FakeElement("#fragment"),
	createTreeWalker(root, _whatToShow, filter) {
		const nodes = [];
		const visit = (parent) => {
			for (const child of parent.children) {
				const verdict = filter.acceptNode(child);
				if (verdict === NodeFilter.FILTER_ACCEPT) nodes.push(child);
				if (child.nodeType === 1 && verdict !== NodeFilter.FILTER_REJECT) visit(child);
			}
		};
		visit(root);
		let at = -1;
		return {
			get currentNode() {
				return nodes[at];
			},
			nextNode: () => nodes[++at] ?? null
		};
	}
};

const el = (tag, options, ...children) => new FakeElement(tag, options, children);

let marks;
let keywords;
let settings;

beforeEach(async () => {
	vi.resetModules();
	settings = {};
	globalThis.NodeFilter = { SHOW_ELEMENT: 1, SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 };
	globalThis.Hooks = { on: vi.fn() };
	globalThis.game = {
		i18n: { localize: (key) => key, format: (key, data) => `${key}:${data.text ?? data.page}` },
		settings: {
			get: (_namespace, key) => {
				if (!(key in settings)) throw new Error("not registered");
				return settings[key];
			}
		}
	};
	marks = await import("../../module/rulebook/text-marks.js");
	keywords = await import("../../module/rulebook/keyword-tips.js");
});

afterEach(() => {
	delete globalThis.NodeFilter;
	delete globalThis.Hooks;
	delete globalThis.game;
});

/** A stand-in for the page links: any "p16", made a link, and none in a button. */
const PAGES = Object.freeze({
	className: "page",
	leaveAlone: "a, button, textarea, .page",
	find: (text) => [...text.matchAll(/p\d+/g)].map((match) => ({ index: match.index, length: match[0].length })),
	make: (document, _match, words) => {
		const link = document.createElement("a");
		link.className = "page";
		link.textContent = words;
		return link;
	}
});

describe("markText", () => {
	it("walks a window once for every mark, each where it's wanted", () => {
		marks.addTextMark(PAGES);
		marks.addTextMark(keywords.KEYWORD_TIPS);
		const root = el("div", {},
			el("p", {}, "Exposed until Saved, see p8."),
			el("button", { attrs: { "data-tooltip": "" } }, "Exposed p9 ", el("span", { classes: ["bastionland-item__gloss"] }, "d8 hefty p10")),
			el("textarea", {}, "Exposed p8"));
		marks.markText(root);
		expect(html(root)).toBe("<div>"
			+ '<p><span class="bastionland-keyword">Exposed</span> until Saved, see <a class="page">p8</a>.</p>'
			+ '<button>Exposed p9 <span class="bastionland-item__gloss">d8 <span class="bastionland-keyword">hefty</span> p10</span></button>'
			+ "<textarea>Exposed p8</textarea>"
			+ "</div>");
		expect(Hooks.on).toHaveBeenCalledTimes(2);
	});

	it("never marks words twice", () => {
		marks.addTextMark(PAGES);
		marks.addTextMark(keywords.KEYWORD_TIPS);
		const root = el("div", {}, el("p", {}, "Exposed, p8"));
		marks.markText(root);
		const once = html(root);
		marks.markText(root);
		expect(html(root)).toBe(once);
	});

	it("passes over a subtree every mark leaves alone, unread", () => {
		const find = vi.fn(() => []);
		marks.addTextMark({ ...PAGES, find });
		marks.markText(el("div", {}, el("button", {}, "p1"), el("p", {}, "  "), el("p", {}, "p2")));
		expect(find.mock.calls).toEqual([["p2"]]);
	});

	it("marks nothing with a mark that's off", () => {
		marks.addTextMark({ ...PAGES, enabled: () => false });
		const root = el("p", {}, "p8");
		marks.markText(root);
		expect(html(root)).toBe("<p>p8</p>");
	});
});

describe("pickMatches", () => {
	it("keeps matches in order, and the first of two that overlap", () => {
		const first = { index: 4, length: 3 };
		const overlapping = { index: 5, length: 4 };
		const earlier = { index: 0, length: 2 };
		expect(marks.pickMatches([first, overlapping, earlier])).toEqual([earlier, first]);
	});
});

describe("renderedRoots", () => {
	const element = el("div");
	const app = { parts: { header: el("header"), myths: el("section") } };

	it("walks the whole window when it first draws, or has no parts", () => {
		expect(marks.renderedRoots(app, element, { isFirstRender: true, parts: ["header"] })).toEqual([element]);
		expect(marks.renderedRoots({}, element, {})).toEqual([element]);
	});

	it("walks only the parts drawn again", () => {
		expect(marks.renderedRoots(app, element, { parts: ["myths"] })).toEqual([app.parts.myths]);
		expect(marks.renderedRoots(app, element, { parts: ["myths", "gone"] })).toEqual([element]);
	});
});

describe("a rule word's tip", () => {
	const hover = () => {
		const word = el("span", { classes: ["bastionland-keyword"] });
		word.dataset.keyword = "exposed";
		word.dataset.keywordPage = "8";
		return word;
	};

	it("is offered as the word is hovered, in the words laid by then", () => {
		const word = hover();
		keywords.offerTip({ target: word });
		expect(word.dataset.tooltip).toBe("bastionland.keywords.tip:bastionland.keywords.exposed");
	});

	it("says where the word is explained while the book's words aren't read", () => {
		const localize = game.i18n.localize;
		game.i18n.localize = (key) => (key === "bastionland.keywords.exposed" ? "" : localize(key));
		const word = hover();
		keywords.offerTip({ target: word });
		expect(word.dataset.tooltip).toBe("bastionland.keywords.unread:8");
		game.i18n.localize = localize;
	});

	it("is taken away while the popups are off, in cards already posted too", () => {
		const word = hover();
		keywords.offerTip({ target: word });
		settings.keywordTips = false;
		keywords.offerTip({ target: word });
		expect(word.dataset.tooltip).toBeUndefined();
	});

	it("leaves everything else alone", () => {
		const other = el("span");
		keywords.offerTip({ target: other });
		expect(other.dataset.tooltip).toBeUndefined();
	});
});
