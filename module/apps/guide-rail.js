// A long window broken into sections, picked from a column of named tabs down
// its left side, the way Stonetop's Welcome guide does it. The sections switch
// in place, without drawing the window again.
//
// The template holds a `.bastionland-guide` with a `.bastionland-guide__rail`
// of `[data-guide-tab]` buttons and a `.bastionland-guide__main` of
// `[data-guide-panel]` sections, every one but the first shown already hidden.
// The window needs the `bastionland-guide-dialog` class for its layout.

/**
 * Show one section and mark its tab on the rail.
 * @param {HTMLElement} root  Holds the rail and the sections.
 * @param {string} key        The section's `data-guide-panel`.
 * @returns {boolean} Whether there was such a section.
 */
export function showGuideSection(root, key) {
	const panels = [...root.querySelectorAll("[data-guide-panel]")];
	if (!panels.some((panel) => panel.dataset.guidePanel === key)) return false;
	for (const panel of panels) panel.hidden = panel.dataset.guidePanel !== key;
	for (const tab of root.querySelectorAll("[data-guide-tab]")) {
		const active = tab.dataset.guideTab === key;
		tab.classList.toggle("is-active", active);
		if (active) tab.setAttribute("aria-current", "true");
		else tab.removeAttribute("aria-current");
	}
	// A long section read to its end would leave the next one scrolled down.
	const main = root.querySelector(".bastionland-guide__main");
	if (main) main.scrollTop = 0;
	return true;
}

/**
 * Switch sections from the rail.
 * @param {HTMLElement} root
 * @param {(key: string) => void} [onShow] Told each section shown, so it can be opened at again.
 */
export function wireGuideRail(root, onShow) {
	root?.querySelector(".bastionland-guide__rail")?.addEventListener("click", (event) => {
		const key = event.target.closest("[data-guide-tab]")?.dataset.guideTab;
		if (key && showGuideSection(root, key)) onShow?.(key);
	});
}
