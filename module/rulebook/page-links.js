import { t } from "../chat/cards.js";
import { pageReferences } from "../rules/rulebook.js";
import { openRulebook } from "./BookReader.js";
import { canReadRulebook, hasRulebook } from "./store.js";
import { addTextMark, leaveAlone } from "./text-marks.js";

/**
 * Every "(p16)" in the system's windows and chat cards opens the rulebook at
 * that page. Marked on the rendered page by module/rulebook/text-marks.js.
 */
const LINK_CLASS = "bastionland-page-link";

/**
 * The page references, as links. Left as plain text for anyone who couldn't
 * open the book anyway.
 * @type {import("./text-marks.js").TextMark}
 */
export const PAGE_LINKS = Object.freeze({
	className: LINK_CLASS,
	leaveAlone: leaveAlone(LINK_CLASS),
	enabled: () => hasRulebook() && canReadRulebook(),
	find: pageReferences,
	make: (document, { page }, words) => {
		const link = document.createElement("a");
		link.className = LINK_CLASS;
		link.dataset.rulebookPage = String(page);
		link.dataset.tooltip = t("rulebook.openPage", { page });
		link.textContent = words;
		return link;
	}
});

/** Link each window and chat card as it draws, and answer the clicks. Called during init. */
export function registerPageLinks() {
	addTextMark(PAGE_LINKS);
	globalThis.document?.addEventListener?.("click", onClick, { capture: true });
}

/** @param {MouseEvent} event */
function onClick(event) {
	const link = event.target instanceof Element ? event.target.closest(`.${LINK_CLASS}`) : null;
	if (!link) return;
	event.preventDefault();
	event.stopPropagation();
	openRulebook({ page: Number(link.dataset.rulebookPage) });
}
