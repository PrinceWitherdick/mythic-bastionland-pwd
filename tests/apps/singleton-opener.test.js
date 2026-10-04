import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { singletonOpener } from "../../module/apps/ui.js";

/** Windows on show, by id, as foundry.applications.instances keeps them. */
let instances;

/** A window with a fixed id, which is on the page while it's the one Foundry holds under that id. */
class Window {
	static DEFAULT_OPTIONS = { id: "bastionland-test-window" };
	rendered = false;
	element = { isConnected: false };
	render() {
		const before = instances.get(Window.DEFAULT_OPTIONS.id);
		// Drawn under the same id, it takes the other one's place on the page.
		if (before && before !== this) before.element.isConnected = false;
		this.rendered = true;
		this.element.isConnected = true;
		instances.set(Window.DEFAULT_OPTIONS.id, this);
		return this;
	}
	close() {
		instances.delete(Window.DEFAULT_OPTIONS.id);
		this.element.isConnected = false;
	}
}

beforeEach(() => {
	instances = new Map();
	globalThis.foundry = { applications: { instances } };
});

afterEach(() => {
	delete globalThis.foundry;
});

describe("singletonOpener", () => {
	it("opens one window and brings the same one forward again", () => {
		const open = singletonOpener(Window);
		const first = open();
		expect(open()).toBe(first);
	});

	it("brings forward the copy Foundry's settings list opened under the same id", () => {
		const open = singletonOpener(Window);
		open();
		const fromSettings = new Window().render();
		expect(open()).toBe(fromSettings);
	});

	it("makes a fresh window once a copy that took its place is shut", () => {
		const open = singletonOpener(Window);
		const first = open();
		new Window().render().close();
		const again = open();
		expect(again).not.toBe(first);
		expect(again.element.isConnected).toBe(true);
	});
});
