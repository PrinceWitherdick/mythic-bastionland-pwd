import { isRealmScene } from "../actions/realm.js";
import { openPlaces } from "../apps/TravelsPlaces.js";
import { setVisitedMarksShown, visitedMarksShown } from "./visited-marks.js";

/**
 * Two tools among the Token tools everyone already has, on a Realm alone:
 * one shows or hides the marks of where the Company has been, the other opens
 * the Company's record of the places it has been. Players never leave the
 * Token tools for them, so nobody loses the Token they had in hand.
 */

/** The tools' names among the Token tools. */
export const TRAVELS_TOOLS = Object.freeze({ marks: "bastionlandVisitedMarks", places: "bastionlandPlaces" });

/**
 * Add the tools to the Token controls, on a Realm Scene.
 * @param {Record<string, object>} controls As `getSceneControlButtons` gives them.
 */
export function addTravelsTools(controls) {
	const tools = controls?.tokens?.tools;
	if (!tools || !isRealmScene(globalThis.canvas?.scene)) return;
	const after = Math.max(0, ...Object.values(tools).map((tool) => Number(tool.order) || 0));
	tools[TRAVELS_TOOLS.marks] = {
		name: TRAVELS_TOOLS.marks,
		order: after + 1,
		title: "bastionland.travels.controls.marks",
		icon: "fa-solid fa-shoe-prints",
		toggle: true,
		active: visitedMarksShown(),
		onChange: (_event, toggled) => setVisitedMarksShown(toggled)
	};
	tools[TRAVELS_TOOLS.places] = {
		name: TRAVELS_TOOLS.places,
		order: after + 2,
		title: "bastionland.travels.controls.places",
		icon: "fa-solid fa-map-location-dot",
		button: true,
		onChange: () => openPlaces()
	};
}

/** Called during init. */
export function registerTravelsControls() {
	Hooks.on("getSceneControlButtons", addTravelsTools);
}
