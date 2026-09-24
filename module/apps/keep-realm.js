/**
 * Looking a freshly rolled Realm over before it's kept. A Realm is rolled onto
 * its Scene before the Referee has seen it, so a small window stands at the
 * foot of the map, out of the way of the map itself: Roll again lays another
 * Realm on the same Scene, as often as they like, and Keep this Realm has done
 * with it. Only what they keep is thumbnailed, given the Company and whispered
 * to the Referees as a Realm Key.
 */
import { t } from "../chat/cards.js";
import { finishPlacement } from "../rules/realm-drawing.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { hotbarFloor, mapOnScreen } from "./map-screen.js";

/** What the window is taken for until it's been laid out, so it's placed from the first. */
const UNMEASURED = Object.freeze({ width: 340, height: 220 });

/** The class on the button while a Realm is being rolled, which turns its die. */
const ROLLING = "is-rolling";

/**
 * What the window says about the Realm as it stands: what was rolled onto the
 * map, and the seed it came from.
 * @param {import("../rules/realm.js").Realm} realm
 * @returns {{tally: string, seed: string}}
 */
export function keepRealmLines(realm) {
	// A river of a single hex is no river, as the drawing tally counts them.
	const rivers = realm.rivers.filter((river) => river.length > 1).length;
	const counts = t("realm.keep.counts", {
		holdings: realm.holdings.length,
		myths: realm.myths.length,
		landmarks: realm.landmarks.length,
		barriers: realm.barriers.length
	});
	const river = rivers === 0 ? t("realm.keep.noRiver") : rivers === 1 ? t("realm.keep.river") : t("realm.keep.rivers", { rivers });
	return { tally: `${counts} ${river}`, seed: realm.seed };
}

/**
 * Hold the window over the foot of the map, centred on it and clear of the
 * hotbar, the way the Finish button stands under a Realm being drawn.
 * @param {{width: number, height: number}} size The window's own, in CSS pixels.
 * @returns {{left: number, top: number}|null} Null with no map on screen, where Foundry's own placing stands.
 */
function placement(size) {
	const map = mapOnScreen();
	if (!map) return null;
	const { left, top } = finishPlacement(map, { ...size, floor: hotbarFloor() });
	// Never so high that the title bar is off the screen and the window can't be dragged back.
	return { left, top: Math.max(0, top) };
}

/**
 * Show a Realm's lines in a window already up.
 * @param {HTMLElement} element The window.
 * @param {import("../rules/realm.js").Realm} realm
 */
function showRealm(element, realm) {
	const { tally, seed } = keepRealmLines(realm);
	const write = (selector, text) => {
		const node = element.querySelector(selector);
		if (node) node.textContent = text;
	};
	write("[data-keep-tally]", tally);
	write("[data-keep-seed]", seed);
}

/**
 * Show the Referee what was rolled and let them roll again until they like it.
 * Each roll is laid on the Scene as it's made, so they're looking at the Realm
 * itself rather than a picture of one; what follows from a new Realm waits
 * until the window is closed.
 * @param {object} options
 * @param {import("../rules/realm.js").Realm} options.realm What's on the map now.
 * @param {() => Promise<import("../rules/realm.js").Realm|null>} options.roll Rolls another onto the same Scene.
 * @returns {Promise<import("../rules/realm.js").Realm>} The Realm they kept.
 */
export async function askToKeepRealm({ realm, roll }) {
	let shown = realm;
	/** @type {Promise<void>|null} The roll being laid on the Scene, while there is one. */
	let rolling = null;
	const content = await foundry.applications.handlebars.renderTemplate(templatePath("dialogs/keep-realm.hbs"), keepRealmLines(realm));

	/**
	 * Roll another Realm onto the Scene and say what it holds. The button waits
	 * on the roll, so an impatient hand can't set two going at once.
	 * @param {HTMLElement} element The window.
	 * @param {HTMLButtonElement} button
	 * @returns {Promise<void>} Once the Realm is on the Scene. Never rejects: a roll that fails is reported and let go.
	 */
	const rollAgain = (element, button) => {
		if (rolling) return rolling;
		button.disabled = true;
		button.classList.add(ROLLING);
		rolling = (async () => {
			try {
				shown = (await roll()) ?? shown;
				showRealm(element, shown);
			} catch (error) {
				console.error(`${SYSTEM_ID} | Couldn't roll another Realm`, error);
				ui.notifications.error(t("realm.keep.failed"));
			} finally {
				rolling = null;
				button.disabled = false;
				button.classList.remove(ROLLING);
			}
		})();
		return rolling;
	};

	await foundry.applications.api.DialogV2.wait({
		window: { title: t("realm.keep.title"), icon: "fa-solid fa-dice" },
		classes: ["bastionland-dialog"],
		position: { width: UNMEASURED.width, ...(placement(UNMEASURED) ?? {}) },
		content,
		buttons: [{ action: "keep", label: t("realm.keep.keep"), icon: "fa-solid fa-check", default: true }],
		// Closing the window keeps what's on the map: the Realm is already rolled onto its Scene.
		rejectClose: false,
		render: (_event, dialog) => {
			const element = dialog.element;
			const button = element?.querySelector("[data-keep-again]");
			if (!button || button.dataset.wired) return;
			button.dataset.wired = "true";
			button.addEventListener("click", () => rollAgain(element, button));
			// Placed again now it has been laid out, so the guess above is only ever a moment's worth.
			const measured = element.getBoundingClientRect();
			const place = placement({ width: measured.width || UNMEASURED.width, height: measured.height || UNMEASURED.height });
			if (place) dialog.setPosition(place);
		}
	});
	// A roll set going as the window was closed is still being written: the Company
	// and the Realm Key wait for it, so they're taken from the Realm that was kept.
	await rolling;
	return shown;
}
