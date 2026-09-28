import { editRealm, getRealm, isDrawingRealm, isRealmScene, rerollRealm, sceneGeometry, startRealmDrawing, stepRealmHistory } from "../actions/realm.js";
import { changeRealmPicture } from "../actions/realm-map.js";
import { wildernessRoll } from "../actions/wilderness.js";
import { toolActivated } from "../compat.js";
import { followHexLore } from "../apps/HexLore.js";
import { openRealmAppearance } from "../apps/RealmAppearance.js";
import { RealmPanel, openRealmPanel, setRealmBrush, setRealmSeat } from "../apps/RealmPanel.js";
import { refreshRealmDrawing, showRealmDrawing } from "../apps/RealmDrawing.js";
import { INK_HEX, PAPER_HEX as PAPER } from "../rules/colour.js";
import { REALM_BUTTONS, REALM_TOOLS, REALM_TOOL_ICONS, TERRAIN, featureAt, terrainAt } from "../rules/realm.js";
import { t } from "../chat/cards.js";
import { barrierState, featureStands, layRiver, paintTerrain, placeFeature, riverEnds, setBarrier, traceCourse, trimRiver } from "../rules/realm-edits.js";
import { MARK_ALPHA, hidesTerrain, markedHexLettering, terrainMark } from "../rules/realm-map.js";
import { allHexes, edgeAt, edgeSegment, hexAt, hexCentre, hexIndex, hexKey, hexTopLeft, sameHex } from "../rules/realm-geometry.js";

/** The grid highlight the Realm tools draw in. */
const HIGHLIGHT = "bastionland-realm";

/**
 * The grid highlight the hexes already marked are tinted in, on a Realm drawn
 * by a picture. There the system's own ground is drawn at nothing so the
 * picture shows through, so this is the only way the GM can see how far the
 * marking has come. Drawn on this client alone: nobody else sees it.
 */
const MARKS = "bastionland-realm-marks";

const BLOOD = 0x8b1e1e;
const VERDIGRIS = 0x2f6150;
const WATER = 0x2e5f8a;

/**
 * The brushes that stand a feature in a hex. Each says how to pick one up, what
 * it lays, where to look for one already there, and what follows laying it.
 */
const FEATURE_BRUSHES = {
	holding: {
		at: (here) => here.holding,
		pick: (here) => here.holding?.style ?? "holding",
		// The brush only ever grants the crown: painting a Holding over the Seat leaves it the Seat.
		build: (here) => ({ kind: "holding", style: RealmPanel.holding, seat: RealmPanel.seat || here.holding?.seat }),
		// A Realm has one Seat, so the tick comes off once it stands somewhere.
		laid: () => RealmPanel.seat && setRealmSeat(false)
	},
	landmark: {
		at: (here) => here.landmark,
		pick: (here) => here.landmark?.type ?? "landmark",
		build: () => ({ kind: "landmark", type: RealmPanel.landmark })
	}
};

/**
 * @typedef {object} PaintDrag A drag with the Paint terrain tool: the hexes it
 *   has crossed so far, and the edit that lays them when it's dropped.
 * @property {{color: number, alpha: number}} highlight How its hexes are marked while it's under way.
 * @property {boolean} course Whether it's drawn as a line through its hexes, in order.
 * @property {() => {col: number, row: number}[]} hexes
 * @property {(g: object, hex: {col: number, row: number}|null) => boolean} extend Take in the hex under the pointer.
 *   Whether that changed anything.
 * @property {() => boolean} ready Whether dropping it lays anything.
 * @property {(realm: object, g: object) => object} lay
 */

/** @returns {PaintDrag} Terrain painted on every hex crossed, in the palette's brush. */
function terrainDrag() {
	const crossed = new Map();
	return {
		highlight: { color: VERDIGRIS, alpha: 0.3 },
		course: false,
		hexes: () => [...crossed.values()],
		extend(_g, hex) {
			if (!hex || crossed.has(hexKey(hex))) return false;
			crossed.set(hexKey(hex), hex);
			return true;
		},
		ready: () => crossed.size > 0,
		lay: (realm, g) => paintTerrain(realm, g, [...crossed.values()], RealmPanel.terrain)
	};
}

/**
 * @param {object} g
 * @param {{col: number, row: number}|null} start
 * @returns {PaintDrag} A river drawn hex to hex from where the drag began.
 */
function riverDrag(g, start) {
	let course = traceCourse(g, [], start);
	return {
		highlight: { color: WATER, alpha: 0.25 },
		course: true,
		hexes: () => course,
		extend(geometry, hex) {
			const next = traceCourse(geometry, course, hex);
			if (next === course) return false;
			course = next;
			return true;
		},
		ready: () => course.length > 1,
		lay: (realm, geometry) => layRiver(realm, geometry, course)
	};
}

/**
 * The GM's Realm tools on a Realm Scene: a control group beside Foundry's own,
 * with tools that work on hexes and buttons for the Wilderness Roll, Reroll
 * and the Realm's looks.
 */
export class RealmLayer extends foundry.canvas.layers.InteractionLayer {
	/** @override */
	static get layerOptions() {
		return Object.assign(super.layerOptions, { name: "realm", zIndex: 950 });
	}

	/**
	 * Only GMs get the Realm tools, and only on a Realm Scene.
	 * @override
	 */
	static prepareSceneControls() {
		if (!game.user.isGM || !isRealmScene(canvas.scene)) return null;
		const tools = Object.fromEntries(REALM_TOOLS.map((name, index) => {
			const tool = { name, order: index + 1, title: `bastionland.realm.tools.${name}`, icon: REALM_TOOL_ICONS[name] };
			if (REALM_BUTTONS.includes(name)) Object.assign(tool, { button: true, onChange: () => canvas.realm?.runButton(name) });
			return [name, tool];
		}));
		return {
			name: "realm",
			order: 20,
			title: "bastionland.realm.controls.title",
			icon: "fa-solid fa-crown",
			layer: "realm",
			onChange: (_event, active) => {
				if (active) canvas.realm.activate();
			},
			onToolChange: (event, tool, toggled) => {
				const active = toolActivated(tool, toggled);
				if (active && !tool.button) canvas.realm.setTool(tool.name);
				// Clicking the terrain brush's own button goes back into drawing the Realm, or, while it's being drawn,
				// brings Creating a Realm back up if the GM closed it. Not a click on the Realm controls, which picks up
				// whichever tool was last in hand, nor the controls switching tools on their own.
				const clicked = event?.isTrusted && event.target instanceof Element && event.target.closest("[data-tool]")?.dataset.tool === "terrain";
				if (active && tool.name === "terrain" && clicked) RealmLayer.#reopenPaint();
			},
			tools,
			activeTool: "inspect"
		};
	}

	/** Bring back Creating a Realm while the Realm is being drawn, or go back into drawing it. */
	static #reopenPaint() {
		if (isDrawingRealm(canvas.scene)) showRealmDrawing();
		else startRealmDrawing(canvas.scene);
	}

	/**
	 * Foundry drops a click on the tool already in hand, so a second click on
	 * the paint tool, after the GM closed its palette or Creating a Realm,
	 * would bring neither back. This catches that click before Foundry does,
	 * while the tool in hand is still the one it was, and opens them again.
	 * A click that picks the paint tool up is left to onToolChange.
	 */
	static listenForPaintAgain() {
		document.addEventListener("click", (event) => {
			const button = event.target instanceof Element ? event.target.closest("#scene-controls [data-tool]") : null;
			if (button?.dataset.tool !== "terrain" || !game.user.isGM || !canvas.ready) return;
			if (ui.controls?.control?.name !== "realm" || ui.controls.tool?.name !== "terrain") return;
			canvas.realm?.setTool("terrain");
			RealmLayer.#reopenPaint();
		}, { capture: true });
	}

	/** The tool in use: one of REALM_TOOLS that isn't a button. */
	tool = "inspect";

	/** @returns {string|null} What the paint tool lays, one of REALM_BRUSHES, or null with any other tool in hand. */
	get brush() {
		return this.tool === "terrain" ? RealmPanel.brush : null;
	}

	/** Whether the paint tool is drawing the river, which is picked in its palette. */
	get drawsRiver() {
		return this.brush === "river";
	}

	/** @type {{col: number, row: number}|null} */
	hovered = null;

	/** @type {string|null} The edge the Barrier tool points at. */
	hoveredEdge = null;

	/** @type {PaintDrag|null} */
	#drag = null;

	/** @type {PIXI.Graphics|null} */
	#preview = null;

	/** @type {PIXI.Container|null} The names written in the middle of the hexes already marked. */
	#names = null;

	/** @type {PIXI.Container|null} Tiles a Realm look being tried out adds, drawn on this client alone. */
	#lookTiles = null;

	/** @type {object|null} The Realm the marks on the map were drawn from, so they're only drawn again once it changes. */
	#marked = null;

	#onPointerMove = () => this.#hover();

	/**
	 * Pick up a tool as if from the controls.
	 * @param {string} name
	 * @param {object} [options]
	 * @param {number|string} [options.brush] What the paint tool lays, as setRealmBrush takes it; left as it was if not given.
	 * @returns {Promise<void>}
	 */
	async useTool(name, { brush } = {}) {
		const holding = this.tool === name;
		if (brush) setRealmBrush(brush);
		await ui.controls.activate({ control: "realm", tool: name });
		// Already holding it, the controls see no change and don't pick it up, so it's picked up here.
		if (holding) this.setTool(name);
	}

	/** @param {string} name */
	setTool(name) {
		this.tool = name;
		// While a Realm is drawn by hand, Creating a Realm holds each part of the palette beside the step it draws.
		if (name === "terrain" && isRealmScene(canvas.scene) && !isDrawingRealm(canvas.scene)) openRealmPanel({ scene: canvas.scene, mode: name });
		this.redrawTool();
	}

	/** Drop a drag under way and draw what the tool in hand shows again, after the tool or the terrain brush changed. */
	redrawTool() {
		this.#drag = null;
		// Creating a Realm marks the tool in hand.
		if (canvas.scene) refreshRealmDrawing(canvas.scene.id);
		this.#hover(true);
	}

	/**
	 * @param {string} name One of REALM_BUTTONS.
	 */
	runButton(name) {
		const scene = canvas.scene;
		if (name === "wilderness") return wildernessRoll({ scene });
		if (name === "reroll") return rerollRealm(scene);
		if (name === "appearance") return openRealmAppearance();
		if (name === "picture") return changeRealmPicture(scene);
		return null;
	}

	/**
	 * Draw the Tiles a Realm look being tried out adds, such as the sheet's lake
	 * shores, in place of any it drew before. No Scene holds them, so nothing
	 * saves them and nobody else sees them.
	 * @param {object[]} tiles Tile data, as planRealmSync would create it.
	 * @returns {Promise<void>}
	 */
	async showLookTiles(tiles) {
		this.clearLookTiles();
		const scene = canvas.scene;
		if (!this.#lookTiles || !scene) return;
		await Promise.all(tiles.map((data) => {
			// As Foundry draws a Tile being dragged out: a document that isn't in the Scene, and its object.
			const document = new CONFIG.Tile.documentClass({ ...data, _id: foundry.utils.randomID() }, { parent: scene });
			const tile = new CONFIG.Tile.objectClass(document);
			document._object = tile;
			this.#lookTiles.addChild(tile);
			return tile.draw();
		}));
	}

	/** Take away the Tiles a Realm look being tried out added. */
	clearLookTiles() {
		for (const tile of this.#lookTiles?.removeChildren() ?? []) tile.destroy({ children: true });
	}

	/** @override */
	async _draw(options) {
		await super._draw(options);
		this.#lookTiles = this.addChild(new PIXI.Container());
		this.#lookTiles.eventMode = "none";
		this.#names = this.addChild(new PIXI.Container());
		this.#names.eventMode = "none";
		this.#preview = this.addChild(new PIXI.Graphics());
		this.#preview.eventMode = "none";
	}

	/** @override */
	async _tearDown(options) {
		canvas.stage?.off("pointermove", this.#onPointerMove);
		canvas.interface?.grid?.destroyHighlightLayer(HIGHLIGHT);
		canvas.interface?.grid?.destroyHighlightLayer(MARKS);
		this.clearLookTiles();
		this.#lookTiles = null;
		this.#marked = null;
		this.#names = null;
		this.#preview = null;
		this.#drag = null;
		this.hovered = null;
		this.hoveredEdge = null;
		return super._tearDown(options);
	}

	/** @override */
	_activate() {
		canvas.stage.on("pointermove", this.#onPointerMove);
		// Creating a Realm marks the swatch in hand only while the Realm tools are.
		if (canvas.scene) refreshRealmDrawing(canvas.scene.id);
	}

	/** @override */
	_deactivate() {
		canvas.stage.off("pointermove", this.#onPointerMove);
		this.#drag = null;
		this.hovered = null;
		this.hoveredEdge = null;
		this.refreshHighlight();
		if (canvas.scene) refreshRealmDrawing(canvas.scene.id);
	}

	/**
	 * @returns {{col: number, row: number}|null} The hex under the pointer.
	 */
	hexAtPointer() {
		return isRealmScene(canvas.scene) ? hexAt(sceneGeometry(canvas.scene), canvas.mousePosition) : null;
	}

	/**
	 * @param {boolean} [force] Redraw even if the pointer is where it was.
	 */
	#hover(force = false) {
		const g = isRealmScene(canvas.scene) ? sceneGeometry(canvas.scene) : null;
		const hex = g ? hexAt(g, canvas.mousePosition) : null;
		const edge = g && this.brush === "barrier" ? edgeAt(g, canvas.mousePosition)?.key ?? null : null;
		const sameSpot = hex ? sameHex(hex, this.hovered) : !this.hovered;
		if (!force && sameSpot && edge === this.hoveredEdge) return;
		this.hovered = hex;
		this.hoveredEdge = edge;
		if (this.#drag) this.#paintHere();
		else this.refreshHighlight();
	}

	/** Draw what the pointer is over again. */
	refreshHighlight() {
		const grid = canvas.interface?.grid;
		// The grid makes its highlight container as the canvas draws, so there is nowhere to draw while a Scene loads.
		if (!canvas.ready || !grid?.highlight) return;
		// Made on first use, since the grid's own layer is drawn alongside this one.
		grid.addHighlightLayer(HIGHLIGHT);
		grid.clearHighlightLayer(HIGHLIGHT);
		this.#preview?.clear();
		this.#drawMarks();
		if (!this.active || !isRealmScene(canvas.scene)) return;
		const g = sceneGeometry(canvas.scene);

		if (this.#drag) {
			const { highlight, course } = this.#drag;
			const hexes = this.#drag.hexes();
			for (const hex of hexes) {
				const { x, y } = hexTopLeft(g, hex);
				grid.highlightPosition(HIGHLIGHT, { x, y, color: highlight.color, border: INK_HEX, alpha: highlight.alpha });
			}
			if (course) this.#drawCourse(g, hexes);
			return;
		}

		if (this.drawsRiver) this.#markRiverEnds(g);

		if (this.brush === "barrier") {
			const segment = this.hoveredEdge && edgeSegment(g, this.hoveredEdge);
			if (segment && this.#preview) {
				this.#preview.lineStyle({ width: 16, color: BLOOD, alpha: 0.55, cap: PIXI.LINE_CAP.ROUND });
				this.#preview.moveTo(segment.from.x, segment.from.y);
				this.#preview.lineTo(segment.to.x, segment.to.y);
			}
			return;
		}

		if (!this.hovered) return;
		const { x, y } = hexTopLeft(g, this.hovered);
		const color = this.drawsRiver ? WATER : this.brush === "terrain" ? VERDIGRIS : BLOOD;
		grid.highlightPosition(HIGHLIGHT, { x, y, color, border: INK_HEX, alpha: 0.18 });
	}

	/**
	 * Tint every hex already marked in its terrain's own colour, and write what
	 * it was marked as in the middle, its Holding's name under its terrain, so
	 * the GM can see how far they have got over a picture that draws the ground
	 * itself.
	 * Redrawn only when the Realm or the tool in hand has changed: the Realm is
	 * read from a cache that a new object replaces on every edit, so its own
	 * identity says whether the marks still stand.
	 */
	#drawMarks() {
		const grid = canvas.interface?.grid;
		const realm = this.active && isRealmScene(canvas.scene) ? getRealm(canvas.scene)?.realm : null;
		const showing = realm && this.tool === "terrain" && hidesTerrain(realm) ? realm : null;
		if (showing === this.#marked) return;
		this.#marked = showing;
		grid.addHighlightLayer(MARKS);
		grid.clearHighlightLayer(MARKS);
		for (const name of this.#names?.removeChildren() ?? []) name.destroy();
		if (!showing) return;

		const g = sceneGeometry(canvas.scene);
		const style = this.#namesStyle(g);
		for (const hex of allHexes(g)) {
			const terrain = showing.terrain[hexIndex(g, hex)];
			const holding = featureAt(showing, hex).holding;
			if (terrain) {
				const { x, y } = hexTopLeft(g, hex);
				grid.highlightPosition(MARKS, { x, y, color: terrainMark(terrain), alpha: MARK_ALPHA });
			}
			const lines = [
				terrain ? t(`realm.terrain.${TERRAIN[terrain - 1]}`) : null,
				holding ? holding.name || t(`realm.holdings.${holding.style}`) : null
			].filter(Boolean);
			if (lines.length && this.#names) this.#writeName(lines.join("\n"), hexCentre(g, hex), style);
		}
	}

	/**
	 * The lettering of a marked hex's name: the sheet's own hand, in ink on a
	 * paper edge so it reads over any drawing.
	 * @param {object} g
	 * @returns {PIXI.TextStyle}
	 */
	#namesStyle(g) {
		const { fontSize, strokeThickness } = markedHexLettering(g.size);
		return foundry.canvas.containers.PreciseText.getTextStyle({
			fontFamily: ["Bastionland Body", "Georgia", "serif"],
			fontSize,
			fontWeight: "bold",
			fill: INK_HEX,
			stroke: PAPER,
			strokeThickness,
			align: "center",
			dropShadow: false
		});
	}

	/**
	 * @param {string} text
	 * @param {{x: number, y: number}} centre
	 * @param {PIXI.TextStyle} style
	 */
	#writeName(text, { x, y }, style) {
		const name = this.#names.addChild(new foundry.canvas.containers.PreciseText(text, style));
		name.anchor.set(0.5);
		name.position.set(x, y);
	}

	/**
	 * A line through the middle of each hex of a river being drawn.
	 * @param {object} g
	 * @param {{col: number, row: number}[]} course
	 */
	#drawCourse(g, course) {
		if (!this.#preview || !course.length) return;
		const [first, ...rest] = course.map((hex) => hexCentre(g, hex));
		this.#preview.lineStyle({ width: g.size / 8, color: WATER, alpha: 0.8, cap: PIXI.LINE_CAP.ROUND, join: PIXI.LINE_JOIN.ROUND });
		this.#preview.moveTo(first.x, first.y);
		for (const point of rest) this.#preview.lineTo(point.x, point.y);
		if (!rest.length) this.#preview.drawCircle(first.x, first.y, g.size / 16);
	}

	/**
	 * Ring each loose end of the rivers, where a drag carries one on.
	 * @param {object} g
	 */
	#markRiverEnds(g) {
		const realm = getRealm(canvas.scene)?.realm;
		const ends = realm ? riverEnds(realm) : [];
		if (!this.#preview || !ends.length) return;
		this.#preview.lineStyle({ width: g.size / 20, color: WATER, alpha: 0.8 });
		for (const hex of ends) {
			const { x, y } = hexCentre(g, hex);
			this.#preview.drawCircle(x, y, g.size / 4);
		}
	}

	/** @override */
	_onClickLeft(event) {
		const scene = canvas.scene;
		if (!game.user.isGM || !isRealmScene(scene)) return;

		if (this.tool === "inspect") {
			const hex = hexAt(sceneGeometry(scene), canvas.mousePosition);
			if (hex) {
				openRealmPanel({ scene, hex });
				// The Lay of the Land follows along, but only if the GM already had it open.
				followHexLore({ scene, hex });
			}
			return;
		}

		if (this.tool !== "terrain") return;
		this.#brushClick(event, false);
	}

	/**
	 * A right-click takes away what the brush lays: the Barrier along the edge,
	 * the Holding or Landmark in the hex, or the river through it. Terrain is
	 * never empty, so it has nothing to take away.
	 * @override
	 */
	_onClickRight(event) {
		if (!game.user.isGM || !isRealmScene(canvas.scene) || this.tool !== "terrain") return;
		this.#brushClick(event, true);
	}

	/**
	 * Lay the paint tool's brush where the pointer is, or take away what stands
	 * there. A brush takes away what it would lay again: clicking an edge that
	 * already has a Barrier, or a hex that already has this Holding or Landmark,
	 * leaves it empty. Shift-click empties a hex too, and reveals or hides a
	 * Barrier instead.
	 * @param {PIXI.FederatedEvent} event
	 * @param {boolean} erase Whether the click only takes away, as a right-click does.
	 */
	#brushClick(event, erase) {
		const scene = canvas.scene;
		const g = sceneGeometry(scene);
		const point = canvas.mousePosition;

		// Barriers run along the edges between hexes, not in them, so that brush works on the edge under the pointer.
		if (this.brush === "barrier") {
			const found = edgeAt(g, point);
			if (!found) return;
			editRealm(scene, (realm, geometry) => {
				const state = barrierState(realm, found.key);
				let next;
				if (erase) next = "none";
				else if (event.shiftKey) next = { hidden: "revealed", revealed: "hidden", none: "none" }[state];
				else next = state === "none" ? "hidden" : "none";
				return setBarrier(realm, geometry, found.key, next);
			});
			return;
		}

		const hex = hexAt(g, point);
		if (!hex) return;
		const realm = getRealm(scene).realm;
		const here = featureAt(realm, hex);

		const placeable = FEATURE_BRUSHES[this.brush];
		if (placeable) {
			// Alt picks up the feature under the pointer, as it picks up terrain.
			if (event.altKey && !erase) {
				setRealmBrush(placeable.pick(here));
				return;
			}
			const feature = placeable.build(here);
			const taking = erase || event.shiftKey || featureStands(realm, hex, feature);
			if (taking && !placeable.at(here)) return;
			editRealm(scene, (current, geometry) => placeFeature(current, geometry, hex, taking ? null : feature));
			if (!taking) placeable.laid?.();
			return;
		}

		if (event.altKey && !erase) {
			setRealmBrush(terrainAt(realm, g, hex) || "terrain");
			return;
		}
		if (this.drawsRiver) {
			if (erase || event.shiftKey) editRealm(scene, (current) => trimRiver(current, hex));
			return;
		}
		if (erase) return;
		editRealm(scene, (current, geometry) => paintTerrain(current, geometry, [hex], RealmPanel.terrain));
	}

	/**
	 * Ctrl+Z takes back the last Realm edit.
	 * @override
	 */
	_onUndoKey(_event) {
		if (!game.user.isGM || !isRealmScene(canvas.scene)) return false;
		stepRealmHistory(canvas.scene, "undo");
		return true;
	}

	/**
	 * Terrain and the river are laid by the hexful, in a drag; a Barrier and a
	 * Landmark are placed one at a time, by a click.
	 * @override
	 */
	_canDragLeftStart(_user, _event) {
		return ["terrain", "river"].includes(this.brush) && isRealmScene(canvas.scene);
	}

	/** @override */
	_onDragLeftStart(event) {
		const g = sceneGeometry(canvas.scene);
		// Where the drag began, not where the pointer has got to by now.
		const origin = event.interactionData?.origin;
		this.#drag = this.drawsRiver ? riverDrag(g, (origin && hexAt(g, origin)) ?? this.hexAtPointer()) : terrainDrag();
		this.#paintHere();
	}

	/** @override */
	_onDragLeftMove(_event) {
		this.#paintHere();
	}

	/** @override */
	async _onDragLeftDrop(_event) {
		const drag = this.#drag;
		this.#drag = null;
		this.refreshHighlight();
		if (drag?.ready()) await editRealm(canvas.scene, drag.lay);
	}

	/** @override */
	_onDragLeftCancel(_event) {
		this.#drag = null;
		this.refreshHighlight();
	}

	/** Add the hex under the pointer to a terrain or river drag, drawing the drag again only when it's changed. */
	#paintHere() {
		if (this.#drag?.extend(sceneGeometry(canvas.scene), this.hexAtPointer())) this.refreshHighlight();
	}
}
