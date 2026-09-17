import { describe, expect, it } from "vitest";
import { checkChargeSvg, cleanChargeSvg, withNotice } from "../scripts/lib/charge-svg.js";

/** A drawing laid out as the Book of Traceable Heraldic Art exports them, with a leftover picture frame. */
const drawing = ({ fill = "#f3f3f3", line = "black", extra = "" } = {}) => `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns:xl="http://www.w3.org/1999/xlink" xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="36 72 292.5 319.5" width="292.5" height="319.5">
  <defs>
    <clipPath id="artboard_clip_path">
      <path d="M 328.5 72 L 36 72 L 36 391.5 L 328.5 391.5 Z"/>
    </clipPath>
  </defs>
  <g id="Crampon_(3)" stroke-opacity="1" stroke="none" stroke-dasharray="none" fill="none" fill-opacity="1">
    <title>Crampon (3)</title>
    <g id="Crampon_(3)_Layer_2" clip-path="url(#artboard_clip_path)">
      <title>Layer 2</title>
      <g id="Graphic_10">
        <rect x="296.53704" y="384.8976" width="76.752" height="92.1024" id="path"/>
        <clipPath id="clip_path"><use xl:href="#path"/></clipPath>
        <g clip-path="url(#clip_path)">
          <image xl:href="image88.pdf" width="291" height="316" transform="matrix(.26 0 0 .26999998 297.08304 388.2888)"/>
        </g>
      </g>
      <g id="Graphic_3">
        <path d="M 204.75 291.375 L 159.75 388.125 L 38.25 219.375 Z" fill="${fill}"/>
        <path d="M 204.75 291.375 L 159.75 388.125 L 38.25 219.375 Z" stroke="${line}" stroke-linecap="round" stroke-width="2"/>
        ${extra}
      </g>
    </g>
  </g>
</svg>`;

describe("cleanChargeSvg", () => {
	it("keeps only the charge's two colours, and a line colour for whatever inherits one", () => {
		const { svg, notes } = cleanChargeSvg(drawing());
		const paints = [...svg.matchAll(/\s(?:fill|stroke)="([^"]*)"/g)].map(([, paint]) => paint);
		expect(paints.filter((paint) => !["#f3f3f3", "#000", "none"].includes(paint))).toEqual([]);
		expect(paints).toContain("#f3f3f3");
		expect(svg).toMatch(/^<svg[^>]* fill="#000"/);
		expect(svg).toContain('stroke="#000"');
		expect(notes).toContain("had an image rig");
	});

	it("drops the leftover picture and its frame", () => {
		const { svg } = cleanChargeSvg(drawing());
		expect(svg).not.toMatch(/<image|<rect|<use|image88/);
	});

	it("drops the doctype, titles and xlink", () => {
		const { svg } = cleanChargeSvg(drawing());
		expect(svg).not.toMatch(/<!DOCTYPE|<\?xml|<title|xmlns:xl/);
	});

	it("keeps the drawing's size and rounds its coordinates", () => {
		const { svg } = cleanChargeSvg(drawing());
		expect(svg).toMatch(/^<svg[^>]* viewBox="36 72 292.5 319.5"/);
		expect(svg).not.toMatch(/\d\.\d{2}/);
	});

	it.each(["#e1e1e1", "#ccc", "white"])("flattens a pale %s into the charge's colour", (fill) => {
		const { svg, notes } = cleanChargeSvg(drawing({ fill }));
		expect(svg).toContain('fill="#f3f3f3"');
		expect(notes).toContain("greys flattened");
	});

	it.each(["#383838", "#333", "#00001c"])("darkens a near-black %s into the line colour", (line) => {
		const { svg } = cleanChargeSvg(drawing({ line }));
		expect(svg).toContain('stroke="#000"');
	});

	it.each(["#999", "yellow", "#d93020"])("refuses a colour a charge can't be tinted from: %s", (fill) => {
		expect(() => cleanChargeSvg(drawing({ fill }))).toThrow(/Unexpected fill/);
	});

	it("refuses see-through shading", () => {
		expect(() => cleanChargeSvg(drawing({ extra: '<path d="M1 1h2" fill="#f3f3f3" fill-opacity=".5"/>' }))).toThrow(/fill-opacity/);
	});

	it("prefixes ids, so many drawings can share a page", () => {
		const { svg } = cleanChargeSvg(drawing(), { prefix: "tower-b" });
		expect(svg).toMatch(/id="tower-b-/);
		expect(svg).toMatch(/url\(#tower-b-/);
	});
});

describe("withNotice", () => {
	const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path fill="#f3f3f3" d="M0 0h5v5z"/></svg>';

	it("puts the credit first inside the drawing, escaped", () => {
		const credited = withNotice(svg, "Source: Fictitious & Symbolic Creatures in Art. <b>");
		expect(credited).toMatch(/^<svg[^>]*><desc>Source: Fictitious &amp; Symbolic Creatures in Art\. &lt;b&gt;<\/desc><path/);
	});

	it("leaves the drawing one the painter can tint", () => {
		expect(() => checkChargeSvg(withNotice(svg.replace("<svg", '<svg width="10" height="10" fill="#000"'), "© 2016–2023 Someone. Licence: CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/."))).not.toThrow();
	});
});

describe("checkChargeSvg", () => {
	const ok = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="#000" viewBox="0 0 10 10"><path fill="#f3f3f3" d="M0 0h5v5z"/></svg>';

	it("passes a clean charge", () => {
		expect(() => checkChargeSvg(ok)).not.toThrow();
	});

	it.each([
		["no viewBox", ok.replace(' viewBox="0 0 10 10"', "")],
		["no charge colour", ok.replace("#f3f3f3", "#000")],
		["another colour", ok.replace("#f3f3f3", "#b0261e")],
		["a script", ok.replace("</svg>", "<script>alert(1)</script></svg>")],
		["an event handler", ok.replace("<path", '<path onclick="alert(1)"')],
		["an outside link", ok.replace("<path", '<use href="https://example.com/a.svg#b"/><path')],
		["a style", ok.replace("<path", '<path style="fill:red"')]
	])("refuses a drawing with %s", (_label, svg) => {
		expect(() => checkChargeSvg(svg)).toThrow();
	});
});
