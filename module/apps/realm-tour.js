import { isRealmDocument } from "../rules/realm-documents.js";
import { SYSTEM_ID } from "../system-id.js";

/**
 * Foundry Tours for a new world's GM. The first shows where Realms are made:
 * the Scenes tab, then the New Realm button at its top. A new world starts it
 * when its Welcome is first closed. The second shows the two buttons a Realm
 * puts beside the sidebar, and starts once the world's first Realm is made.
 * After that both wait in Foundry's Tours window, under the system's name, to
 * be played again.
 */

/** Its id among the system's Tours; game.tours keys it `${SYSTEM_ID}.newRealm`. */
export const REALM_TOUR = "newRealm";

/** A little over the 250ms Foundry's stylesheet takes to slide the sidebar open. */
const SIDEBAR_SLIDE_MS = 300;

/** The Tour as Foundry reads it: two steps, each opening the sidebar tab it points into. */
export const REALM_TOUR_CONFIG = Object.freeze({
	title: "bastionland.realmTour.title",
	description: "bastionland.realmTour.description",
	// For GMs only, as New Realm is.
	restricted: true,
	display: true,
	steps: [
		{
			id: "scenes",
			selector: "#sidebar-tabs [data-tab='scenes']",
			sidebarTab: "scenes",
			tooltipDirection: "LEFT",
			title: "bastionland.realmTour.scenes.title",
			content: "bastionland.realmTour.scenes.content"
		},
		{
			id: "newRealm",
			// The button addNewRealmButton puts in the Scenes directory.
			selector: "#scenes .bastionland-new-realm",
			sidebarTab: "scenes",
			tooltipDirection: "LEFT",
			title: "bastionland.realmTour.newRealm.title",
			content: "bastionland.realmTour.newRealm.content"
		}
	]
});

/** Its id among the system's Tours; game.tours keys it `${SYSTEM_ID}.realmButtons`. */
export const REALM_BUTTONS_TOUR = "realmButtons";

/** The column of buttons travels-controls.js puts beside the sidebar on a Realm. */
const REALM_BUTTONS = "#bastionland-travels-buttons";

/** The second Tour: Mark the Hexes Visited, then Places, beside the sidebar. */
export const REALM_BUTTONS_TOUR_CONFIG = Object.freeze({
	title: "bastionland.realmButtonsTour.title",
	description: "bastionland.realmButtonsTour.description",
	restricted: true,
	display: true,
	steps: [
		{
			id: "marks",
			selector: `${REALM_BUTTONS} [data-action='visitedMarks']`,
			tooltipDirection: "LEFT",
			title: "bastionland.realmButtonsTour.marks.title",
			content: "bastionland.realmButtonsTour.marks.content"
		},
		{
			id: "places",
			selector: `${REALM_BUTTONS} [data-action='places']`,
			tooltipDirection: "LEFT",
			title: "bastionland.realmButtonsTour.places.title",
			content: "bastionland.realmButtonsTour.places.content"
		}
	]
});

/**
 * Bring a sidebar tab forward, opening the sidebar if it was closed, and wait
 * until it is there to point at.
 * @param {string} [name] The tab, as `ui` holds it, e.g. "scenes".
 */
export async function showSidebarTab(name) {
	const tab = name ? ui[name] : null;
	if (!tab) return;
	const sliding = !ui.sidebar.expanded;
	tab.activate();
	if (!tab.rendered) await tab.render({ force: true });
	// A step's highlight is measured once, so a sidebar still sliding open would leave it short of its mark.
	if (sliding) await new Promise((resolve) => setTimeout(resolve, SIDEBAR_SLIDE_MS));
}

/**
 * Foundry's own sidebar Tour opens each step's tab only for its own steps, so
 * this one does it for the Realm's.
 * @param {typeof foundry.nue.Tour} Tour
 */
const realmTourClass = (Tour) => class RealmTour extends Tour {
	/** @override */
	async _preStep() {
		await super._preStep();
		await showSidebarTab(this.currentStep?.sidebarTab);
	}
};

/** Register the Tours. Called during setup, once core's settings, which keep each Tour's progress, are there. */
export function registerRealmTour() {
	const RealmTour = realmTourClass(foundry.nue.Tour);
	game.tours.register(SYSTEM_ID, REALM_TOUR, new RealmTour(REALM_TOUR_CONFIG));
	game.tours.register(SYSTEM_ID, REALM_BUTTONS_TOUR, new RealmTour(REALM_BUTTONS_TOUR_CONFIG));
}

/** @returns {boolean} Whether any Scene in the world holds a Realm. */
const worldHasRealm = () => game.scenes.some(isRealmDocument);

/**
 * Start one of the system's Tours, saying in the console if it can't be shown.
 * @param {string} id
 * @param {string} failure What couldn't be shown, for the console.
 */
async function startTour(id, failure) {
	const tour = game.tours.get(`${SYSTEM_ID}.${id}`);
	try {
		// Started again from its first step, however far a Tour seen in another world got.
		await tour?.start();
	} catch (error) {
		console.error(`${SYSTEM_ID} | ${failure}`, error);
	}
}

/**
 * Walk a new world's GM to New Realm once the Welcome that greeted them is
 * closed. Not once a Realm is made, as the chat card beside the Welcome may
 * already have done, nor over another Tour still on screen.
 */
export async function showWhereRealmsAreMade() {
	if (!game.user.isGM || worldHasRealm() || foundry.nue.Tour.tourInProgress) return;
	await startTour(REALM_TOUR, "Couldn't show where Realms are made");
}

/**
 * Show the GM the buttons beside the sidebar once the world's first Realm is
 * made and in view. Not for a second Realm, nor while the buttons are hidden
 * because another Scene is in view, nor over another Tour still on screen.
 */
export async function showRealmButtons() {
	if (!game.user.isGM || foundry.nue.Tour.tourInProgress) return;
	if (game.scenes.filter(isRealmDocument).length !== 1) return;
	if (document.querySelector(REALM_BUTTONS)?.hidden !== false) return;
	await startTour(REALM_BUTTONS_TOUR, "Couldn't show the Realm's buttons");
}
