import { SHIELD_CLIPS, boundingBoxPath } from "../rules/heraldry.js";

/**
 * Put the shield's clip paths on the page once, for the stylesheet to clip the
 * sheet's shield and the painter's larger one with. Each scales to the box it
 * clips, so one path serves both sizes. Called during init.
 */
export function installShieldClips() {
	const clips = Object.entries(SHIELD_CLIPS)
		.map(([id, { path, width, height }]) => `<clipPath id="${id}" clipPathUnits="objectBoundingBox"><path clip-rule="evenodd" d="${boundingBoxPath(path, width, height)}"/></clipPath>`)
		.join("");
	const holder = document.createElement("div");
	holder.innerHTML = `<svg width="0" height="0" aria-hidden="true" style="position: absolute"><defs>${clips}</defs></svg>`;
	document.body.append(holder.firstElementChild);
}
