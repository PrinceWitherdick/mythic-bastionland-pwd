/**
 * A layer of marks over the Realm on the canvas, drawn again only when what it
 * shows has changed. Foundry destroys what hangs on its groups as the canvas
 * is torn down, so each Scene drawn gets a layer of its own.
 * @param {number} zIndex Where it stands among the interface's other drawing.
 * @returns {(key: string, paint: (layer: PIXI.Container) => void) => void} Draws
 *   the marks again with `paint` unless `key`, where they stand, is as last drawn.
 *   An empty key leaves the layer bare.
 */
export function marksLayer(zIndex) {
	/** @type {PIXI.Container|null} */
	let layer = null;
	let drawn = null;
	return (key, paint) => {
		if (!layer || layer.destroyed || layer.parent !== canvas.interface) {
			layer = new PIXI.Container();
			layer.eventMode = "none";
			layer.zIndex = zIndex;
			canvas.interface.addChild(layer);
			drawn = null;
		}
		if (key === drawn) return;
		for (const mark of layer.removeChildren()) mark.destroy({ children: true });
		drawn = key;
		if (key) paint(layer);
	};
}
