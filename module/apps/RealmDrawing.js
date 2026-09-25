import { drawingCountLabel, finishRealmDrawing, getRealm, isDrawingRealm, setRealmGridAlpha } from "../actions/realm.js";
import { changeRealmPicture } from "../actions/realm-map.js";
import { ART_INDEX_HOOK, loadArtIndex } from "../book-art/art-index.js";
import { t } from "../chat/cards.js";
import { markDice, restoreDiceRolls, showDiceRoll } from "../rulebook/dice-in-text.js";
import { DRAWING_WINDOW, bookDrawingGroups, drawingTally, drawingWindowPlacement, finishPlacement, sheetDrawingGroups } from "../rules/realm-drawing.js";
import { GRID_ALPHA } from "../rules/realm-documents.js";
import { MAP_ROLES } from "../rules/realm-map.js";
import { REALM_TOOL_ICONS } from "../rules/realm.js";
import { RULE_PAGES } from "../rules/rule-pages.js";
import { RULEBOOK_HOOK } from "../rulebook/store.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { COMPANY_BUTTON_HOOK, companyButtonBox } from "./CompanyButton.js";
import { wireDialogRail } from "./dialog-rail.js";
import { MapSidePanel } from "./MapSidePanel.js";
import { followMap, hotbarFloor, mapOnScreen, mapPanelScale, panelScreen } from "./map-screen.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** The page Creating a Realm is printed on. */
const PAGE = RULE_PAGES.creatingRealm;

/**
 * Creating a Realm (p14), in a window of its own while the GM is drawing a
 * Realm by hand, in place of Travel and Exploration: the rulebook's own page
 * once Import PDF has read it, and the free Blank Realm sheet's until then.
 * It opens over the middle of the map, where it can't be missed, and the GM
 * moves it wherever suits; closed, it comes back from the Paint the Realm tool.
 * Each step has a tally of how far the drawing has come, and the steps the
 * paint palette doesn't cover have the Realm tool that draws them. Each part
 * of the Realm is a page on a rail down the window's left side, as Stonetop's
 * welcome window has, its tab ticked once the sheet's counts are all met.
 * Only GMs see any of it.
 */
export class RealmDrawing extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: "bastionland-realm-drawing",
		classes: [SYSTEM_ID, "bastionland", "bastionland-dialog", "bastionland-realm-drawing"],
		position: { ...DRAWING_WINDOW },
		window: { title: "bastionland.realmDrawing.title", icon: "fa-solid fa-map", resizable: true },
		actions: {
			useTool: RealmDrawing.#onUseTool,
			rollDice: RealmDrawing.#onRollDice,
			lineUpMap: RealmDrawing.#onLineUpMap,
			changeMap: RealmDrawing.#onChangeMap,
			openPage: MapSidePanel.openPage
		}
	};

	static PARTS = {
		rules: { template: templatePath("apps/realm-drawing.hbs"), scrollable: [".bastionland-rail-dialog__main"] }
	};

	/** @type {object|null|undefined} The imported book's index, loaded when the rules are first shown and after each import. */
	#index;

	/** @type {[string, number][]} Hooks to take down on close. */
	#hooks = [];

	/**
	 * What each die printed in the rules last gave, keyed as markDice keys
	 * them, so a suggestion stays on the page while the GM paints it and the
	 * tallies draw the rules again.
	 * @type {Map<string, number>}
	 */
	#rolls = new Map();

	/** @type {Set<string>} Which of the folded lists, such as what each kind of Landmark is, the GM has opened. */
	#opened = new Set();

	/** @type {string|null} The page on the rail the GM last chose, kept as the tallies draw the rules again. */
	#page = null;

	/** Each write of the hex lines goes to every client and redraws the Scene, so a drag writes once it pauses rather than at every step. */
	#setLines = foundry.utils.debounce((alpha) => setRealmGridAlpha(canvas.scene, alpha), 150);

	/** @override */
	_configureRenderOptions(options) {
		super._configureRenderOptions(options);
		// Each time it opens, it opens over the middle of the map; after that it stays where the GM puts it.
		if (options.isFirstRender) Object.assign(options.position, drawingWindowPlacement(panelScreen(), mapOnScreen(), DRAWING_WINDOW));
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		if (this.#index === undefined) this.#index = await loadArtIndex();
		const realm = getRealm(canvas.scene)?.realm;
		const tally = realm ? drawingTally(realm) : {};
		const text = (key, data) => t(`realmDrawing.${key}`, data);
		const counts = (key) => (tally[key] ?? []).map((entry) => ({ label: drawingCountLabel(entry), done: entry.done }));
		// A step the palette paints needs no button of its own: every brush is a swatch there already.
		const tool = (step) => (step.brush ? null : {
			name: step.tool,
			icon: REALM_TOOL_ICONS[step.tool],
			label: t(`realm.tools.${step.tool}`),
			hint: step.tool === "inspect" ? text("inspectHint") : null,
			active: canvas.realm?.active && canvas.realm.tool === step.tool
		});

		const book = this.#index?.rules?.creatingRealm?.sections;
		const fromBook = book ? bookDrawingGroups(book) : null;
		const groups = (fromBook ?? sheetDrawingGroups(text)).map((group) => {
			const sections = group.parts.map((part) => ({
				key: part.key,
				blocks: printedBlocks(part.blocks),
				counts: part.step ? counts(part.step.key) : null,
				tool: part.step ? tool(part.step) : null
			}));
			const tallied = sections.flatMap((section) => section.counts ?? []);
			return { key: group.key, heading: group.heading, icon: group.icon, sections, done: tallied.length > 0 && tallied.every((count) => count.done) };
		});
		const picture = this.#pictureContext(realm);

		// A page to each part of the Realm, the pictures first on a traced one.
		const pages = [
			...(picture ? [{ key: "picture", icon: "fa-image", label: picture.heading, done: false }] : []),
			...groups.map((group) => ({ key: group.key, icon: group.icon, label: group.heading, done: group.done }))
		];
		// The page the GM was on, unless it has gone, as the pictures do when they're taken away; else the first step's.
		const shown = pages.find((page) => page.key === this.#page) ?? pages.find((page) => page.key === groups[0]?.key) ?? pages[0];
		for (const page of pages) page.active = page === shown;
		for (const group of groups) group.active = group.key === shown?.key;
		if (picture) picture.active = shown?.key === "picture";

		return Object.assign(context, {
			more: text("more"),
			...MapSidePanel.pageContext(PAGE),
			// One way into the palette, at the head of the rules, in place of a button on every step.
			palette: {
				name: "terrain",
				icon: REALM_TOOL_ICONS.terrain,
				label: t("realm.tools.terrain"),
				active: canvas.realm?.active && canvas.realm.tool === "terrain"
			},
			title: text("title"),
			pages,
			shown,
			// The book's own page says what the sheet's intro sums up.
			intro: fromBook ? null : text("intro"),
			picture,
			groups,
			credit: text(fromBook ? "bookCredit" : "credit")
		});
	}

	/**
	 * The pictures a traced Realm is drawn by, at the head of the rules: each
	 * one to line up again, a way to change them, and how strongly Foundry's own
	 * hex lines are drawn — a photograph has hexes printed on it already, so the
	 * GM wants them bright while lining the picture up and faint afterwards.
	 * @param {import("../rules/realm.js").Realm|null|undefined} realm
	 * @returns {object|null} Null on a Realm drawn in the system's own ink.
	 */
	#pictureContext(realm) {
		if (!realm?.picture) return null;
		const text = (key, data) => t(`realm.picture.${key}`, data);
		return {
			heading: text("title"),
			intro: text("intro"),
			maps: MAP_ROLES.filter((role) => realm.picture[role]).map((role) => ({
				role,
				src: realm.picture[role].src,
				label: text(`roles.${role}.label`)
			})),
			lineUp: text("lineUp.again"),
			lineUpHint: text("lineUpHint"),
			change: text("change"),
			gridLabel: text("gridLines"),
			gridHint: text("gridLinesHint"),
			grid: Math.round((canvas.scene?.grid?.alpha ?? GRID_ALPHA) * 100)
		};
	}

	/** @override */
	async _onFirstRender(context, options) {
		await super._onFirstRender(context, options);
		// Import PDF run while drawing brings in the rulebook's own page in place of the sheet's.
		const reindex = () => {
			this.#index = undefined;
			this.render();
		};
		// The link to p14 comes and goes with the rulebook.
		const redraw = () => this.render();
		this.#hooks = [[ART_INDEX_HOOK, reindex], [RULEBOOK_HOOK, redraw]].map(([name, fn]) => [name, Hooks.on(name, fn)]);
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		wireDialogRail(this.element, { onShow: (key) => (this.#page = key) });
		// The dice the book prints, such as "clusters of d12 hexes", rolled where they stand.
		restoreDiceRolls(markDice(this.element), this.#rolls);
		// A fold the GM opened stays open: these rules are drawn again after every edit to the Realm.
		for (const fold of this.element.querySelectorAll("details[data-fold]")) {
			const { fold: key } = fold.dataset;
			fold.open = this.#opened.has(key);
			fold.addEventListener("toggle", () => (fold.open ? this.#opened.add(key) : this.#opened.delete(key)));
		}
		// A slider answers as it's dragged, which no action does.
		const lines = this.element.querySelector("[data-grid-alpha]");
		lines?.addEventListener("input", () => this.#setLines(Number(lines.value) / 100));
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		this.#rolls.clear();
		this.#opened.clear();
		for (const [name, id] of this.#hooks) Hooks.off(name, id);
		this.#hooks = [];
		// Read again next time, in case the book has been imported since.
		this.#index = undefined;
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/** @this {RealmDrawing} */
	static async #onUseTool(_event, target) {
		// Only the steps the palette can't paint have a button. Picking the tool up draws these rules again.
		await canvas.realm?.useTool(target.dataset.tool);
	}

	/**
	 * Slide one of the Realm's pictures into place under the hexes again.
	 * @this {RealmDrawing}
	 */
	static async #onLineUpMap(_event, target) {
		const { ALIGNMENT, startMapAlignment } = await import("../canvas/map-alignment.js");
		const result = await startMapAlignment(canvas.scene, { role: target.dataset.mapRole });
		if (result === ALIGNMENT.none) ui.notifications.warn(t("realm.picture.lineUp.missing"));
	}

	/**
	 * Change the pictures the Realm is drawn by, or take them away.
	 * @this {RealmDrawing}
	 */
	static async #onChangeMap() {
		await changeRealmPicture(canvas.scene);
	}

	/**
	 * Roll a die the rules print, such as the d12 a terrain cluster is wide,
	 * and show what it gave beside the word. A suggestion for the GM alone:
	 * nothing is posted and nothing is written to the Realm.
	 * @this {RealmDrawing}
	 */
	static async #onRollDice(_event, target) {
		const roll = await new Roll(target.dataset.formula).evaluate();
		this.#rolls.set(target.dataset.die, roll.total);
		showDiceRoll(target, roll.total, { landing: true });
	}
}

/**
 * A step's printed text as the template sets it out: each paragraph, then
 * bullets together in one list and labelled lines together in another.
 * @param {import("../rules/realm-drawing.js").DrawingBlock[]} blocks
 * @returns {({text: string}|{bullets: string[]}|{lines: {label: string, text: string}[]})[]}
 */
function printedBlocks(blocks) {
	const printed = [];
	for (const block of blocks) {
		const last = printed.at(-1);
		if (block.kind === "bullet") {
			if (last?.bullets) last.bullets.push(block.text);
			else printed.push({ bullets: [block.text] });
		} else if (block.kind === "term") {
			const line = { label: block.label, text: block.text };
			if (last?.lines) last.lines.push(line);
			else printed.push({ lines: [line] });
		} else printed.push({ text: block.text });
	}
	return printed;
}

/** @type {RealmDrawing|null} */
let panel = null;

/**
 * The Finish button under the map, which ends the drawing and brings Travel
 * and Exploration back; while Place the Company is up over the map, it stands
 * to that button's right instead. It's up for as long as the Realm is being
 * drawn, whether or not the GM has the rules window open.
 * @type {{button: HTMLButtonElement, size: {width: number, height: number}|null, stop: () => void}|null}
 */
let finish = null;

/** Hold Finish under the map, or beside Place the Company. */
function placeFinish(map = mapOnScreen()) {
	if (!finish || !map) return;
	const { button } = finish;
	// Measured once it has a size, so a pan doesn't lay the page out again for it.
	finish.size ??= button.offsetWidth ? { width: button.offsetWidth, height: button.offsetHeight } : null;
	if (!finish.size) return;
	const { left, top } = finishPlacement(map, { ...finish.size, floor: hotbarFloor(), scale: mapPanelScale(), beside: companyButtonBox(map) });
	button.style.left = `${left}px`;
	button.style.top = `${top}px`;
}

/** Put Finish up under the map, if it isn't already. */
function showFinish() {
	if (finish) return placeFinish();
	const button = document.createElement("button");
	button.type = "button";
	button.id = "bastionland-realm-drawing-finish";
	button.className = "bastionland bastionland-realm-drawing__finish";
	button.innerHTML = `<i class="fa-solid fa-scroll" inert></i> ${foundry.utils.escapeHTML(t("realmDrawing.finish.button"))}`;
	button.dataset.tooltip = t("realmDrawing.finish.hint");
	button.addEventListener("click", () => finishRealmDrawing(canvas.scene));
	(document.getElementById("interface") ?? document.body).append(button);
	const place = () => placeFinish();
	const unfollow = followMap(place);
	const company = Hooks.on(COMPANY_BUTTON_HOOK, place);
	finish = {
		button,
		size: null,
		stop: () => {
			unfollow();
			Hooks.off(COMPANY_BUTTON_HOOK, company);
		}
	};
	placeFinish();
}

/** Take Finish down. */
function closeFinish() {
	finish?.stop();
	finish?.button.remove();
	finish = null;
}

/**
 * Show the drawing rules over a Realm Scene the GM is still drawing, and
 * Finish under it. Called again while the rules are open, it brings them to
 * the front.
 * @returns {Promise<unknown>}
 */
export function showRealmDrawing() {
	if (!game.user.isGM || !isDrawingRealm(canvas?.scene)) return closeRealmDrawing();
	showFinish();
	panel ??= new RealmDrawing();
	return panel.render({ force: true });
}

/**
 * Draw the rules' tallies again after the Realm on the canvas changed.
 * @param {string} sceneId
 */
export function refreshRealmDrawing(sceneId) {
	if (panel?.rendered && sceneId === canvas?.scene?.id) panel.render();
}

/**
 * Take the drawing rules and the Finish button down.
 * @returns {Promise<unknown>}
 */
export function closeRealmDrawing() {
	closeFinish();
	return panel?.rendered ? panel.close({ animate: false }) : Promise.resolve();
}
