import { t } from "../chat/cards.js";
import { pageReferences } from "../rules/rulebook.js";
import { openRulebook } from "./BookReader.js";
import { canReadRulebook, hasRulebook } from "./store.js";

/**
 * Every "(p16)" in the system's windows and chat cards opens the rulebook at
 * that page. Done on the rendered page rather than in each string, so a hint
 * written tomorrow links without anyone remembering to.
 */
const LINK_CLASS = "bastionland-page-link";

/** What every chat card the system posts is wrapped in. */
const CARD_CLASS = "bastionland-card";

/** Text that's being typed into, or already does something when clicked. */
const LEAVE_ALONE = "a, button, input, textarea, select, option, script, style, code, pre, [contenteditable], prose-mirror, .bastionland-page-link";

/**
 * Turn the page references under an element into links. Left as plain text
 * for anyone who couldn't open the book anyway.
 * @param {HTMLElement} root
 */
export function linkPageReferences(root) {
	if (!root?.ownerDocument || !hasRulebook() || !canReadRulebook()) return;

	const document = root.ownerDocument;
	const found = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	while (walker.nextNode()) {
		const node = walker.currentNode;
		const references = pageReferences(node.nodeValue);
		if (references.length && !node.parentElement?.closest(LEAVE_ALONE)) found.push({ node, references });
	}

	for (const { node, references } of found) {
		const text = node.nodeValue;

		const pieces = document.createDocumentFragment();
		let from = 0;
		for (const { index, length, page } of references) {
			pieces.append(text.slice(from, index));
			const link = document.createElement("a");
			link.className = LINK_CLASS;
			link.dataset.rulebookPage = String(page);
			link.dataset.tooltip = t("rulebook.openPage", { page });
			link.textContent = text.slice(index, index + length);
			pieces.append(link);
			from = index + length;
		}
		pieces.append(text.slice(from));
		node.replaceWith(pieces);
	}
}

/** Link each window and chat card as it draws, and answer the clicks. Called during init. */
export function registerPageLinks() {
	Hooks.on("renderApplicationV2", (_app, element) => {
		if (isSystemWindow(element)) linkPageReferences(element);
	});
	// Only the system's own cards: what players type and other modules post keep their "p2" as it is.
	Hooks.on("renderChatMessageHTML", (_message, element) => {
		for (const card of element?.querySelectorAll?.(`.${CARD_CLASS}`) ?? []) linkPageReferences(card);
	});

	globalThis.document?.addEventListener?.("click", onClick, { capture: true });
}

/**
 * Only this system's windows and dialogs, which all carry a "bastionland" class;
 * Foundry's own and other modules' "p3" are left as they are.
 * @param {HTMLElement} element
 */
function isSystemWindow(element) {
	return [...(element?.classList ?? [])].some((name) => name.startsWith("bastionland"));
}

/** @param {MouseEvent} event */
function onClick(event) {
	const link = event.target instanceof Element ? event.target.closest(`.${LINK_CLASS}`) : null;
	if (!link) return;
	event.preventDefault();
	event.stopPropagation();
	openRulebook({ page: Number(link.dataset.rulebookPage) });
}
