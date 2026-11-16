import { realmGeometry } from "../../module/rules/realm-geometry.js";

/** The book's 12×12 Realm the generator tests roll on. */
export const g = realmGeometry();

/** The seeds the generator tests roll their Realms from. */
export const seeds = Array.from({ length: 40 }, (_, index) => `seed-${index}`);
