import { COMPANY_IMG_FLAG, companyPicture, companyTokenHex, findCompanyToken } from "../actions/company.js";
import { drawingCountLabel, editRealm, finishRealmDrawing, getRealm, isDrawingRealm, realmUndoState, setRealmGridAlpha, stepRealmHistory } from "../actions/realm.js";
import { changeRealmPicture } from "../actions/realm-map.js";
import { ART_INDEX_HOOK, loadArtIndex } from "../book-art/art-index.js";
import { COMPANY_PLACING_HOOK, startCompanyPlacement } from "../canvas/company-placement.js";
import { liningUpMap } from "../canvas/map-alignment.js";
import { t } from "../chat/cards.js";
import { markDice, restoreDiceRolls, showDiceRoll } from "../rulebook/dice-in-text.js";
import { DRAWING_WINDOW, bookDrawingGroups, drawingTally, drawingWindowPlacement, finishPlacement, sheetDrawingGroups } from "../rules/realm-drawing.js";
import { GRID_ALPHA } from "../rules/realm-documents.js";
import { clearRiver } from "../rules/realm-edits.js";
import { MAP_ROLES } from "../rules/realm-map.js";
import { REALM_TOOL_ICONS } from "../rules/realm.js";
import { RULEBOOK_HOOK } from "../rulebook/store.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { COMPANY_BUTTON_HOOK, closeCompanyButton, companyButtonBox, showCompanyButton } from "./CompanyButton.js";
import { companyPictureContext, resolveCompanyPicture, wireCompanyPicture } from "./company-picture.js";
import { wireDialogRail } from "./dialog-rail.js";
import { RealmPanel, brushHint, closeRealmPalette, realmSwatches, riverState, toggleRealmSeat } from "./RealmPanel.js";
import { followMap, hotbarFloor, mapOnScreen, mapPanelScale, panelScreen } from "./map-screen.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Creating a Realm (p14), in a window of its own while the GM is drawing a
 * Realm by hand, in place of Travel and Exploration: the rulebook's own page
 * once Import PDF has read it, and the free Blank Realm sheet's until then.
 * It opens over the middle of the map, where it can't be missed, and the GM
 * moves it wherever suits; closed, it comes back from the Paint the Realm tool.
 * Each step has a tally of how far the drawing has come and the swatches of
 * the paint palette that draw it, the terrains beside the terrain step and
 * the Barrier brush beside the Barriers, so the palette's own window stays
 * shut; the Myths, which the palette can't paint, have the Inspect tool.
 * Each part of the Realm is a page on a rail down the window's left side, as
 * Stonetop's welcome window has, its tab ticked once the sheet's counts are
 * all met. The last page chooses what the Company looks like and hands them
 * over to be stood in a hex; while the window is open, the Place the Company
 * button over the map waits. Only GMs see any of it.
 */
export class RealmDrawing extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: "bastionland-realm-drawing",
		classes: [SYSTEM_ID, "bastionland", "bastionland-dialog", "bastionland-realm-drawing"],
		position: { ...DRAWING_WINDOW },
		window: { title: "bastionland.realmDrawing.title", icon: "fa-solid fa-map", resizable: true },
		actions: {
			useTool: RealmDrawing.#onUseTool,
			pickBrush: RealmDrawing.#onPickBrush,
			toggleSeat: RealmDrawing.#onToggleSeat,
			clearRiver: RealmDrawing.#onClearRiver,
			undo: RealmDrawing.#onUndo,
			redo: RealmDrawing.#onRedo,
			rollDice: RealmDrawing.#onRollDice,
			enlargeMap: RealmDrawing.#onEnlargeMap,
			lineUpMap: RealmDrawing.#onLineUpMap,
			changeMap: RealmDrawing.#onChangeMap,
			placeCompany: RealmDrawing.#onPlaceCompany
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
		const scene = canvas.scene;
		const realm = getRealm(scene)?.realm;
		const tally = realm ? drawingTally(realm) : {};
		const text = (key, data) => t(`realmDrawing.${key}`, data);
		const counts = (key) => (tally[key] ?? []).map((entry) => ({ label: drawingCountLabel(entry), done: entry.done }));
		// A swatch is marked only while it's what the paint tool lays, not once the GM has put the tool down.
		const brush = canvas.realm?.active && canvas.realm.tool === "terrain" ? RealmPanel.brush : null;
		const swatches = realm ? realmSwatches(scene, realm, brush) : null;
		const river = realm ? riverState(realm) : null;
		// A step the palette paints has that part of the palette beside it, and says how to paint with it while it's in hand.
		const palette = (step) => (step.brush && swatches ? {
			swatches: swatches[step.brush],
			pairs: step.brush === "holding",
			hint: step.brush === brush ? brushHint(brush) : null,
			clear: step.brush === "river" && !river.none ? river.clear : null
		} : null);
		// The Myths are numbered and rolled in the Lay of the Land's Edit this hex, so their step has the tool that opens it.
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
				heading: part.heading ?? null,
				blocks: printedBlocks(part.blocks),
				counts: part.step ? counts(part.step.key) : null,
				palette: part.step ? palette(part.step) : null,
				tool: part.step ? tool(part.step) : null
			}));
			const tallied = sections.flatMap((section) => section.counts ?? []);
			return { key: group.key, heading: group.heading, icon: group.icon, sections, done: tallied.length > 0 && tallied.every((count) => count.done) };
		});
		const picture = this.#pictureContext(realm);
		const company = this.#companyContext(scene);

		// A page to each part of the Realm, the pictures first on a traced one, and the Company last.
		const pages = [
			...(picture ? [{ key: "picture", icon: "fa-image", label: picture.heading, done: false }] : []),
			...groups.map((group) => ({ key: group.key, icon: group.icon, label: group.heading, done: group.done })),
			{ key: "company", icon: "fa-flag", label: t("company.title"), done: company.standing }
		];
		// The page the GM was on, unless it has gone, as the pictures do when they're taken away; else the first step's.
		const shown = pages.find((page) => page.key === this.#page) ?? pages.find((page) => page.key === groups[0]?.key) ?? pages[0];
		for (const page of pages) page.active = page === shown;
		for (const group of groups) group.active = group.key === shown?.key;
		if (picture) picture.active = shown?.key === "picture";
		company.active = shown?.key === "company";

		const { canUndo, canRedo } = realmUndoState(scene);
		return Object.assign(context, {
			more: text("more"),
			// Undo and Redo at the head, where the palette had them at its foot.
			undoDisabled: !canUndo,
			redoDisabled: !canRedo,
			title: text("title"),
			pages,
			shown,
			// The book's own page says what the sheet's intro sums up.
			intro: fromBook ? null : text("intro"),
			// On a traced Realm, the Wilderness page opens by saying every hex wants its terrain painted.
			paintEveryHex: picture ? {
				heading: text("paintEveryHex.heading"),
				text: text("paintEveryHex.text"),
				done: (tally.terrain ?? []).every((entry) => entry.done)
			} : null,
			picture,
			groups,
			company,
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
			paintNext: text("paintNext"),
			maps: MAP_ROLES.filter((role) => realm.picture[role]).map((role) => ({
				role,
				src: realm.picture[role].src,
				label: text(`roles.${role}.label`)
			})),
			enlarge: text("enlarge"),
			lineUp: text("lineUp.again"),
			lineUpHint: text("lineUpHint"),
			change: text("change"),
			gridLabel: text("gridLines"),
			gridHint: text("gridLinesHint"),
			grid: Math.round((canvas.scene?.grid?.alpha ?? GRID_ALPHA) * 100)
		};
	}

	/**
	 * The Company's page: the picture gallery, holding what the GM has picked
	 * there but not yet placed as the rules are drawn again after each edit, and
	 * where the Company stands once it's on the map.
	 * @param {Scene} scene
	 * @returns {object}
	 */
	#companyContext(scene) {
		const token = findCompanyToken(scene);
		const field = (name) => this.element?.querySelector(`[name="${name}"]`)?.value;
		const picture = companyPictureContext(field("companyImg") || token?.texture?.src || companyPicture(scene));
		picture.colour = field("companyColour") || picture.colour;
		const hex = token ? companyTokenHex(scene) : null;
		return {
			picture,
			standing: Boolean(token),
			intro: hex ? t("realmDrawing.company.standing", { hex: t("realm.hex", hex) }) : t("realmDrawing.company.intro"),
			button: t(token ? "realmDrawing.company.move" : "company.placing.button"),
			hint: `${t("company.placing.hint")} ${t("company.placing.stop")}`
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
		// The page numbers in the rules, such as the Myths' p27, link to the rulebook only while the world has one.
		const redraw = () => this.render();
		// The Company's page says where they stand, once they're put down or taken off the map.
		const onToken = (token) => {
			if (token?.parent?.id === canvas?.scene?.id) redraw();
		};
		this.#hooks = [
			[ART_INDEX_HOOK, reindex],
			[RULEBOOK_HOOK, redraw],
			[COMPANY_PLACING_HOOK, redraw],
			["createToken", onToken],
			["deleteToken", onToken]
		].map(([name, fn]) => [name, Hooks.on(name, fn)]);
		// Settled once the window is open, which is what the button asks: Foundry only knows of it from here.
		showCompanyButton();
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
		wireCompanyPicture(this.element);
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
		// Closed before the Company is on the map, the button over the map takes them up instead.
		showCompanyButton();
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
	 * Take up the paint tool with the swatch's brush: a terrain by its number,
	 * the river, Barriers, a Holding by its style or a Landmark by its type.
	 * @this {RealmDrawing}
	 */
	static async #onPickBrush(_event, target) {
		const { brush } = target.dataset;
		await canvas.realm?.useTool("terrain", { brush: /^\d+$/.test(brush) ? Number(brush) : brush });
	}

	/**
	 * Tick the Seat of Power, so the next Holding placed is the Realm's Seat,
	 * with the paint tool in hand to place it.
	 * @this {RealmDrawing}
	 */
	static async #onToggleSeat() {
		toggleRealmSeat();
		await canvas.realm?.useTool("terrain");
	}

	/** @this {RealmDrawing} */
	static #onClearRiver() {
		return editRealm(canvas.scene, clearRiver);
	}

	/** @this {RealmDrawing} */
	static #onUndo() {
		return stepRealmHistory(canvas.scene, "undo");
	}

	/** @this {RealmDrawing} */
	static #onRedo() {
		return stepRealmHistory(canvas.scene, "redo");
	}

	/**
	 * Open one of the Realm's pictures larger, in a window of its own.
	 * Its window is loaded only when it's opened, as the New Realm dialog's is.
	 * @this {RealmDrawing}
	 */
	static async #onEnlargeMap(_event, target) {
		const { mapSrc: src, mapLabel: title } = target.dataset;
		if (!src) return;
		const { openArt } = await import("./ArtPopout.js");
		openArt({ src, title: title || t("realm.picture.title") });
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
	 * Give the Company the picture chosen on its page, and put them in the GM's
	 * hand to carry over the map and stand in a hex. A Company already on the
	 * map takes the new picture and is taken up to be stood somewhere else.
	 * @this {RealmDrawing}
	 */
	static async #onPlaceCompany() {
		const scene = canvas.scene;
		if (!scene) return;
		const value = (name) => this.element.querySelector(`[name="${name}"]`)?.value;
		const img = await resolveCompanyPicture({ companyImg: value("companyImg"), companyColour: value("companyColour") });
		// Kept on the Scene, so the Token made when they're put down, or later from the button over the map, carries it.
		if (scene.getFlag(SYSTEM_ID, COMPANY_IMG_FLAG) !== img) await scene.setFlag(SYSTEM_ID, COMPANY_IMG_FLAG, img);
		const token = findCompanyToken(scene);
		if (token && token.texture?.src !== img) await token.update({ "texture.src": img });
		if (!(await startCompanyPlacement(scene, { img }))) ui.notifications.info(t("company.placing.later"));
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
	// Not while the Realm's picture is being lined up: the rules come up once it's kept.
	if (!game.user.isGM || !isDrawingRealm(canvas?.scene) || liningUpMap(canvas.scene)) return closeRealmDrawing();
	showFinish();
	// Its pages hold the palette now, a part beside each step, so the palette's own window goes.
	closeRealmPalette();
	// The Company is placed from the window's last page while it's open, so the button over the map stands down.
	closeCompanyButton();
	panel ??= new RealmDrawing();
	return panel.render({ force: true });
}

/** Whether a redraw is already waiting for the next frame. */
let redrawDue = false;

/**
 * Draw the rules' tallies again after the Realm on the canvas changed, or its
 * brush did. One change calls this from several hooks, so it's drawn once, on
 * the next frame.
 * @param {string} sceneId
 */
export function refreshRealmDrawing(sceneId) {
	if (redrawDue || !panel?.rendered || sceneId !== canvas?.scene?.id) return;
	redrawDue = true;
	requestAnimationFrame(() => {
		redrawDue = false;
		if (panel?.rendered) panel.render();
	});
}

/**
 * Take the drawing rules and the Finish button down.
 * @returns {Promise<unknown>}
 */
export function closeRealmDrawing() {
	closeFinish();
	return panel?.rendered ? panel.close({ animate: false }) : Promise.resolve();
}
