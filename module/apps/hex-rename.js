import { t } from "../chat/cards.js";
import { MAX_HEX_NAME, cleanHexName } from "../rules/hex-names.js";
import { MAX_SPARK_NAME, cleanSparkName } from "../rules/hex-lore.js";

/**
 * A name a GM changes where it's shown: a click on its button turns it into a
 * box holding the name, which Enter or leaving the box keeps and Escape leaves
 * as it was. Keeping it writes the Scene, and the window is drawn again from that.
 * @param {HTMLElement|null|undefined} root Where the buttons are drawn.
 * @param {string} attribute The data attribute on each button holding the name as it stands, such as "data-hex-rename".
 * @param {object} options
 * @param {string} options.className The box's class.
 * @param {number} options.maxLength
 * @param {string} options.placeholder
 * @param {string} options.label
 * @param {string} options.hint
 * @param {(name: unknown) => string} options.clean
 * @param {(name: string, button: HTMLElement) => Promise<unknown>} options.save Writes the name.
 */
export function wireRenameInPlace(root, attribute, { className, maxLength, placeholder, label, hint, clean, save }) {
	for (const button of root?.querySelectorAll(`[${attribute}]`) ?? []) {
		button.addEventListener("click", (event) => {
			event.preventDefault();
			const was = button.getAttribute(attribute) ?? "";
			const input = document.createElement("input");
			input.type = "text";
			input.className = className;
			input.value = was;
			input.maxLength = maxLength;
			input.placeholder = placeholder;
			input.setAttribute("aria-label", label);
			input.dataset.tooltip = hint;
			let done = false;
			// Left by a key, the button takes the focus back; left by a click elsewhere, the focus stays where it went.
			const finish = (keep, byKey) => {
				if (done) return;
				done = true;
				const name = clean(input.value);
				input.replaceWith(button);
				if (keep && name !== clean(was)) save(name, button);
				else if (byKey) button.focus({ preventScroll: true });
			};
			input.addEventListener("keydown", (key) => {
				// Neither Enter nor Escape is the window's: one would send its form, the other close it.
				if (key.key !== "Enter" && key.key !== "Escape") return;
				key.preventDefault();
				key.stopPropagation();
				finish(key.key === "Enter", true);
			});
			input.addEventListener("blur", () => finish(true, false));
			// Nothing the window does as its fields change is for this box.
			for (const type of ["input", "change"]) input.addEventListener(type, (each) => each.stopPropagation());
			button.replaceWith(input);
			input.focus();
			input.select();
		});
	}
}

/**
 * A hex's heading as a GM names it (hex-heading.hbs).
 * @param {HTMLElement|null|undefined} root Where the heading is drawn.
 * @param {(name: string) => Promise<unknown>} save Writes the name.
 */
export function wireHexRename(root, save) {
	wireRenameInPlace(root, "data-hex-rename", {
		className: "bastionland-hex-heading__input",
		maxLength: MAX_HEX_NAME,
		placeholder: t("realm.hexName.placeholder"),
		label: t("realm.hexName.label"),
		hint: t("realm.hexName.hint"),
		clean: cleanHexName,
		save
	});
}

/**
 * The names of people kept in a hex, as a GM changes them in the Lay of the Land (hex-spark.hbs).
 * @param {HTMLElement|null|undefined} root Where the hex's rolls are drawn.
 * @param {(id: string, name: string) => Promise<unknown>} save Writes the name of the roll with that id.
 */
export function wirePersonRename(root, save) {
	wireRenameInPlace(root, "data-person-rename", {
		className: "bastionland-hex-heading__input bastionland-person__input",
		maxLength: MAX_SPARK_NAME,
		placeholder: t("people.unnamed"),
		label: t("people.nameLabel"),
		hint: t("people.nameHint"),
		clean: cleanSparkName,
		save: (name, button) => save(button.dataset.spark, name)
	});
}
