# Painting and Editing the Realm

The Referee changes a Realm with the Realm tools: a crown in Foundry's scene controls that shows only for Referees, and only on a Realm Scene. One brush paints terrain, rivers, Barriers, Holdings and Landmarks from a single palette, and a window of its own edits everything about one hex.

## The Realm tools

Click the **crown** (**Realm**) in the scene controls. Its tools, top to bottom:

| Tool | What it does |
| --- | --- |
| **Inspect hexes** | Click a hex to open it in Places. While a Realm is being drawn, **Edit this hex** opens beside Places too. |
| **Paint the Realm** | Picks up the brush and opens the palette. See below. |
| **Wilderness Roll** | Makes the Wilderness Roll for the hex the Company stands in. See [Exploring the Wilderness](Exploring-the-Wilderness#the-wilderness-roll). |
| **Reroll the Realm** | Rolls a new Realm onto this Scene, after asking. Tokens and anything else on the Scene stay, and so do the parts you left to draw by hand. |
| **Realm Appearance** | Opens the Realm Appearance window. See [Realm Appearance and Skins](Realm-Appearance-and-Skins). |
| **Import map** | Lays a picture of your own map under the Realm, or changes or removes the one there. See [Making a Realm](Making-a-Realm#importing-a-map-you-drew). |

The last four act at once rather than staying in hand.

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
- A **Myth** has its **Number**, the Myth rolled for it with **Roll** and **Choose**, the Omens seen with **-** and **+**, and whether it is revealed to players. **Choose** opens the Realm's Myths window on this one.
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

## See also

- [Making a Realm](Making-a-Realm)
- [Places and the Lay of the Land](Places-and-the-Lay-of-the-Land)
- [Hidden Tricks](Hidden-Tricks)
