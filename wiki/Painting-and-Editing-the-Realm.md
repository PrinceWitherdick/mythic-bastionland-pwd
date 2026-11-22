# Painting and Editing the Realm

The Referee changes a Realm with the Realm tools: a crown in Foundry's scene controls that shows only for Referees, and only on a Realm Scene. One brush paints terrain, rivers, Barriers, Holdings and Landmarks from a single palette, and a window of its own edits everything about one hex.

## The Realm tools

Click the **crown** (**Realm**) in the scene controls. Its tools, top to bottom:

| Tool | What it does |
| --- | --- |
| **Inspect hexes** | Click a hex to open it in Places. While a Realm is being drawn, **Edit this hex** opens beside Places too. |
| **Paint the Realm** | Picks up the brush and opens the palette. See below. |
| **Fog brush** | Lifts the Fog of War from a hex, or lets it back. Shows only while this Realm's fog is on. See [Fog of War](#fog-of-war). |
| **Wilderness Roll** | Makes the Wilderness Roll for the hex the Company stands in. See [Exploring the Wilderness](Exploring-the-Wilderness#the-wilderness-roll). |
| **Reroll the Realm** | Rolls a new Realm onto this Scene, after asking. Tokens and anything else on the Scene stay, and so do the parts you left to draw by hand. |
| **Realm Appearance** | Opens the Realm Appearance window. See [Realm Appearance and Skins](Realm-Appearance-and-Skins). |
| **Fog of War** | Opens the Fog of War window for this Realm. See [Fog of War](#fog-of-war). |
| **Import map** | Lays a picture of your own map under the Realm, or changes or removes the one there. See [Making a Realm](Making-a-Realm#importing-a-map-you-drew). |
| **Expand the map** | Adds hexes to any side of a Realm already in play, or puts it back from the backup kept first. See [Expand the map](#expand-the-map). |

The last five act at once rather than staying in hand.

## The palette

![The Realm palette window in its two columns, Terrain swatches with the River below and Barriers on the left, Holdings in pairs with the Seat of Power tick, then the six Landmarks with their count discs and Other on the right, Undo and Redo at the foot and Appearance in the title bar](images/painting-and-editing-the-realm-palette.webp)

Picking up **Paint the Realm** opens the palette, a window titled **Realm** in two columns: the land on the left, what stands on it on the right.

- **Terrain**: the twelve terrains, then **River** across the foot of them.
- **Barriers**: the Barrier brush, with a tally against how many the Realm should have (one per six hexes).
- **Holdings**: Castle, Town, Fortress and Tower in pairs, then the **Seat of Power** tick.
- **Landmarks**: Dwelling, Sanctum, Monument, Hazard, Curse and Ruin, then **Other**, a plain marker for a Landmark of your own. With **More Landmarks (Blog)** turned on in the world settings, Bridge, Pond, Chapel, Grotto, Fountain and Willow follow (see [Exploring the Wilderness](Exploring-the-Wilderness#more-landmarks-from-the-blog)).

**Click a swatch** to take up that brush. A line at the top of the palette says how the brush in hand works.

Each Holding swatch, and each of the book's six Landmarks, carries a count in its corner. It turns green once that kind is as the book asks, and red once there are too many. The tally lines under each heading do the same. Other and the blog's Landmarks have no count, since the book asks for none.

The window can be resized, and keeps the size you give it. The **Appearance** button in its title bar opens Realm Appearance. **Undo** and **Redo** sit at its foot.

While a Realm is being drawn by hand, the palette stays shut: the Creating a Realm window holds each part of it beside the step it paints. See [Making a Realm](Making-a-Realm#the-creating-a-realm-window).

## Using the brush

Every brush lays with a left-click, and takes away with a right-click. Clicking with a brush where the same thing already stands takes it away too.

### Terrain

- **Click** a hex, or **drag** across hexes, to paint them.
- **Alt-click** a hex to pick up its terrain.
- **Click a hex that already has the brush's terrain** to change it to that terrain's next picture, on skins that have several (see [Terrain pictures](#terrain-pictures)). A drag never changes a hex that already has the terrain, so stretching a forest keeps the pictures it has.
- A right-click does nothing with terrain, since a hex is never without one.

### Rivers

- **Drag** across hexes to lay a river. Draw as many as the Realm needs.
- **Start at a ringed end** to carry that river on. The loose ends of every river are ringed while the brush is in hand.
- **Start partway along a river** to branch off it.
- **Start anywhere else** for a new river. Where the new water reaches another river, it joins it.
- **Right-click** or **Shift-click** a hex of a river to cut it back to there from the nearer end.
- **Remove the river** (or **Remove every river**) appears under the palette while the River brush is in hand.

Every river drawn counts as navigable.

### Barriers

Barriers run along the edges between hexes, so this brush works on the edge under the pointer.

- **Click** an edge to lay a Barrier there, hidden from players.
- **Click** it again, or **right-click** it, to take it away.
- **Shift-click** a Barrier to reveal it to players, or to hide it again.

### Holdings

- Choose a style, then **click** a hex to place it.
- **Tick the Seat of Power** first, and the next Holding you place is the Realm's Seat. The tick then clears, since a Realm has one Seat.
- **Click** a hex that already has that Holding, or **right-click** or **Shift-click** any Holding, to take it away.
- **Alt-click** a hex to pick up the style of the Holding that stands there.

Painting over the Seat with another style leaves it the Seat. To take the crown off, use **Edit this hex**.

### Landmarks

- Choose a kind, then **click** a hex to place it there, hidden from players.
- **Click** a hex that already has that Landmark, or **right-click** or **Shift-click** any Landmark, to take it away.
- **Alt-click** a hex to pick up the kind of Landmark that stands there.

A Landmark left without a name is named the first time the Wilderness Roll finds it, from the prompt a random page of your book prints for its kind. To name or rename it yourself, open the hex in Places: see [Places and the Lay of the Land](Places-and-the-Lay-of-the-Land#landmark).

### Myths

The brush doesn't place Myths, since each is numbered and rolled. Use **Edit this hex**.

## Undo and Redo

Every Realm edit can be taken back: painting, rivers, Barriers, Holdings, Landmarks and the hex editor's fields.

- **Ctrl+Z** undoes, while the Realm tools are in use.
- **Ctrl+Y** or **Ctrl+Shift+Z** redoes. You can rebind this as **Redo a Realm edit** in Foundry's Configure Controls.
- **Undo** and **Redo** buttons sit at the foot of the palette, of Edit this hex, and of the Creating a Realm window's rail.

Each Realm Scene keeps its own history, for you alone, until the page reloads. **Reroll the Realm** can't be undone, and it clears the history.

Undo takes back only your own edits. What play has done since stays done: a Myth found, an Omen met, a Barrier run into, a Landmark named as the Company first met it.

## Edit this hex

![The Edit window for a Myth hex, with its terrain, In this hex set to Myth, Number 3, Roll and Choose, The Bell Under the Mere, Omens seen with minus and plus, Hidden from players, Barriers and Undo and Redo](images/painting-and-editing-the-realm-edit-hex.webp)

**Edit hex**, in the title bar of the Places window, opens a window titled **Edit** and the hex's name, for changing the hex itself. It opens on whichever hex Places shows. There is only one: pressing **Edit hex** on another hex moves it there. While a Realm is being drawn, clicking a hex with **Inspect hexes** opens it beside Places by itself.

Each field saves as soon as you change it.

- **Terrain**: the hex's terrain.
- **In this hex**: Nothing, Holding, Myth or Landmark.
- A **Holding** has its **Style**, its **Name**, a **Seat of Power** tick, and **Disputed**, for a Seat another Holding also claims.
- A **Myth** has its **Number**, the Myth rolled for it with **Roll** and **Choose**, the Omens seen with **-** and **+**, and whether it is revealed to players. **Choose** opens the Realm's Myths window on this one. A Myth rolled anew with **Roll** starts with no Omens seen; dice you type in by hand are a correction, and keep them.
- A **Landmark** has its **Type** and its **Name**. A Sanctum also has its Seer, with **Roll**. A Grotto, Fountain or Willow has **Which** of its three it is, with a die to roll it. A Pond has **Leads To**: the other Pond it's paired with, or none, so it leads out of this Realm.
- **Barriers**: each of the hex's six edges, set to None, Hidden or Revealed.
- **Undo** and **Redo** at the foot.

If you make a hex a Myth when all six of the Realm's Myths already stand on the map, a **Move a Myth Here** window asks which one to move. It keeps its roll and the Omens seen.

In [solo play](Solo-Play), what stands in a hex can't be changed here, so nothing still to be found is given away. Nor can a Pond whose partner is still to be found be paired again or made something else.

## Terrain pictures

On the **Blank Realm** skin, most terrains have several pictures, traced from the example map in the free Realm Sheets. A new hex of that terrain gets one at random, and pictures that stood side by side on the example map are laid side by side again where they fit. Some groups of hexes were drawn as one picture across their shared edges; these are laid only whole. Rolled Realms and painted ones both get them.

To change one hex's picture, click it again with the same terrain in the brush. Each click steps to the next picture.

## Reroll the Realm

**Reroll the Realm** rolls a new Realm onto the Scene in view. It asks first, and names any parts you set up to draw by hand, which it keeps. Tokens, Tiles and Drawings of your own stay. A new Realm Key is whispered to the Referees, and the Undo history is cleared.

On a Realm already in play, the warning says what stays and what goes. The Company's visits and hex notes stay. Marks of things seen from afar are cleared, and so are Barriers met that the new roll takes away. A Courtier Company at the old Seat of Power moves to the new one. Any Domain ruling a Holding here is named, so you can give it its new Holding on its sheet.

## Expand the map

**Expand the map** makes a Realm bigger once play is under way: when the Knights come to rule more land, or the Company walks off the edge. Say how many hexes to add to the north, south, west and east. The map is drawn small with the new hexes round it, with the size it will be, such as "14 by 12, 168 hexes". A map can run to 60 hexes a side and 900 in all.

Every hex keeps what it holds, and every Token, Tile, Drawing, Note, light, sound, Wall and Region stands on the land it stood on. So does everything kept for a hex: its name, the Lay of the Land, visits, what the players were told, things seen from afar, its Journal entry, threads in the Referee Toolkit, and its Timeline rows. Each player's view stays on the same land.

**The new land.** **Roll its terrain** grows clusters of terrain out from the land already there, as a Realm is rolled. **Leave it blank to paint** leaves the new hexes empty for the brush. Roll is chosen for a rolled Realm, blank for one drawn by hand or laid over a picture. Tick **Roll Landmarks and Barriers into it too** for as many as a Realm has for that many hexes, hidden from the players. Barriers run only along the new hexes and never wall a hex off. No Myths, Holdings or rivers are added.

**A Realm laid over a picture.** The picture stays where it was under its hexes, and the new hexes fall on bare paper. Tick **Draw the new land in the Realm's own ink** to show the system's terrain in hexes outside your picture; it won't match your drawing. Or bring in a bigger picture afterwards with **Import map**, which keeps what every hex holds.

**Hex numbers.** Once hexes are added to the north or west, choose how hexes are numbered. **Keep every hex's number** leaves old hexes as they were, so new columns to the west and new rows to the north are numbered 0, -1, -2 and so on. Old chat cards and any numbers printed on your map stay right. **Number the map again from 1** gives every hex a new number, counting from Column 1, Row 1 at the top left, with no negative numbers. The hexes on old chat cards still open the right place, but the numbers printed on them and in some Timeline rows are then out of date. You can choose again at the next expansion.

**The backup.** **Keep a backup of this Realm first** is ticked to start. It saves the whole Scene, with what is kept for its hexes, in a file with your world on the server, in place of the last one. If the backup can't be saved, you're asked whether to go on without it.

Expanding forgets Undo on the map and Undo on recent Phase cards.

### Putting the Realm back

Once a Realm has a backup, Expand the map offers **Put the Realm back as it was on** the day it was kept. It asks first. The map, its Tokens and what is kept for its hexes go back to how they were then, and everything done on this Realm since is lost. Every expansion since the backup is undone, even one made without a backup of its own. Anything written down since for a hex that is still there follows it back, and chat cards posted since point at the right hex again; anything written for the land added loses its hex. The calendar, the Knights and everything else in the world stay as they are now. A backup is used up once the Realm is put back from it, so it can't be put back twice.

### If an expansion is cut short

An expansion is written in several steps. If the browser closes part way, the Realm is marked, and the next time a Referee opens it the expansion is finished from the start and you're told so. Putting a Realm back is finished the same way, from its backup. Should that backup no longer be readable, the mark is taken off so the Realm can be used again, and you're told to look it over for anything left out of place.

## Fog of War

A Realm can hide its land from the players until the Company gets there. This is a house rule, off on every Realm until you turn it on, and each Realm has its own.

With the fog on, the players see the edge of every hex, and nothing inside one they haven't reached: no terrain, rivers, Holdings, Landmarks, Myths or map picture. A fogged hex looks like plain paper in the Realm's own paper colour. Barriers that have been revealed, the Company Token, the players' own Tokens and the marks of things seen from afar still show. Other Tokens in a fogged hex don't. The label under the pointer reads **Unexplored**.

You see the fog as a thin veil, so you can still read the map and see what the players can't. Played alone, you see it as the players do.

The fog lifts from a hex when:

- the Company arrives there,
- you lift it with the brush, the hex's own button, or the window,
- you press **Mark it on the players' map** on a vantage point's card, which lifts it from the hex and the six around it (played alone, this happens by itself),
- a Myth or Landmark there is marked on the players' map,
- or you tell the players about the hex with **Lift the fog here too** ticked.

### The Fog of War window

Open it from **Fog of War** in the Realm tools.

- **Fog of War on this Realm** turns it on and off. Turning it off keeps what you lifted, for when you turn it on again.
- **Holdings show through the fog** keeps every Holding and Seat, and the arms they fly, on the players' map.
- **Lift all the fog** and **Bring the fog back everywhere** each ask first. A hex you fog again clears once more when the Company next arrives there.
- **Pick up the fog brush** puts the brush in your hand.

### The fog brush

Click a hex to lift its fog, or click again to let it back. Drag across hexes to do the same to all of them: a drag that starts in the fog lifts it, and one that starts in the clear brings it back. While the brush is in hand, your veil lies thicker, so you can see what you've painted.

### In Places

While the fog is on, a hex's visits line in Places has **Lift the fog** or **Let the fog back**. Under the Referee's note, **Tell the players** has a **Lift the fog here too** box beside it while the hex is fogged. It starts unticked each time.

## See also

- [Making a Realm](Making-a-Realm)
- [Places and the Lay of the Land](Places-and-the-Lay-of-the-Land)
- [Hidden Tricks](Hidden-Tricks)
