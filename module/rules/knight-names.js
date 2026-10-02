/**
 * Names for Knights. The book names none of its Knights, only the kind of
 * Knight each is, so the Knight chooser rolls a name from these: given names
 * found in medieval England, France, Wales, Ireland and the North, in
 * chronicles, charters and romances. Plain data, so it can be tested without
 * Foundry.
 */

export const KNIGHT_NAMES = Object.freeze([
	// Men
	"Adalbert", "Aelfric", "Alan", "Alaric", "Aldred", "Amaury", "Ambrose", "Anselm", "Arnulf", "Aubrey",
	"Aymer", "Baldwin", "Bardolf", "Benedict", "Berengar", "Bertram", "Brian", "Cadoc", "Conan", "Conrad",
	"Cuthbert", "Drogo", "Duncan", "Dunstan", "Eadric", "Edgar", "Edmund", "Emeric", "Engelram", "Eustace",
	"Everard", "Fulk", "Gawain", "Geoffrey", "Gerard", "Gervase", "Gilbert", "Giles", "Godfrey", "Godric",
	"Gruffydd", "Guy", "Hamo", "Hereward", "Hubert", "Hugh", "Humphrey", "Ivo", "Jocelyn", "Lambert",
	"Leofric", "Lionel", "Madoc", "Mauger", "Milo", "Nigel", "Odo", "Osbert", "Osric", "Oswald",
	"Owain", "Payne", "Percival", "Piers", "Ralf", "Ranulf", "Reginald", "Rhys", "Roland", "Serlo",
	"Tancred", "Theobald", "Thurstan", "Tristram", "Ulf", "Waleran", "Walter", "Warin", "Wulfstan", "Wymond",
	// Women
	"Adela", "Adeliza", "Agnes", "Albreda", "Aldith", "Alice", "Alienor", "Amabel", "Amice", "Angharad",
	"Ascelina", "Astrid", "Avelina", "Avice", "Basilia", "Beatrice", "Berengaria", "Cecily", "Christiana", "Clemence",
	"Constance", "Dionisia", "Edith", "Elaine", "Elfrida", "Emma", "Emmeline", "Enid", "Ermengarde", "Ermentrude",
	"Estrild", "Eufemia", "Eve", "Goda", "Godiva", "Gormlaith", "Gundreda", "Gunnhild", "Gwenllian", "Hawise",
	"Helewise", "Hilda", "Ida", "Idonea", "Isabel", "Isolde", "Joan", "Juliana", "Lettice", "Mabel",
	"Margery", "Matilda", "Maud", "Millicent", "Muriel", "Nest", "Nichola", "Orabilis", "Petronilla", "Philippa",
	"Ragnhild", "Richenda", "Rohese", "Rosamund", "Sabina", "Sibyl", "Sigrid", "Theophania", "Thora", "Wulfrun"
]);

/**
 * A name from KNIGHT_NAMES, never one of those to avoid while any other is left.
 * @param {() => number} [source] Numbers in [0, 1).
 * @param {Iterable<string>} [avoid] Such as the name showing and other Knights' names.
 * @returns {string}
 */
export function rollKnightName(source = Math.random, avoid = []) {
	return rollFreeName(KNIGHT_NAMES, source, avoid);
}

/**
 * A name from a list, never one of those to avoid while any other is left.
 * @param {readonly string[]} names
 * @param {() => number} [source] Numbers in [0, 1).
 * @param {Iterable<string>} [avoid] Matched whatever their case or spacing.
 * @returns {string|null} Null for an empty list.
 */
export function rollFreeName(names, source = Math.random, avoid = []) {
	if (!names.length) return null;
	const taken = new Set(Array.from(avoid, (name) => String(name ?? "").trim().toLowerCase()));
	const free = names.filter((name) => !taken.has(name.toLowerCase()));
	const pool = free.length ? free : names;
	return pool[Math.min(pool.length - 1, Math.floor(source() * pool.length))];
}

/**
 * The name the chooser starts with: the Knight's own, but not the stand-in
 * Create Actor gives when none was typed, such as "Knight" or "Knight (2)".
 * @param {string|null|undefined} name The actor's name.
 * @param {string} standIn The actor type's label, "Knight".
 * @returns {string} The name, or "" for a stand-in.
 */
export function startingName(name, standIn) {
	const trimmed = String(name ?? "").trim();
	const label = String(standIn ?? "").trim().toLowerCase();
	const bare = trimmed.toLowerCase().replace(/\s+\(\d+\)$/, "");
	return label && bare === label ? "" : trimmed;
}
