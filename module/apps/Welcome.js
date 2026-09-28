import { knightTheCompany, waitingPlayers } from "../actions/welcome-company.js";
import { loadArtIndex } from "../book-art/art-index.js";
import { ART_ROOT, EXPECTED_PAGES } from "../rules/book-art.js";
import { COMPANY_MAX, COMPANY_MIN, clampCompany, suggestedCompany } from "../rules/welcome-company.js";
import { openRulebook } from "../rulebook/BookReader.js";
import { bringInRulebook, importKeptRulebook } from "../rulebook/bring-in.js";
import { RULEBOOK_DIR, RULEBOOK_HOOK, foundRulebook, rulebookPath, setFoundRulebook } from "../rulebook/store.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { hasHadSetup, isSetupDone } from "../world-setup.js";
import { chooseLocalFiles, singletonOpener } from "./ui.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The window a new world greets its GM with. The rulebook isn't shipped, so
 * what it offers is the GM's own PDF, chosen once: a copy is kept to read in
 * Foundry, and Import PDF takes its art and text. A world that found the book
 * another world kept imports it by itself instead.
 */

/** World setting: whether the Welcome opens for GMs when the world loads, until one of them first closes it. */
const SHOW_SETTING = "showWelcome";

/** The world setup step that decides whether this world is new enough to be welcomed. */
export const WELCOME_STEP = "welcome";

/** Register the setting, and put the Welcome among the system's settings for GMs. Called during init. */
export function registerWelcome() {
	game.settings.register(SYSTEM_ID, SHOW_SETTING, {
		scope: "world",
		config: false,
		type: Boolean,
		default: true
	});
	game.settings.registerMenu(SYSTEM_ID, "welcome", {
		name: "bastionland.welcome.title",
		label: "bastionland.welcome.open",
		hint: "bastionland.welcome.hint",
		icon: "fa-solid fa-chess-rook",
		type: Welcome,
		restricted: true
	});
}

/**
 * The Welcome's world setup step. Every world starts out showing it, so one
 * already in play before the Welcome existed is told not to: it was loaded
 * under this system before, or it holds things a new world wouldn't.
 * Must run before any other step marks this load as done.
 */
export async function welcomeOnlyNewWorlds() {
	const inPlay = hasHadSetup() || game.actors.size > 0 || game.scenes.size > 0 || game.journal.size > 0;
	if (inPlay) await game.settings.set(SYSTEM_ID, SHOW_SETTING, false);
}

/** @returns {boolean} Whether the Welcome still greets this world, so it counts as new. */
export const welcomesThisWorld = () => Boolean(game.settings.get(SYSTEM_ID, SHOW_SETTING));

/**
 * Open the Welcome for a GM, once world setup has said whether this world is
 * new and until a GM has closed it.
 */
export function greetGM() {
	if (!game.user.isGM || !isSetupDone(WELCOME_STEP)) return;
	if (game.settings.get(SYSTEM_ID, SHOW_SETTING)) openWelcome();
}

/**
 * @param {string|undefined} iso
 * @returns {string|null} A date to show, or null if there's none to read.
 */
function importDate(iso) {
	const date = new Date(iso ?? "");
	return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(game.i18n.lang, { dateStyle: "long" });
}

/**
 * @param {""|"pending"|"done"} found What became of a book found kept by another world.
 * @param {boolean} busy Whether an import is under way.
 * @returns {string|null} The key of what the Welcome says about it, or null when none was found.
 */
export function foundText(found, busy) {
	if (!found) return null;
	return `bastionland.welcome.book.found.${busy ? "importing" : found}`;
}

export class Welcome extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: "bastionland-welcome",
		classes: [SYSTEM_ID, "bastionland", "bastionland-welcome-window"],
		position: { width: 580, height: "auto" },
		window: { title: "bastionland.welcome.title", icon: "fa-solid fa-chess-rook", resizable: true },
		actions: {
			choose: Welcome.#onChoose,
			read: Welcome.#onRead,
			companyStep: Welcome.#onCompanyStep,
			knightCompany: Welcome.#onKnightCompany,
			finish: Welcome.#onFinish
		}
	};

	static PARTS = {
		welcome: { template: templatePath("apps/welcome.hbs") }
	};

	/** Whether an import is under way, which holds every control still. */
	#busy = false;

	/** @type {number|null} */
	#hook = null;

	/** Redraws the Company's count as players sign in and out. @type {number|null} */
	#userHook = null;

	/** How many Knights the GM counted, or null to follow the players signed in. @type {number|null} */
	#company = null;

	/** Whether the Company's Knights are being made. */
	#knighting = false;

	/** What the last Knight Those Subjects made. @type {{made: number, given: string[]}|null} */
	#knighted = null;

	/** The art index, read once and again only after an import. @type {Promise<object|null>|null} */
	#index = null;

	/** @returns {number} The Knights to make: as counted by hand, or one for each player waiting. */
	get #companyCount() {
		return this.#company ?? suggestedCompany(waitingPlayers().length);
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const index = await (this.#index ??= loadArtIndex());
		const path = rulebookPath();
		const waiting = waitingPlayers();
		const company = this.#companyCount;
		return Object.assign(context, {
			pages: EXPECTED_PAGES,
			root: ART_ROOT,
			dir: RULEBOOK_DIR,
			artDone: !!index,
			importedOn: importDate(index?.importedAt),
			path,
			found: foundText(foundRulebook(), this.#busy),
			busy: this.#busy,
			company: {
				count: company,
				fewest: company <= COMPANY_MIN,
				most: company >= COMPANY_MAX,
				waiting: waiting.map((user) => user.name).join(", "),
				busy: this.#knighting,
				done: this.#knighted && {
					made: this.#knighted.made,
					given: this.#knighted.given.join(", "),
					left: this.#knighted.made - this.#knighted.given.length
				}
			}
		});
	}

	/** @override */
	async _onFirstRender(context, options) {
		await super._onFirstRender(context, options);
		// Redraw when the book is kept or forgotten here or on another GM's screen.
		this.#hook = Hooks.on(RULEBOOK_HOOK, () => this.rendered && this.render());
		this.#userHook = Hooks.on("userConnected", () => this.rendered && this.render());
		// A book found kept by another world is imported here without asking, by one GM.
		if (foundRulebook() === "pending" && game.users.activeGM?.isSelf) this.#importFound();
	}

	/** @override */
	_onRender(context, options) {
		super._onRender(context, options);
		const input = this.element.querySelector("input[type=file]");
		input?.addEventListener("change", () => {
			const [file] = input.files ?? [];
			if (file) this.#bringIn(file);
		});
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		if (this.#hook !== null) Hooks.off(RULEBOOK_HOOK, this.#hook);
		this.#hook = null;
		if (this.#userHook !== null) Hooks.off("userConnected", this.#userHook);
		this.#userHook = null;
		// Closed once, it has done its greeting: the world stops opening it by itself.
		if (game.settings.get(SYSTEM_ID, SHOW_SETTING)) {
			game.settings.set(SYSTEM_ID, SHOW_SETTING, false)
				.catch((error) => console.error(`${SYSTEM_ID} | Couldn't stop the Welcome opening by itself`, error));
		}
	}

	/** @this {Welcome} */
	static #onChoose() {
		if (!this.#busy) chooseLocalFiles(this.element);
	}

	/**
	 * Keep a copy of the chosen PDF and import its art and tables.
	 * @param {File} file
	 */
	async #bringIn(file) {
		if (this.#busy) return;
		this.#busy = true;
		await this.render();

		try {
			await bringInRulebook(file);
		} finally {
			this.#busy = false;
			this.#index = null;
		}
		if (this.rendered) await this.render();
	}

	/**
	 * Import the art and tables from the book this world found kept by
	 * another, which is already where the reader looks for it.
	 */
	async #importFound() {
		if (this.#busy) return;
		this.#busy = true;
		await this.render();

		let index;
		try {
			index = await importKeptRulebook();
		} finally {
			this.#busy = false;
			this.#index = null;
		}
		// Given up on, the Welcome goes back to asking for the PDF, rather than trying again each time it opens.
		await setFoundRulebook(index ? "done" : "");
		if (this.rendered) await this.render();
	}

	/**
	 * One Knight more or fewer; counted by hand, the count stops following who signs in.
	 * @this {Welcome}
	 * @param {PointerEvent} _event
	 * @param {HTMLElement} target
	 */
	static #onCompanyStep(_event, target) {
		if (this.#knighting) return;
		this.#company = clampCompany(this.#companyCount + Number(target.dataset.step));
		this.render();
	}

	/**
	 * Make the Company's Knights, one given to each player signed in, whose sheet opens for them.
	 * @this {Welcome}
	 */
	static async #onKnightCompany() {
		if (this.#knighting) return;
		const count = this.#companyCount;
		this.#knighting = true;
		await this.render();
		try {
			const { made, given } = await knightTheCompany(count);
			this.#knighted = { made: made.length, given: given.map((user) => user.name) };
			// Those Knights are made: the count follows whoever is still waiting.
			this.#company = null;
		} catch (error) {
			console.error(`${SYSTEM_ID} | Couldn't make the Company's Knights`, error);
			ui.notifications.error("bastionland.welcome.company.failed", { localize: true });
		} finally {
			this.#knighting = false;
		}
		if (this.rendered) await this.render();
	}

	static #onRead() {
		openRulebook();
	}

	/** @this {Welcome} */
	static #onFinish() {
		this.close();
	}
}

const openOnce = singletonOpener(Welcome);

/** Open the Welcome, or bring it forward. It's for GMs, whose world it sets up. */
export const openWelcome = () => (game.user.isGM ? openOnce() : null);
