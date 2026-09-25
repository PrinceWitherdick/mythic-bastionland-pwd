/**
 * A tall dialog laid out as a rail of pages down its left side, as Stonetop's
 * welcome window is: a tab on the rail shows its page and names it in the
 * banner over the pages. The pages are only hidden, never re-rendered, so what
 * is filled in on one is still there on coming back, and all of them are sent
 * with the form. A window that is drawn again, such as Creating a Realm, marks
 * the page it was on in its template and hears of each change through onShow.
 */

/**
 * Wire up the rail in a dialog.
 * @param {HTMLElement} element The dialog.
 * @param {object} [options]
 * @param {(key: string) => void} [options.onShow] Told the key of each page a tab shows.
 */
export function wireDialogRail(element, { onShow } = {}) {
	const rail = element.querySelector("[data-rail]");
	if (!rail) return;
	const tabs = [...rail.querySelectorAll("[data-rail-tab]")];
	const pages = [...rail.querySelectorAll("[data-rail-page]")];
	const icon = rail.querySelector("[data-rail-banner-icon]");
	const title = rail.querySelector("[data-rail-banner-title]");
	const main = rail.querySelector(".bastionland-rail-dialog__main");

	const show = (tab) => {
		const key = tab.dataset.railTab;
		for (const other of tabs) {
			const active = other === tab;
			other.classList.toggle("is-active", active);
			if (active) other.setAttribute("aria-current", "true");
			else other.removeAttribute("aria-current");
		}
		for (const page of pages) page.hidden = page.dataset.railPage !== key;
		if (icon) icon.className = `fa-solid ${tab.dataset.railIcon}`;
		if (title) title.textContent = tab.textContent.trim();
		// Each page starts at its top, not wherever the last one was scrolled to.
		if (main) main.scrollTop = 0;
		onShow?.(key);
	};
	for (const tab of tabs) tab.addEventListener("click", () => show(tab));
}
