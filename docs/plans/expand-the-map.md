# Plan: Expand a Realm's map after it's made

A brief for whoever builds this. It is a working document: delete it before the branch is merged.

## What is wanted, and why

A Referee asked to make a Realm's map bigger once play is under way. At their table the Knights became rulers of the Realm and the map had to take in more land. The same need arises when a Company walks off the edge of the map.

Today a Realm keeps its number of hexes for life. The wiki says so (`wiki/Making-a-Realm.md:147`) and so do two strings (`realm.picture.bare.keepsRealmSize`, `realm.picture.bare.cropped` in `languages/en.json`). The only way to a bigger map is a New Realm, which loses everything play has written onto the old one.

The feature: a Referee adds columns and rows of hexes to any side of a Realm that already stands, and nothing that play has built up is lost or lands in the wrong hex.

## What done looks like

1. A new Realm tool, **Expand the map**, opens a window where the Referee says how many hexes to add north, south, west and east, sees the result drawn, and confirms.
2. Afterwards every hex holds what it held, every Token stands in the hex it stood in, and everything the system keeps for a hex (names, notes, visits, sightings, Journal entries, Threads, Timeline rows) still belongs to that hex.
3. The new land is either rolled as the book rolls terrain, or left blank to paint.
4. It works on a Realm drawn in the system's ink, on one still being drawn by hand, and on one laid over an imported picture.
5. The Referee chooses whether hexes keep the numbers they had (new hexes to the north and west then count down through 0 into negatives) or the whole map is numbered again from 1.
6. The tool keeps a backup of the Realm before it changes anything, and can put the Realm back from it.
7. `npm run lint`, `npm test` and `npm run build` pass. Nobody can run Foundry in CI, so the live checks at the end of this plan go into `ROADMAP.md` for the owner to try.

Out of scope: shrinking a map, an Undo that keeps what play has done since (the backup puts the Realm back as it was, losing what came after), and turning a plain Foundry Scene with a background image into a Realm in place (New Realm → Import a map I drew already does that from the same picture).

## How a Realm is stored (read this before designing anything)

- A Realm is a Foundry Scene. Its geometry is `realmGeometry({size, cols, rows, layout})` in `module/rules/realm-geometry.js`, built from the Scene's Realm flag (`sceneGeometry` in `module/actions/realm.js:172`). The Scene's `width`, `height` and `grid.type` follow from it (`realmGridChanges`, `module/rules/realm-documents.js:467`).
- Hexes are `{col, row}` counted from 1. Keys are `"col,row"` (`hexKey`), and a Barrier's edge is `"c,r|c,r"` (`edgeKey`). `parseHexKey` accepts only non-negative digits.
- **The Scene's Tiles and Drawings are the Realm.** `realmFromDocuments` (`realm-documents.js:570`) reads it back: a terrain, Holding, Myth or Landmark Tile is in whichever hex its position falls in (`hexAt`), a Barrier is the edge key in its Drawing's flag, and rivers are hex keys in the Scene flag. Terrain and `variants` are arrays in `hexIndex` order (`(row-1)*cols + col-1`).
- Every write goes through `writeRealm` → `planRealmSync`, serialised by `queueRealmWrite`. `syncRealmScene` runs on the active GM's client each time a Realm Scene is drawn and rewrites anything that drifted.
- **The precedent is `setRealmLayout` (`module/actions/realm.js:1133`).** It already changes a standing Realm's geometry: it computes the new Realm (`relayRealm`), updates the Scene's grid and size, moves the Tiles (`relaidTileMoves`), calls `writeRealm`, forgets the Undo history and re-stands the Company (`restandCompany`). Read it first. This feature is the same shape with more to carry.

## The design

### 1. Shift the Realm underneath; let the Referee choose the numbers on top

Growing by `{west, east, north, south}` gives `cols + west + east` by `rows + north + south`. An old hex `(c, r)` becomes `(c + west, r + north)`. East and south growth moves nothing.

**What is stored always counts from 1.** `parseHexKey`, `hexIndex`, `allHexes`, the terrain arrays and Foundry's own grid all start at the top-left hex, so a stored hex below 1 would break them. Do not store one, whatever the Referee chooses below.

**What is shown is a separate matter, and is the Referee's choice.** The owner wants both offered:

- **Keep every hex's number.** Column 5, Row 7 stays Column 5, Row 7. A column added on the west is Column 0, the next Column -1, and so on. There is a Column 0: the count does not skip it.
- **Number the map again from 1.** Every hex north or west of nothing is 1, and old hexes take new numbers.

This is safe because it is display only. The Scene keeps a tick for which the Referee chose (`keepNumbers`); the growth log (design point 6) already records every shift. A shown hex is the stored hex less the total shift logged, when the tick is on, and the stored hex itself when it is off. Nothing stored differs between the two, so the Referee can change their mind at a later expansion and lose nothing.

The work is to route every place a hex's number is printed or typed through one pure helper, `shownHex(hex, numbering)`:

- The two strings that print a number: `realm.hex` ("Column {col}, Row {row}") and `realm.readout.coordinates` ("({col}, {row})").
- Their callers. Most go through `hexLabel` and `hexHeading` in `module/actions/hex-names.js`, which already have the Scene. These pass a raw hex today and need the Scene's numbering: `rules/travels.js:367`, `apps/RealmPanel.js:66`, `sheets/GmToolkitSheet.js:748`, `canvas/map-alignment.js:320`, `canvas/travels-click.js:54`, `actions/sighted.js:81,118`, `actions/homecoming.js:102`, `canvas/hex-readout.js:154`.
- The one place a number is typed: the Track a hex dialog (`templates/dialogs/track-hex.hbs`), whose fields run from 1 to the map's size. They must show and accept shown numbers and turn them back into stored ones.

Add a test that fails if either string is used outside the helper, so a later feature can't print a stored number by mistake. Journal entry sort (`entrySort`) and everything else internal stays on stored hexes.

The window offers the choice only when hexes are being added north or west, or when an earlier expansion has already shifted the map. Default to keeping numbers: it leaves old chat cards, players' own notes and any numbers printed on an imported map correct.

### 2. Flip the layout when the shift is odd

In a column layout every other column sits half a hex lower, so adding an odd number of columns on the west would move alternate columns by different amounts and break which hexes touch. The fix is to swap `evenColumns` ↔ `oddColumns` when `west` is odd, and `evenRows` ↔ `oddRows` when `north` is odd on a row layout. All four layouts are first-class (`REALM_LAYOUTS`, `GRID_TYPES`).

With that flip, every old hex moves by one constant pixel offset and keeps all six neighbours:

| Layout | dx | dy |
| --- | --- | --- |
| Columns (flat tops) | `1.5 × radius × west` | `size × north` |
| Rows (pointed tops) | `size × west` | `1.5 × radius × north` |

I checked this by hand against `hexCentre` and `shift`; prove it in a test for all four layouts.

`dx` is not a whole number of pixels (`radius` is `size / √3`), and Tile and Token positions are whole pixels. Compute each Realm Tile's new place from its hex (`hexCentre(to, shifted)` plus its own offset from the old centre), as `relaidTileMoves` does, so the `writeRealm` that follows finds nothing to correct. Round everything else.

### 3. Limits

Use `OWN_SIZE_LIMITS` (`module/rules/realm-setup.js:80`): 60 hexes a side, 900 in all. Each count is a whole number from 0 up; at least one must be above 0.

### 4. The order of writes

Because positions are the truth, a Realm read between two writes can be wrong, and `syncRealmScene` would then write the wrong thing back. So:

1. Refuse unless the user is a GM on a Realm Scene with no map alignment running (`map-alignment.js`) and no look preview open. Run everything inside `queueRealmWrite`. Call `settleRealmTiles` first.
2. Work out the whole change as plain data before writing any of it (see step 7 for why).
3. Set a guard flag on the Scene. While it is set, `syncRealmScene`, `changeRealm`, the hex-Journal sync (`hex-journals.js:335`) and `allowRealmMove` (the `preMoveToken` hook) stand down on every client.
4. Move the Scene's own documents, one `updateEmbeddedDocuments` per type, with `animate: false` and `NOT_A_MOVE` (`module/actions/company.js:44`) so no move is read as travel. Do this before the Scene's size changes: a size change redraws the canvas, and embedded writes into a canvas mid-draw are what `canvasRedrawn` in `actions/realm-map.js:274` exists to avoid.
5. Re-key the other documents (inventory below).
6. One `scene.update` carrying everything on the Scene itself: `width`, `height`, `grid.type`, the Realm flag (`cols`, `rows`, `layout`, re-keyed `rivers`, shifted `picture` rect), every per-hex flag re-keyed, `initial` shifted, and the growth log (design point 6). Pass the shift in the operation's options under the system id so each client can react.
7. Wait for the canvas to redraw, then `writeRealm` with the grown Realm to lay the new land.
8. Clear the guard. Then `forgetRealmHistory`, clear the `timeUndo` records (`writeAdvanceRecords([])`), `forgetHexArrivals(scene.id)`, run the hex-Journal sync once, refresh the thumbnail, and post a notice.

**Never delete and recreate a Holding, Myth or Landmark Tile.** Domains point at a Holding by its Tile id (`Scene.<id>.Tile.<id>`), and Realm Undo and Myth notes rely on ids too. Barrier Drawings keep theirs as well: update the edge key in each Drawing's flag in step 4 rather than letting the sync replace them.

### 5. Everything that has to move

**On the Scene (pixels), step 4.** Every placeable shifts by `(dx, dy)`, the Realm's or not: Tiles (the imported picture's included), Drawings, Tokens, Notes, AmbientLights, AmbientSounds, Walls, Regions, and MeasuredTemplates on v13. The system only makes Tiles, Drawings and the Company Token, but a Referee may have added the rest. Check the data shape of each type in both supported Foundry versions (`system.json`: 13 to 14.363) rather than assuming; Walls keep coordinates in `c`, Regions in their shapes.

**On the Scene (flags), step 6.** The registry is `hexStoreFlags()` in `module/actions/scene-changes.js:35`. Shapes differ, so each needs its own re-key:

| Flag | Shape | What to do |
| --- | --- | --- |
| `hexNames`, `hexLore`, `trackedHexes`, `journey` | `{hexes: {"c,r": …}}` | Re-key |
| `hexShared` | same, plus `met[].edge` edge keys inside each record | Re-key both |
| `sighted` | `{"c,r": {note}}`, no `hexes` wrapper | Re-key |
| `heldBack` | `{move, hexes: ["c,r"…]}`, or a bare array in old data | Re-key |
| `companyLastHex` | `{col, row}` | Shift |
| `companyMoves` | Undo memory for Token moves | Clear it |
| `mythNotes` | by Myth number | Nothing |

**Other documents, step 5.**

| Where | Shape | What to do |
| --- | --- | --- |
| Hex Journal entries | `flags.<sys>.hexJournal = {scene, hex: "c,r"}` and `sort = col*1000 + row` (`rules/hex-journal.js:151`) | Re-key the flag and the sort; the sync then renames them. Miss this and the next sync makes duplicate entries. |
| GM Toolkit actor | `system.threads.<id>.hex` where `.scene` is this Scene | Re-key |
| Timeline pages | `entries.<id>.key` of the form `visit:<sceneId>:<c,r>` and `note:<sceneId>:<c,r>` (`rules/timeline.js:113`) | Re-key |
| World setting `omenEntered` | `{scene, hex: {col, row}}` | Shift if it names this Scene |
| World setting `timeUndo` | before-and-after values of flag paths and Token positions | Clear all records; an old Undo would put hexes back where they no longer are |

Domains, Sites, Warbands and the Ledger hold no hex. No client setting or User flag does either.

**In memory, on every client, when the Scene update arrives with the shift in its options.** Pan the view by `(dx, dy)` so nobody's map jumps. Close or re-point the windows holding a hex: Places' selection, `HexEditor`, the shown-hex ring, the hex readout, and the BookFlip, SparkTables and RollPerson targets.

### 6. Old chat cards

Cards carry hex keys in their HTML (`data-hex-target`, `data-arrival-hex`, `data-landmark-hex`) and in flags (`arrived.held`, `arrived.orders`), and they print "Column 5, Row 7" as text. Rewriting thousands of messages is slow and fragile.

Instead keep a growth log on the Scene, `[{when, west, north}]`, written in step 6 with `serverNow()`. One pure helper turns a key from a card into today's key by adding every shift logged after the card's `timestamp`. Route the three click handlers (`chat/hex-target.js`, `actions/arrivals.js:499`, `chat/landmark-card.js:22`) through it. Old cards then open the right hex whichever numbering is chosen. With numbers kept, what is printed on them is still right. With the map numbered again from 1, the numbers printed on old cards and in a few Timeline rows (`place` from `settleThread`, `actions/threads.js:253`) are out of date, and the window says so beside that choice.

### 7. An expansion that is cut short

This is likely to be used on a campaign months old, so a browser closed halfway must not leave a broken map. Store the plan from step 2 in the guard flag: every embedded update with absolute values, the other-document updates, and the Scene update. Applying it twice is harmless. When the active GM's client finds the guard set at `ready` or `canvasReady`, it applies the stored plan again from the start, runs steps 7 and 8, and tells the Referee the expansion was finished. Roll the new land from a seed kept in the plan so a second run rolls the same land.

Measure the flag's size on a 30 by 30 Realm with a long journey. If it is unreasonable (several hundred kilobytes), store per-step markers with one sentinel document each instead. Build the feature without this first, then add it; do not release without it.

### 8. The new land

The window offers:

- **Roll its terrain** (the default for a Realm whose terrain was rolled). Clusters of d12 hexes as on p14, growing out from the land already there. `generateTerrain` (`module/rules/realm-generator.js:136`) already grows from a frontier beside set hexes, so give it a starting terrain. Scale the lake cap by the share of hexes added.
- **Leave it blank to paint** (the default for a Realm drawn by hand, `setup.roll.terrain === false`, or laid over a picture).
- A tick, off by default, which the owner has asked for: **Roll Landmarks and Barriers into it too**, hidden from players, at the book's density for the hexes added (`sizedCounts`, `barrierCount`), Barriers only on edges touching a new hex, and never walling a hex off (`isConnected`). No new Myths, since a Realm has six, and no Holdings or rivers.

Two rules for the generator work. Existing seeds must roll exactly the Realms they roll today: the seed tests in `tests/rules/` pin this, so add new paths rather than reordering random calls in old ones. And old hexes keep their terrain pictures (`variants`); only new hexes pick theirs (see `paintPictures` and `mendPictures` in `realm-pictures.js`).

Blank hexes on a finished Realm are new. Check that the hover readout, Places, the Wilderness Roll and travel cope with terrain 0, and fix only what breaks.

`realm.setup` takes its `cols` and `rows` from the geometry when read (`realm-documents.js:573`), so the palette's tallies should scale by themselves. Confirm it.

### 9. A Realm laid over a picture

Such a Realm already has real hexes; the picture is a Tile under them and terrain is marked with the brush but drawn at alpha 0 (`hidesTerrain`, `realm-documents.js:305`). So expanding works the same way. The picture shifts with everything else and the new hexes fall on bare paper. The Referee has two ways to fill them, and the window explains both:

- **Paint the new land in the Realm's own ink.** It won't match their picture. Make hiding per hex: a hex whose centre lies inside the picture's rect (`mapRect`) stays hidden, one outside is drawn, river and shore pieces included. Gate this behind a marker on the picture (`inkOutside: true`, set when the Referee picks this), so Realms that exist today, some with edge hexes outside their picture, look exactly as they did.
- **Bring in a bigger picture afterwards** with the Import map tool that already exists (`changeRealmPicture`). It keeps what every hex holds and lines the new picture up against the grown hexes.

Extending a painted picture so that new land matches it is not possible: there is nothing to draw from.

Replace the two strings that tell Referees to make a New Realm for a different size.

### 10. The backup, and putting the Realm back

The owner wants the tool to offer a backup itself, not only advise one. As far as I know Foundry has no way to start a world backup from inside a running world (confirm this); if so the backup is the system's own.

**Keeping it.** The window has a tick, on by default: **Keep a backup of this Realm first**. Before step 3 of the order of writes, save one JSON file holding the whole Scene (`scene.toObject()`), the growth about to be made, the system's version and the time. Save it on the server under the world's own folder with `ensureDirectories` and `uploadFile` (`module/book-art/files.js`), named for the Scene so the next expansion writes over it: Foundry gives no way to delete a file, so one backup a Scene, the latest. Confirm `.json` may be uploaded on both versions and on hosted servers. Note the file's path and time in a Scene flag. Offer **Download a copy** as well (`foundry.utils.saveDataToFile`, as `HeraldryPainter.js:2452` does), for a Referee who wants to keep older ones. If the file can't be saved, say so and ask whether to go on without it; never expand silently unbacked when the tick is on.

**Putting it back.** When the Scene has a backup, the window offers **Put the Realm back as it was on {date}**, behind a confirmation that says plainly what is lost. It restores two things, under the same guard flag as an expansion:

- *The Scene*, whole, from the file: its size, grid, flags and every Tile, Drawing, Token and other placeable, with their ids, since Domains point at Holding Tiles by id. Foundry's own Import Data on a Scene (`Document#importFromJSON`) replaces a document in place; check whether it keeps embedded ids on both versions, and write the replacement by hand if it doesn't.
- *What lives outside the Scene* (hex Journal entries, Toolkit Threads, Timeline row keys, `omenEntered`), re-keyed by the opposite shift, using the same functions with the amounts negated. This way things recorded since the expansion follow their hex back. Anything recorded for a hex of the new land, which no longer exists, loses its hex; it must never land on another one.

Then clear what an expansion clears: Realm Undo, the `timeUndo` records, the in-memory hex caches, and run the hex-Journal sync.

The confirmation, and the wiki, must say what the backup is and isn't: it holds this Realm's map and what is kept for its hexes. Putting it back loses everything done on this Realm since. The calendar, the Knights and everything else in the world stay as they are now.

## Suggested shape of the code

Follow the split the repository already keeps: pure rules in `module/rules/` with no Foundry in them, Foundry work in `module/actions/`, windows in `module/apps/` and `templates/dialogs/`.

- `module/rules/realm-growth.js` (new, pure): normalise and limit a growth; the target geometry with its flip; the hex, edge and pixel shifts; `growRealm(realm, from, growth)`; the per-type placeable shifts; a re-key function for each store shape; the card-key helper; the preview's SVG paths (see `hexOverlay` in `rules/realm-map.js:486` for the pattern).
- `module/actions/realm.js`: `expandRealm(scene, growth, options)` beside `setRealmLayout`, since it needs `queueRealmWrite`, `writeRealm`, `settleRealmTiles` and `refreshThumbnail`, which are private there.
- `module/rules/realm.js`: add the tool to `REALM_TOOLS`, `REALM_BUTTONS` and `REALM_TOOL_ICONS`; `RealmLayer.runButton` (`module/canvas/RealmLayer.js:242`) runs it.
- The window: use `inputDialog` (`module/apps/ui.js:282`) as `askForRealmPicture` does. Four number fields, the map drawn small with the new hexes around it, the resulting size ("14 by 12, 168 hexes"), the new-land choice with its Landmarks and Barriers tick, the numbering choice (design point 1), the backup tick and the way back from a backup (design point 10), and the warnings: Realm Undo and the Undo on recent Phase cards are forgotten, and the only way back is the backup. It is a lot for one window, so group it under headings as the New Realm dialog's pages do, and show the numbering choice only when it applies. Follow `STYLE-GUIDE.md`; its rules are enforced by `tests/styles/`.
- Strings in `languages/en.json` under `bastionland.realm`. Match the house voice: plain, British spelling, the book's capitals (Realm, Holding, Referee).

Build in this order, each step leaving the tests green: the pure rules and their tests; `expandRealm` for a painted Realm with blank new land; the window and tool; shown numbers; rolled new land; pictures; the backup and putting it back; interruption safety; documents.

## Tests

Pure tests in `tests/rules/realm-growth.test.js`, in the style of `tests/rules/realm-edits.test.js`:

- For all four layouts and a spread of growths (0 to 3 each way, odd and even): every old hex's centre moves by the same `(dx, dy)`, and every neighbour relation survives the shift.
- `growRealm` re-indexes terrain and variants, shifts rivers, features and Barrier edges, adds no `validateRealm` problem beyond blank terrain, and breaks no picture group (`brokenPictures`).
- Round trip: `realmDocuments` for the old Realm, apply the shift plan, then `realmFromDocuments` with the new geometry equals `growRealm`. A `planRealmSync` after that deletes nothing, updates no feature Tile, and only creates Tiles for new land.
- Each store's re-key, including `sighted` with no wrapper, the old bare-array `heldBack`, and `hexShared.met[].edge`.
- The limits; the card-key helper across two logged growths; the picture rect shift and the per-hex ink rule; rolled land touching no old hex; rolled Barriers only on edges of new hexes and walling nothing off.
- Shown numbers: with numbers kept, an old hex shows what it showed before across two expansions and new western columns show 0, -1, -2; numbered again from 1, shown and stored agree; a typed shown number turns back into the right stored hex. And the guard that neither string is used outside the helper.
- Putting back: re-keying by a shift and then by its opposite returns every store to what it was, and a record for a hex of the new land loses its hex and moves nowhere.
- The existing seed and generator tests pass untouched.

Action tests in `tests/actions/` with the mocks the neighbouring tests use (`company-token.test.js`, `hex-flags.test.js`): the order of writes, the guard set and cleared, Tile ids kept, a replay of a stored plan landing in the same state, the backup saved before the first write, an expansion that stops and asks when the backup can't be saved, and a Realm put back matching the backup with its Tile ids.

## Documents

- `wiki/Painting-and-Editing-the-Realm.md`: the tool in the table, and a section on expanding.
- `wiki/Making-a-Realm.md:147`: no longer true; point at the new tool.
- `ROADMAP.md`: live checks under **Test live**, next free id T-264. At least: add two columns west of a played Realm and see names, notes, visits, the Company, a Domain's Holding and a hex's Journal entry all in place; add one column west and see the map look unchanged though the layout flipped; click a hex chip on a chat card from before the expansion; expand as a player watches and see their view stay on the same land; expand a picture Realm both ways; close the browser mid-expansion and reload; expand west keeping numbers and see Column 0 on the readout, in Places and in Track a hex, then expand again numbered from 1; tick Landmarks and Barriers and see them hidden from a player; expand, play a Phase in the new land, then put the Realm back and see the map, the Company and a Domain's Holding as they were.
- Run `npm run wiki:check`.

## Things to verify in Foundry's own code, not assume

- That custom keys in an update's operation options reach other clients' `updateScene` hooks.
- Whether Tile and Token `x` and `y` must be whole numbers on both versions.
- How the canvas chooses its view after a redraw (`scene._viewPosition`), for the pan.
- That v14's Levels leave `width`, `height` and `grid` on the Scene (`setRealmLayout` suggests so).
- That `followCrown` (`actions/homecoming.js:303`) and the Omen hooks (`realm-hooks.js:177`) ignore a Tile update that only moves it.
- Whether a running world can start one of Foundry's own backups, whether `.json` can be uploaded, and whether `importFromJSON` keeps embedded ids (design point 10).

## Decided by the owner

1. Numbering is the Referee's choice at each expansion: keep every hex's number, running below 1 to the north and west, or number the map again from 1.
2. Rolling Landmarks and Barriers into new land is built, as a tick that is off by default.
3. The tool keeps a backup itself and can put the Realm back from it.
