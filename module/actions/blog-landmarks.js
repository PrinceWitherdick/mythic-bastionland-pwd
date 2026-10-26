/**
 * The world setting that brings in the six Landmarks from Chris McDowall's blog
 * post More Landmarks: rolled into new Realms and offered in the Referee's
 * pickers while it's on. Landmarks already placed stay either way. Off by
 * default, as they aren't the book's.
 */
import { renderOpenWindows } from "../apps/ui.js";
import { read } from "../client-settings.js";
import { offeredLandmarkTypes } from "../rules/realm.js";
import { SYSTEM_ID } from "../system-id.js";

export const BLOG_LANDMARKS_SETTING = "blogLandmarks";

/** @returns {boolean} Whether the blog's Landmarks are rolled and offered. */
export const blogLandmarksOn = () => read(BLOG_LANDMARKS_SETTING, false) === true;

/** @returns {string[]} The kinds of Landmark the Referee's pickers offer now. */
export const offeredLandmarks = () => offeredLandmarkTypes(blogLandmarksOn());

/** The windows whose pickers offer Landmarks, redrawn when the setting changes. */
const LANDMARK_PICKERS = Object.freeze(["bastionland-realm-panel-window", "bastionland-realm-drawing", "bastionland-hex-editor-window"]);

/** Register the setting. Called during init. */
export function registerBlogLandmarks() {
	game.settings.register(SYSTEM_ID, BLOG_LANDMARKS_SETTING, {
		name: "bastionland.blogLandmarks.setting.name",
		hint: "bastionland.blogLandmarks.setting.hint",
		scope: "world",
		config: true,
		type: Boolean,
		default: false,
		onChange: () => {
			renderOpenWindows(...LANDMARK_PICKERS);
			globalThis.canvas?.realm?.redrawTool?.();
		}
	});
}
