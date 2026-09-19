/** The "~" between two Seer prompts, and the class that turns it into a plain line break. */
const SEP = ".bastionland-seer__sep";
const BREAK = "is-break";

/** Prompt lines already watched, so a render doesn't watch one twice. */
const watched = new WeakSet();

/**
 * Hide each "~" that falls where the prompts line wraps, making it a line
 * break instead, so no line starts or ends with a "~". Taken in order, since
 * each break decides where the rest of the line falls.
 * @param {HTMLElement} line The prompts paragraph.
 */
export function breakPromptLine(line) {
	const seps = [...line.querySelectorAll(SEP)];
	for (const sep of seps) sep.classList.remove(BREAK);
	for (const sep of seps) {
		const before = sep.previousElementSibling;
		const after = sep.nextElementSibling;
		if (!before || !after) continue;
		const { top, height } = before.getBoundingClientRect();
		if (Math.abs(after.getBoundingClientRect().top - top) > height / 2) sep.classList.add(BREAK);
	}
}

/**
 * Break every prompts line under a sheet, again whenever its width or font changes
 * (a hidden page shows, the sheet is resized, or Text Size or Typeface is changed).
 * @param {HTMLElement} root The sheet.
 */
export function watchPromptLines(root) {
	for (const line of root.querySelectorAll(".bastionland-seer__prompts")) {
		if (!line.querySelector(SEP) || watched.has(line)) continue;
		watched.add(line);
		breakPromptLine(line);
		if (typeof ResizeObserver !== "function") continue;
		let laidOut = null;
		const observer = new ResizeObserver(([entry]) => {
			if (!line.isConnected) return observer.disconnect();
			// Only width and font move the wraps; a break's own height change needn't redo them.
			const { fontSize, fontFamily } = getComputedStyle(line);
			const key = `${entry.contentRect.width}|${fontSize}|${fontFamily}`;
			if (key === laidOut) return;
			laidOut = key;
			breakPromptLine(line);
		});
		observer.observe(line);
	}
}
