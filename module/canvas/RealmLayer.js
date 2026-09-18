import { editRealm, getRealm, isRealmScene, rerollRealm, sceneGeometry, stepRealmHistory, syncRealmScene } from "../actions/realm.js";
import { wildernessRoll } from "../actions/wilderness.js";
import { followHexLore } from "../apps/HexLore.js";
import { openRealmAppearance } from "../apps/RealmAppearance.js";
import { RealmPanel, openRealmPanel, refreshRealmPanel } from "../apps/RealmPanel.js";
import { REALM_BUTTONS, REALM_TOOLS, terrainAt } from "../rules/realm.js";
import { barrierState, paintTerrain, setBarrier } from "../rules/realm-edits.js";
import { edgeAt, edgeSegment, hexAt, hexKey, hexTopLeft, sameHex } from "../rules/realm-geometry.js";

/** The grid highlight the Realm tools draw in. */
const HIGHLIGHT = "bastionland-realm";

const INK = 0x231f1a;
const BLOOD = 0x8b1e1e;
const VERDIGRIS = 0x2f6150;

const TOOL_ICONS = Object.freeze({
	inspect: "fa-solid fa-magnifying-glass",
	terrain: "fa-solid fa-paintbrush",
	barrier: "fa-solid fa-road-barrier",
	wilderness: "fa-solid fa-tree",
	tidy: "fa-solid fa-broom",
	reroll: "fa-solid fa-dice",
	appearance: "fa-solid fa-palette"
});

/**
 * The GM's Realm tools on a Realm Scene: a control group beside Foundry's own,
 * with tools that work on hexes and buttons for the Wilderness Roll, Tidy and
 * Reroll.
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
			const tool = { name, order: index + 1, title: `bastionland.realm.tools.${name}`, icon: TOOL_ICONS[name] };
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
			onToolChange: (_event, tool, active) => {
				if (active && !tool.button) canvas.realm.setTool(tool.name);
			},
			tools,
			activeTool: "inspect"
		};
	}

	/** The tool in use: one of REALM_TOOLS that isn't a button. */
	tool = "inspect";

	/** @type {{col: number, row: number}|null} */
	hovered = null;

	/** @type {string|null} The edge the Barrier tool points at. */
	hoveredEdge = null;

	/** @type {Map<string, {col: number, row: number}>|null} Hexes a terrain drag has crossed. */
	#painting = null;

	/** @type {PIXI.Graphics|null} */
	#preview = null;

	#onPointerMove = () => this.#hover();

	/**
	 * @param {string} name
	 */
	setTool(name) {
		this.tool = name;
		this.#painting = null;
		if (name === "terrain" && isRealmScene(canvas.scene)) openRealmPanel({ scene: canvas.scene, mode: "terrain" });
		this.#hover(true);
	}

	/**
	 * @param {string} name One of REALM_BUTTONS.
	 */
	runButton(name) {
		const scene = canvas.scene;
		if (name === "wilderness") return wildernessRoll({ scene });
		if (name === "tidy") return syncRealmScene(scene, { report: true });
		if (name === "reroll") return rerollRealm(scene);
		if (name === "appearance") return openRealmAppearance();
		return null;
	}

	/** @override */
	async _draw(options) {
		await super._draw(options);
		this.#preview = this.addChild(new PIXI.Graphics());
		this.#preview.eventMode = "none";
	}

	/** @override */
	async _tearDown(options) {
		canvas.stage?.off("pointermove", this.#onPointerMove);
		canvas.interface?.grid?.destroyHighlightLayer(HIGHLIGHT);
		this.#preview = null;
		this.#painting = null;
		this.hovered = null;
		this.hoveredEdge = null;
		return super._tearDown(options);
	}

	/** @override */
	_activate() {
		canvas.stage.on("pointermove", this.#onPointerMove);
	}

	/** @override */
	_deactivate() {
		canvas.stage.off("pointermove", this.#onPointerMove);
		this.#painting = null;
		this.hovered = null;
		this.hoveredEdge = null;
		this.refreshHighlight();
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
		const edge = g && this.tool === "barrier" ? edgeAt(g, canvas.mousePosition)?.key ?? null : null;
		const sameSpot = hex ? sameHex(hex, this.hovered) : !this.hovered;
		if (!force && sameSpot && edge === this.hoveredEdge) return;
		this.hovered = hex;
		this.hoveredEdge = edge;
		if (this.#painting) this.#paintHere();
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
		if (!this.active || !isRealmScene(canvas.scene)) return;
		const g = sceneGeometry(canvas.scene);

		if (this.#painting) {
			for (const hex of this.#painting.values()) {
				const { x, y } = hexTopLeft(g, hex);
				grid.highlightPosition(HIGHLIGHT, { x, y, color: VERDIGRIS, border: INK, alpha: 0.3 });
			}
			return;
		}

		if (this.tool === "barrier") {
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
		grid.highlightPosition(HIGHLIGHT, { x, y, color: this.tool === "terrain" ? VERDIGRIS : BLOOD, border: INK, alpha: 0.18 });
	}

	/** @override */
	_onClickLeft(event) {
		const scene = canvas.scene;
		if (!game.user.isGM || !isRealmScene(scene)) return;
		const g = sceneGeometry(scene);
		const point = canvas.mousePosition;

		if (this.tool === "inspect") {
			const hex = hexAt(g, point);
			if (hex) {
				openRealmPanel({ scene, hex });
				// The Lay of the Land follows along, but only if the GM already had it open.
				followHexLore({ scene, hex });
			}
			return;
		}

		if (this.tool === "terrain") {
			const hex = hexAt(g, point);
			if (!hex) return;
			if (event.altKey) {
				RealmPanel.brush = terrainAt(getRealm(scene).realm, g, hex) || RealmPanel.brush;
				refreshRealmPanel(scene.id);
				return;
			}
			editRealm(scene, (realm, geometry) => paintTerrain(realm, geometry, [hex], RealmPanel.brush));
			return;
		}

		if (this.tool === "barrier") {
			const found = edgeAt(g, point);
			if (!found) return;
			editRealm(scene, (realm, geometry) => {
				const state = barrierState(realm, found.key);
				let next;
				if (event.shiftKey) next = { hidden: "revealed", revealed: "hidden", none: "none" }[state];
				else next = state === "none" ? "hidden" : "none";
				return setBarrier(realm, geometry, found.key, next);
			});
		}
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

	/** @override */
	_canDragLeftStart(_user, _event) {
		return this.tool === "terrain" && isRealmScene(canvas.scene);
	}

	/** @override */
	_onDragLeftStart(_event) {
		this.#painting = new Map();
		this.#paintHere();
	}

	/** @override */
	_onDragLeftMove(_event) {
		this.#paintHere();
	}

	/** @override */
	async _onDragLeftDrop(_event) {
		const hexes = [...(this.#painting?.values() ?? [])];
		this.#painting = null;
		this.refreshHighlight();
		if (hexes.length) await editRealm(canvas.scene, (realm, g) => paintTerrain(realm, g, hexes, RealmPanel.brush));
	}

	/** @override */
	_onDragLeftCancel(_event) {
		this.#painting = null;
		this.refreshHighlight();
	}

	/** Add the hex under the pointer to a terrain drag, drawing the drag again only when it's a new one. */
	#paintHere() {
		const hex = this.hexAtPointer();
		if (!this.#painting || !hex || this.#painting.has(hexKey(hex))) return;
		this.#painting.set(hexKey(hex), hex);
		this.refreshHighlight();
	}
}
