import { isRealmScene } from "../actions/realm.js";
import { openPlaces } from "../apps/TravelsPlaces.js";
import { openVisitedMarks } from "../apps/VisitedMarks.js";
import { setVisitedMarksShown, visitedMarksShown } from "./visited-marks.js";

/**
 * Two buttons stacked in a column of their own just left of the sidebar, on a
 * Realm alone: one shows or hides the marks of where the Company has been, the
 * other opens the Company's record of the places it has been. A right-click on
 * the first chooses which mark, and its colour. Out of the Token
 * tools, so they are there whichever tool is in hand.
 *
 * They go inside core's chat column, `#ui-right-column-1`, at its top and
 * right-aligned. That column is as wide as the sidebar and sits one gap left
 * of it, so the buttons land against the sidebar and follow it when it folds,
 * with no measuring. A third item beside the column would widen `#ui-right`
 * and push the chat stack, and the roll-mode buttons core pins to it, away
 * from the sidebar. The chat stack carries `order: 99`, so it stays below the
 * buttons whenever core draws it again.
 */

/** The column's element id, and the buttons' actions. */
export const TRAVELS_BUTTONS_ID = "bastionland-travels-buttons";
export const TRAVELS_BUTTONS = Object.freeze({ marks: "visitedMarks", places: "places" });

/**
 * A button in core's own interface dress: `ui-control` is the square, the
 * palettes and the pressed state; `faded-ui` the idle translucency the chat
 * stack and the sidebar's tabs wear beside it. The icon is on a child, so the
 * system's button font doesn't take the glyph.
 * @param {string} action
 * @param {string} icon
 * @param {string} label
 * @param {(event: MouseEvent) => unknown} onClick
 * @param {(event: MouseEvent) => unknown} [onRightClick]
 * @returns {HTMLButtonElement}
 */
function controlButton(action, icon, label, onClick, onRightClick) {
	const button = document.createElement("button");
	button.type = "button";
	button.className = "ui-control faded-ui icon";
	button.dataset.action = action;
	const text = game.i18n.localize(label);
	button.dataset.tooltip = text;
	button.setAttribute("aria-label", text);
	const glyph = document.createElement("i");
	glyph.className = icon;
	glyph.inert = true;
	button.append(glyph);
	button.addEventListener("click", (event) => {
		event.preventDefault();
		return onClick(event);
	});
	if (onRightClick) {
		button.addEventListener("contextmenu", (event) => {
			event.preventDefault();
			return onRightClick(event);
		});
	}
	return button;
}

/** @returns {HTMLElement|null} The column, made and put in place the first time it's asked for. */
function mountTravelsButtons() {
	const existing = document.getElementById(TRAVELS_BUTTONS_ID);
	if (existing?.isConnected) return existing;
	const right = document.getElementById("ui-right");
	if (!right) return null;

	const column = document.createElement("div");
	column.id = TRAVELS_BUTTONS_ID;
	column.hidden = true;
	column.append(
		controlButton(TRAVELS_BUTTONS.marks, "fa-solid fa-shoe-prints", "bastionland.travels.controls.marks", async () => {
			await setVisitedMarksShown(!visitedMarksShown());
			refreshTravelsButtons();
		}, openVisitedMarks),
		controlButton(TRAVELS_BUTTONS.places, "fa-solid fa-map-location-dot", "bastionland.travels.controls.places", () => openPlaces())
	);

	// Core's chat column when it's there; failing that, before the sidebar.
	const chatColumn = document.getElementById("ui-right-column-1");
	const sidebar = document.getElementById("sidebar");
	if (chatColumn?.parentElement === right) chatColumn.prepend(column);
	else if (sidebar?.parentElement === right) right.insertBefore(column, sidebar);
	else right.append(column);
	return column;
}

/** Show the column on a Realm Scene and hide it elsewhere, with the marks' button saying whether they're shown. */
export function refreshTravelsButtons() {
	const onRealm = isRealmScene(globalThis.canvas?.scene);
	const column = onRealm ? mountTravelsButtons() : document.getElementById(TRAVELS_BUTTONS_ID);
	if (!column) return;
	column.hidden = !onRealm;
	column.querySelector(`[data-action="${TRAVELS_BUTTONS.marks}"]`)?.setAttribute("aria-pressed", String(visitedMarksShown()));
}
