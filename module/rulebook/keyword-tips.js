import { t } from "../chat/cards.js";
import { showsKeywordTips } from "../client-settings.js";
import { findKeywords } from "../rules/keywords.js";
import { withoutPageReferences } from "../rules/rulebook.js";
import { addTextMark, leaveAlone } from "./text-marks.js";

/**
 * Hovering a rule word, such as Exposed or Hefty, in the system's windows and
 * chat cards shows what it means, as Stonetop's gear tags do. Marked on the
 * rendered page by module/rulebook/text-marks.js.
 *
 * The words are always marked, and the Rule Word Popups setting is read as
 * one is hovered, as the art previews read theirs, so turning it off or on
 * takes at once, in chat cards already posted too. The setting's root class
 * takes the words' bold away while it's off (styles/settings.css).
 */
const KEYWORD_CLASS = "bastionland-keyword";

/** A word that already explains itself on hover is left alone, as are headings and window titles. */
const LEAVE_ALONE = leaveAlone(KEYWORD_CLASS, "[data-tooltip]", "h1", "h2", "h3", "h4", ".window-header");

/**
 * The rule words, each keeping its tip until it's hovered.
 * @type {import("./text-marks.js").TextMark}
 */
export const KEYWORD_TIPS = Object.freeze({
	className: KEYWORD_CLASS,
	leaveAlone: LEAVE_ALONE,
	// Inside a button all the same: an item's gloss, such as "d8 hefty" in
	// "Polished mace (d8 hefty)". Its words take the hover, and a click still posts the item.
	markAnyway: ".bastionland-item__gloss",
	find: findKeywords,
	make: (document, { key }, words) => {
		const word = document.createElement("span");
		word.className = KEYWORD_CLASS;
		word.dataset.keyword = key;
		word.textContent = words;
		return word;
	}
});

/**
 * What a rule word's tip says: the book's own words for it, read by Import
 * PDF, or that Import PDF brings them until then. Read as it's hovered, so a
 * word marked before the book was read has the book's words once it is. The
 * book's own page references, such as Feat's "(p10)", are taken out: a tip
 * can't be clicked through to the rulebook.
 * @param {string} key Its entry in KEYWORDS.
 * @returns {string}
 */
export function keywordTip(key) {
	return withoutPageReferences(t(`keywords.${key}`)) || t("keywords.unread");
}

/**
 * Give a rule word its tip as the pointer reaches it, or take it away while
 * tips are off. This listens on the document, ahead of Foundry's tooltips,
 * which listen on the body and read `data-tooltip` as the pointer arrives.
 * @param {PointerEvent} event
 */
export function offerTip(event) {
	const word = event.target;
	if (!word?.classList?.contains(KEYWORD_CLASS)) return;
	if (showsKeywordTips()) word.dataset.tooltip = keywordTip(word.dataset.keyword);
	else delete word.dataset.tooltip;
}

/** Tip each window and chat card as it draws. Called during init. */
export function registerKeywordTips() {
	addTextMark(KEYWORD_TIPS);
	globalThis.document?.addEventListener?.("pointerenter", offerTip, { capture: true });
}
