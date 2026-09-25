/**
 * Bringing a Realm drawn on paper into the world: choosing the pictures,
 * keeping them under Data, and writing them to the Realm. Lining them up with
 * the hexes is canvas work and lives in canvas/map-alignment.js; what each hex
 * holds is still marked with the terrain brush afterwards.
 */
import { ensureDirectories, filePicker, uploadFile } from "../book-art/files.js";
import { ART_ROOT } from "../rules/book-art.js";
import { t } from "../chat/cards.js";
import { inputDialog } from "../apps/ui.js";
import { MAP_ROLES, REALM_MAP_DIR, fittedMapRect, layoutChoices } from "../rules/realm-map.js";
import { setMapPicture, placeMapPicture } from "../rules/realm-edits.js";
import { BOOK_LAYOUT, normaliseLayout } from "../rules/realm-geometry.js";
import { editRealm, getRealm, isRealmScene, sceneGeometry, setRealmLayout } from "./realm.js";

/** What a picture's file may be called, once the GM's own name for it is thrown away. */
const safeExtension = (file) => (String(file?.name ?? "").split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "png";

/**
 * Keep a picture of a Realm map under Data, outside any world, so every world
 * on the server can draw it and a system update can't take it away.
 * @param {File} file
 * @param {string} name What to call it, without an extension: a Scene's id and the picture's role.
 * @returns {Promise<string|null>} Where it was saved, or null if the server refused it.
 */
export async function keepMapPicture(file, name) {
	if (!file) return null;
	await ensureDirectories([ART_ROOT, REALM_MAP_DIR]);
	// Named for the Realm and the role, so choosing another picture writes over the last rather than leaving it behind.
	return uploadFile(REALM_MAP_DIR, new File([file], `${name}.${safeExtension(file)}`, { type: file.type }));
}

/**
 * How big a picture is, in its own pixels, so it can be laid on the map
 * without being stretched.
 * @param {string} src
 * @returns {Promise<{width: number, height: number}|null>} Null for a picture that won't load.
 */
export function measurePicture(src) {
	return new Promise((resolve) => {
		if (!src) {
			resolve(null);
			return;
		}
		const image = new Image();
		image.onload = () => resolve(image.naturalWidth > 0 && image.naturalHeight > 0 ? { width: image.naturalWidth, height: image.naturalHeight } : null);
		image.onerror = () => resolve(null);
		image.src = src;
	});
}

/**
 * @param {import("../rules/realm.js").Realm|null} [realm]
 * @param {object} [options]
 * @param {string} [options.layout] How the Realm's hexes are laid out now, one of REALM_LAYOUTS.
 * @returns {object} What the realm-picture fields need, for a dialog's context.
 */
export function mapPictureContext(realm = null, { layout = BOOK_LAYOUT } = {}) {
	return {
		mapRoles: MAP_ROLES.map((key) => ({
			key,
			label: t(`realm.picture.roles.${key}.label`),
			hint: t(`realm.picture.roles.${key}.hint`),
			src: realm?.picture?.[key]?.src ?? ""
		})),
		mapFromComputer: t("realm.picture.fromComputer"),
		mapOnServer: t("realm.picture.onServer"),
		mapEnlarge: t("realm.picture.enlarge"),
		mapLayouts: layoutChoices(layout).map((choice) => ({
			...choice,
			description: t(`realm.picture.layouts.${choice.key}`),
			caption: choice.book ? t("realm.picture.layouts.book") : null
		}))
	};
}

/**
 * @param {object} data A dialog's form data.
 * @returns {string} How the map's hexes are laid out, one of REALM_LAYOUTS.
 */
export const readMapLayout = (data) => normaliseLayout(data?.layout);

/**
 * The realm-picture fields in a dialog: a picture from the computer is kept
 * under Data as it's chosen, so the field always holds a path the map can be
 * drawn from, and one already on the server is used where it lies.
 * @param {HTMLElement} element The dialog.
 * @param {object} [options]
 * @param {string} [options.name] What to call the files kept, without the role.
 */
export function wireMapPictureFields(element, { name = foundry.utils.randomID() } = {}) {
	for (const group of element.querySelectorAll("[data-map-role]")) {
		const { mapRole: role } = group.dataset;
		const field = group.querySelector("[data-map-field]");
		const file = group.querySelector("[data-map-file]");
		const preview = group.querySelector("[data-map-preview]");

		const show = () => {
			const src = field?.value?.trim() ?? "";
			if (preview) {
				preview.hidden = !src;
				const img = preview.querySelector("img");
				if (img) img.src = src;
			}
		};
		const take = (path) => {
			if (!path || !field) return;
			field.value = path;
			show();
		};

		field?.addEventListener("input", show);
		group.querySelector("[data-map-upload]")?.addEventListener("click", () => {
			if (!file) return;
			// Cleared first, so choosing the same picture again still counts as a choice.
			file.value = "";
			file.click();
		});
		file?.addEventListener("change", async () => {
			const chosen = file.files?.[0];
			if (!chosen) return;
			const path = await keepMapPicture(chosen, `${name}-${role}`);
			if (path) take(`${path}?v=${Date.now()}`);
			else ui.notifications.warn(t("realm.picture.uploadFailed"));
		});
		group.querySelector("[data-map-browse]")?.addEventListener("click", async () => {
			// Made first, or a GM who hasn't uploaded a map yet is browsing a folder the server says isn't there.
			if (!field?.value) await ensureDirectories([ART_ROOT, REALM_MAP_DIR]);
			new (filePicker())({ type: "image", current: field?.value || REALM_MAP_DIR, callback: take }).render({ force: true });
		});
		// The preview is small beside a whole map, so it opens larger in a window of its own.
		// Its window is loaded only when it's opened, so the Realm's actions load without the window classes.
		group.querySelector("[data-map-enlarge]")?.addEventListener("click", async () => {
			const src = field?.value?.trim();
			if (!src) return;
			const { openArt } = await import("../apps/ArtPopout.js");
			openArt({ src, title: group.querySelector("label")?.textContent?.trim() || t("realm.picture.title") });
		});
		show();
	}
}

/**
 * @param {object} data A dialog's form data.
 * @returns {{players: {src: string}|null}} The pictures it chose.
 */
export function readMapPictures(data) {
	const picture = foundry.utils.expandObject(data ?? {}).picture ?? {};
	const map = (role) => {
		const src = String(picture[role] ?? "").trim();
		return src ? { src } : null;
	};
	return { players: map("players") };
}

/**
 * Give a Realm its pictures, or change them.
 * @param {Scene} scene
 * @param {{players: {src: string}|null}} picture
 * @returns {Promise<boolean>} Whether anything changed.
 */
export function setRealmPicture(scene, picture) {
	return editRealm(scene, (realm) => {
		let next = realm;
		for (const role of MAP_ROLES) {
			const chosen = picture[role];
			// A picture named the same as the one already there is the same picture, still where it was put, unless it's given a place of its own.
			if (chosen?.src && chosen.src === realm.picture?.[role]?.src && !(chosen.width > 0)) continue;
			next = setMapPicture(next, role, chosen);
		}
		return next;
	});
}

/**
 * Say where one of a Realm's pictures lies, after it has been lined up.
 * @param {Scene} scene
 * @param {string} role
 * @param {{x: number, y: number, width: number, height: number}} rect
 * @returns {Promise<boolean>}
 */
export const placeRealmPicture = (scene, role, rect) => editRealm(scene, (realm) => placeMapPicture(realm, role, rect));

/**
 * @param {Scene|null|undefined} scene
 * @returns {boolean} Whether a Realm is drawn by a picture rather than the system's own ink.
 */
export const hasRealmPicture = (scene) => Boolean(isRealmScene(scene) && getRealm(scene)?.realm.picture);

/**
 * Ask for the pictures a Realm is drawn by, and how the hexes on them are laid
 * out. Used for a Realm that already stands, so a GM can put their own map
 * under a Realm they rolled long ago, or change one that came out crooked.
 * @param {Scene} scene A Realm Scene.
 * @returns {Promise<{picture: {players: {src: string}|null}, layout: string}|null>} Null if closed.
 */
export async function askForRealmPicture(scene) {
	const realm = getRealm(scene)?.realm ?? null;
	const data = await inputDialog({
		title: t("realm.picture.title"),
		icon: "fa-solid fa-image",
		template: "realm-picture",
		context: { ...mapPictureContext(realm, { layout: sceneGeometry(scene).layout }), intro: t("realm.picture.intro") },
		ok: { label: t("realm.picture.use"), icon: "fa-solid fa-image" },
		position: { width: 480 },
		render: (_event, dialog) => wireMapPictureFields(dialog.element, { name: scene.id })
	});
	return data ? { picture: readMapPictures(data), layout: readMapLayout(data) } : null;
}

/**
 * Lay a Realm's hexes out anew where the GM chose another layout, and say so.
 * @param {Scene} scene
 * @param {string} layout
 * @returns {Promise<boolean>} Whether they were laid out anew.
 */
async function layOutAnew(scene, layout) {
	const { relaid, trimmed } = await setRealmLayout(scene, layout);
	if (relaid) ui.notifications.info(t(trimmed ? "realm.picture.relaidTrimmed" : "realm.picture.relaid"));
	return relaid;
}

/**
 * Wait for the canvas to finish drawing a Scene it's drawing again, such as
 * after its grid changed. A Scene not on the canvas, or already drawn, needs no
 * wait, and a draw that never ends is given up on rather than waited on forever.
 * @param {Scene} scene
 * @returns {Promise<void>}
 */
function canvasRedrawn(scene) {
	if (canvas.scene?.id !== scene.id || (canvas.ready && !canvas.loading)) return Promise.resolve();
	return new Promise((resolve) => {
		const timer = setTimeout(() => {
			Hooks.off("canvasReady", hook);
			resolve();
		}, 15000);
		const hook = Hooks.once("canvasReady", () => {
			clearTimeout(timer);
			resolve();
		});
	});
}

/**
 * Put a picture under a Realm that already stands, then line it up. A GM who
 * clears the players' picture takes the pictures away altogether and the Realm
 * goes back to being drawn in the system's own ink.
 * @param {Scene} scene
 * @returns {Promise<boolean>} Whether the Realm changed.
 */
export async function changeRealmPicture(scene) {
	if (!game.user.isGM || !isRealmScene(scene)) return false;
	const asked = await askForRealmPicture(scene);
	if (!asked) return false;
	const { picture, layout } = asked;
	if (!picture.players) {
		const cleared = await setRealmPicture(scene, picture);
		if (cleared) ui.notifications.info(t("realm.picture.cleared"));
		// A layout chosen in the same window still counts, with no picture to line up on it.
		return (await layOutAnew(scene, layout)) || cleared;
	}

	// The picture first, so a Realm laid out anew lays out the picture it's getting.
	// One chosen before pictures were measured lay stretched over the whole map, so it's laid out again too.
	const src = picture.players.src;
	const kept = getRealm(scene)?.realm.picture?.players;
	const fresh = src !== kept?.src || !(kept?.width > 0);
	if (fresh) picture.players = { src, ...fittedMapRect(sceneGeometry(scene), await measurePicture(src)) };
	let changed = await setRealmPicture(scene, picture);
	const relaid = await layOutAnew(scene, layout);
	changed ||= relaid;
	// New hexes redraw the whole map, and lining up started before that's done is torn down with it.
	if (relaid) await canvasRedrawn(scene);
	// A picture only just chosen, or one on hexes just laid out anew, lies as large
	// as fits on the map until it's lined up, so the GM slides it into place. One
	// they kept as it was is offered the same way: Escape puts it back exactly
	// where it lay.
	const { startMapAlignment } = await import("../canvas/map-alignment.js");
	await startMapAlignment(scene, { role: "players" });
	return changed;
}
