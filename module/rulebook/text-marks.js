import { isSystemWindow } from "../system-id.js";

/**
 * Words marked on the rendered page, in the system's windows and chat cards:
 * the page links and the rule-word tips. Done on the page rather than in each
 * string, so text written tomorrow is marked without anyone remembering to.
 * Each kind of mark is added once, during init, and every window is walked
 * once for all of them as it draws.
 */

/** What every chat card the system posts is wrapped in. */
const CARD_CLASS = "bastionland-card";

/** Text that's being typed into, or already does something when clicked. */
const INTERACTIVE = Object.freeze([
	"a", "button", "input", "textarea", "select", "option", "script", "style", "code", "pre",
	"[contenteditable]", "prose-mirror"
]);

/**
 * What a mark leaves as it is: anything already interactive, its own marks, and
 * whatever else it names.
 * @param {string} className The mark's own class, so nothing is marked twice.
 * @param {...string} also   Further selectors this mark leaves alone.
 * @returns {string} A selector list.
 */
export const leaveAlone = (className, ...also) => [...INTERACTIVE, ...also, `.${className}`].join(", ");

/**
 * @typedef {object} TextMatch
 * @property {number} index   Where the words start in the text.
 * @property {number} length
 */

/**
 * @typedef {object} TextMark
 * @property {string} className  Every element the mark makes has it, so nothing is marked twice.
 * @property {string} leaveAlone Text under one of these is left as it is.
 * @property {string} [markAnyway] Text under one of these is marked even inside `leaveAlone`.
 * @property {(text: string) => TextMatch[]} find  The words to mark, in order.
 * @property {(document: Document, match: TextMatch, words: string) => HTMLElement} make  An element holding the words.
 * @property {() => boolean} [enabled]  Whether to mark anything just now; asked once a walk.
 */

/** @type {TextMark[]} */
const marks = [];

/**
 * Wrap the words `find` picks out of each text node under an element.
 * @param {HTMLElement} root
 * @param {object} how
 * @param {(element: Element) => boolean} how.rejects  Whether to leave an element's whole subtree alone.
 * @param {(node: Text) => (TextMatch & object)[]} how.find  A text node's matches, in order and not overlapping.
 * @param {(document: Document, match: TextMatch, words: string) => Node} how.make
 */
export function wrapMatches(root, { rejects, find, make }) {
	const document = root?.ownerDocument;
	if (!document) return;
	const filter = {
		acceptNode: (node) => {
			if (node.nodeType !== 3) return rejects(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
			// Most text in a window is the white space between tags.
			return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
		}
	};
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, filter);

	// Found first and wrapped after, since wrapping would lead the walker astray.
	const found = [];
	while (walker.nextNode()) {
		const matches = find(walker.currentNode);
		if (matches.length) found.push({ node: walker.currentNode, matches });
	}

	for (const { node, matches } of found) {
		const text = node.nodeValue;
		const pieces = document.createDocumentFragment();
		let from = 0;
		for (const match of matches) {
			pieces.append(text.slice(from, match.index), make(document, match, text.slice(match.index, match.index + match.length)));
			from = match.index + match.length;
		}
		pieces.append(text.slice(from));
		node.replaceWith(pieces);
	}
}

/**
 * Whether a mark would mark text in an element, given what's around it.
 * @param {TextMark} mark
 * @param {Element} parent The text's own element.
 * @returns {boolean}
 */
export function markWants(mark, parent) {
	return !parent.closest(mark.leaveAlone) || Boolean(mark.markAnyway && parent.closest(mark.markAnyway));
}

/**
 * Whether no mark would mark anything under an element, so its whole subtree
 * can be passed over unread.
 * @param {TextMark[]} active
 * @param {Element} element
 * @returns {boolean}
 */
export function allLeaveAlone(active, element) {
	return active.every((mark) => element.matches(mark.leaveAlone) && !(mark.markAnyway && element.querySelector(mark.markAnyway)));
}

/**
 * Matches from several marks in one run of text, in order. Where two overlap,
 * the one found first, and so the mark added first, keeps it.
 * @param {(TextMatch & {mark: TextMark})[]} matches
 */
export function pickMatches(matches) {
	const picked = [];
	let end = 0;
	for (const match of [...matches].sort((a, b) => a.index - b.index)) {
		if (match.index < end) continue;
		picked.push(match);
		end = match.index + match.length;
	}
	return picked;
}

/**
 * Mark the words under an element with every mark that's on.
 * @param {HTMLElement} root
 */
export function markText(root) {
	const active = marks.filter((mark) => mark.enabled?.() ?? true);
	if (!active.length) return;
	// A subtree every mark leaves alone, such as an editor or a mark already made, isn't read at all.
	const done = active.map((mark) => `.${mark.className}`).join(", ");
	wrapMatches(root, {
		rejects: (element) => element.matches(done) || allLeaveAlone(active, element),
		find: (node) => {
			const parent = node.parentElement;
			if (!parent) return [];
			const found = [];
			for (const mark of active) {
				// The selectors are cheaper than the patterns, so they're asked first.
				if (!markWants(mark, parent)) continue;
				for (const match of mark.find(node.nodeValue)) found.push({ ...match, mark });
			}
			return found.length > 1 ? pickMatches(found) : found;
		},
		make: (document, match, words) => match.mark.make(document, match, words)
	});
}

/**
 * The parts a render drew: the whole window the first time, and afterwards
 * only the parts drawn again, which are all that have unmarked text.
 * @param {object} app
 * @param {HTMLElement} element
 * @param {object} [options] The render options.
 * @returns {HTMLElement[]}
 */
export function renderedRoots(app, element, options) {
	if (options?.isFirstRender || !options?.parts?.length || !app?.parts) return [element];
	const parts = options.parts.map((id) => app.parts[id]);
	return parts.every(Boolean) ? parts : [element];
}

/**
 * Mark each window and chat card as it draws with this mark too. The first
 * mark added sets up the walk. Called during init.
 * @param {TextMark} mark
 */
export function addTextMark(mark) {
	if (marks.includes(mark)) return;
	marks.push(mark);
	if (marks.length > 1) return;
	Hooks.on("renderApplicationV2", (app, element, _context, options) => {
		if (!isSystemWindow(element)) return;
		for (const root of renderedRoots(app, element, options)) markText(root);
	});
	// Only the system's own cards: what players type and other modules post keep their words as they are.
	Hooks.on("renderChatMessageHTML", (_message, element) => {
		for (const card of element?.querySelectorAll?.(`.${CARD_CLASS}`) ?? []) markText(card);
	});
}
