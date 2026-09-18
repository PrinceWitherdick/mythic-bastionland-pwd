import { loadArtIndex } from "../book-art/art-index.js";
import { importBookArt } from "../book-art/importer.js";
import { ART_ROOT, EXPECTED_PAGES } from "../rules/book-art.js";
import { openReader, openRulebook } from "../rulebook/BookReader.js";
import { RULEBOOK_DIR, RULEBOOK_HOOK, keepRulebook, rulebookPath } from "../rulebook/store.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { hasHadSetup, isSetupDone } from "../world-setup.js";
import { chooseLocalFiles, singletonOpener } from "./ui.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * The window a new world greets its GM with. The rulebook isn't shipped, so
 * what it offers is the GM's own PDF, chosen once: a copy is always kept to
 * read in Foundry, and if ticked, Import Book Art takes its art and text too.
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

export class Welcome extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: "bastionland-welcome",
		classes: [SYSTEM_ID, "bastionland", "bastionland-welcome-window"],
		position: { width: 580, height: "auto" },
		window: { title: "bastionland.welcome.title", icon: "fa-solid fa-chess-rook", resizable: true },
		actions: {
			choose: Welcome.#onChoose,
			read: Welcome.#onRead,
			finish: Welcome.#onFinish
		}
	};

	static PARTS = {
		welcome: { template: templatePath("apps/welcome.hbs") }
	};

	/**
	 * Whether the art import is ticked. Null until the first draw ticks it if
	 * the art isn't in yet.
	 * @type {boolean|null}
	 */
	#art = null;

	/** Whether an import is under way, which holds every control still. */
	#busy = false;

	/** @type {number|null} */
	#hook = null;

	/** The art index, read once and again only after an import. @type {Promise<object|null>|null} */
	#index = null;

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const index = await (this.#index ??= loadArtIndex());
		const path = rulebookPath();
		this.#art ??= !index;
		return Object.assign(context, {
			pages: EXPECTED_PAGES,
			root: ART_ROOT,
			dir: RULEBOOK_DIR,
			art: this.#art,
			artDone: !!index,
			importedOn: importDate(index?.importedAt),
			path,
			busy: this.#busy
		});
	}

	/** @override */
	async _onFirstRender(context, options) {
		await super._onFirstRender(context, options);
		// Redraw when the book is kept or forgotten here or on another GM's screen.
		this.#hook = Hooks.on(RULEBOOK_HOOK, () => this.rendered && this.render());
	}

	/** @override */
	_onRender(context, options) {
		super._onRender(context, options);
		const input = this.element.querySelector("input[type=file]");
		input?.addEventListener("change", () => {
			const [file] = input.files ?? [];
			if (file) this.#bringIn(file);
		});
		this.element.querySelector("input[data-use=art]")?.addEventListener("change", (event) => {
			this.#art = event.currentTarget.checked;
		});
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		if (this.#hook !== null) Hooks.off(RULEBOOK_HOOK, this.#hook);
		this.#hook = null;
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
	 * Keep a copy of the chosen PDF, then import its art if that's ticked. The
	 * copy goes first, as the art import ends on a report the GM has to close.
	 * @param {File} file
	 */
	async #bringIn(file) {
		if (this.#busy) return;
		const art = this.#art;
		this.#busy = true;
		await this.render();

		let artDone = false;
		try {
			if (await keepRulebook(file)) openReader()?.reload();
			if (art) artDone = !!(await importBookArt(file));
		} finally {
			this.#busy = false;
			if (art) this.#index = null;
		}

		// Once the art is in, the box goes back to unticked.
		if (artDone) this.#art = null;
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
