import { isRealmDocument } from "../rules/realm-documents.js";
import { SYSTEM_ID } from "../system-id.js";

/**
 * A Foundry Tour that shows the GM where Realms are made: the Scenes tab, then
 * the New Realm button at its top. A new world starts it when its Welcome is
 * first closed. After that it waits in Foundry's Tours window, under the
 * system's name, to be played again.
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

/** Register the Tour. Called during setup, once core's settings, which keep each Tour's progress, are there. */
export function registerRealmTour() {
	const RealmTour = realmTourClass(foundry.nue.Tour);
	game.tours.register(SYSTEM_ID, REALM_TOUR, new RealmTour(REALM_TOUR_CONFIG));
}

/** @returns {boolean} Whether any Scene in the world holds a Realm. */
const worldHasRealm = () => game.scenes.some(isRealmDocument);

/**
 * Walk a new world's GM to New Realm once the Welcome that greeted them is
 * closed. Not once a Realm is made, as the chat card beside the Welcome may
 * already have done, nor over another Tour still on screen.
 */
export async function showWhereRealmsAreMade() {
	if (!game.user.isGM || worldHasRealm() || foundry.nue.Tour.tourInProgress) return;
	const tour = game.tours.get(`${SYSTEM_ID}.${REALM_TOUR}`);
	try {
		// Started again from its first step, however far a Tour seen in another world got.
		await tour?.start();
	} catch (error) {
		console.error(`${SYSTEM_ID} | Couldn't show where Realms are made`, error);
	}
}
