import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "../..");
const read = (path) => readFileSync(join(root, path), "utf8");

/**
 * What's left open is drawn in the Toolkit's own dress, so its words sit where
 * every other chip's do: measured live at 1x, 1.25x and 1.5x on 2026-11-18,
 * all within half a pixel. These keep it from drifting into chips of its own.
 */
describe("the Left Open list's chips and words", () => {
	const page = read("templates/actor/gm-toolkit/time.hbs");
	const section = page.slice(page.indexOf("bastionland-gm-toolkit__threads"), page.indexOf("{{#if offCourse.shown}}"));

	it("draws a thread's kind and hex as the Toolkit's trimmed pills, never a chip of its own", () => {
		const chips = section.match(/class="[^"]*__chip\b[^"]*"/g) ?? [];
		expect(chips.length).toBeGreaterThanOrEqual(3);
		for (const chip of chips) expect(chip).toContain("bastionland-gm-toolkit__chip bastionland-pill");
		// The hex is a button, which Foundry makes a flex box the trim can't reach: it takes the block variant.
		expect(section).toMatch(/<button[^>]*bastionland-gm-toolkit__chip--button[^>]*data-action="showHex"/);
	});

	it("keeps the pencil out of sight until the row is pointed at", () => {
		expect(section).toContain('<li class="bastionland-reveal-host" data-thread-id="{{id}}">');
		expect(section).toMatch(/class="bastionland-icon bastionland-reveal" data-action="editThread"/);
	});

	it("spaces the row with gap alone, so no entry's margin pushes its words off the middle", () => {
		const css = read("styles/gm-toolkit.css");
		const rule = (selector) => css.slice(css.indexOf(`${selector} {`), css.indexOf("}", css.indexOf(`${selector} {`)));
		for (const selector of [".bastionland-gm-toolkit__thread", ".bastionland-gm-toolkit__thread-tools"]) {
			expect(rule(selector)).toContain("align-items: center");
			expect(rule(selector)).toMatch(/gap: /);
			expect(rule(selector)).not.toMatch(/margin/);
		}
	});

	it("says what's left open in a hex as lines of the Lay of the Land, with words for buttons and no new chip", () => {
		const pane = read("templates/apps/parts/hex-gm.hbs");
		const block = pane.slice(pane.indexOf("bastionland-hex-lore__open"), pane.indexOf("form-group bastionland-hex-lore__note"));
		expect(block).not.toMatch(/bastionland-pill|__chip/);
		expect(block.match(/class="bastionland-hex-lore__told-tell"/g)).toHaveLength(2);
	});
});
