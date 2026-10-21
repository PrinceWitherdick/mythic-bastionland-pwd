# Sites

A Site is a place within a hex worth exploring on its own: a tomb, a castle, caverns, a wood. The **Sites creator** gives each Site a map to draw on, following the book's procedure (p15): points at the corners and centre of a hexagon, routes between neighbouring points, and the entrances. Each Site lives in a Journal entry, and players see only what they have found.

## Making a Site

**New Site** makes a new, empty Site and opens its map. It is in:

- the header of the **Journal** tab,
- the header of the **Roll Tables** tab, among the Referee's tools,
- your hotbar (slot 3),
- the Sites part of the Referee Toolkit's **Places** page, which also lists your Sites with **Open the Site** and **Journal** buttons.

New Sites are filed in a **Sites** folder. A Site closed with nothing drawn or written on it is deleted again, so a stray click leaves nothing behind.

To open a Site later, open its Journal entry: it opens on the map.

![The Drowned Chapel's Site window, with the toolbar across the top, the hexagon map of numbered points and the routes between them, the book's steps below it, and the key beside it](images/sites-map.webp)

## The window

| Part | What it is for |
| --- | --- |
| **Toolbar** | Draw or Reveal, Roll the rest, Clear, Reveal all, Hide all, Show Players, Undo, Redo and Journal. |
| **Map** | The hexagon of points, the routes between them, and the entrances. |
| **Key** | The Site's **Name**, **What is this place?**, and every point and entrance with what's written about it. |
| **The book's steps** | Each step of the procedure with a count and whether it's done. |
| **Breaking the rules** | The counts the steps aim for, which you can change. |

## Drawing

With **Draw** chosen in the toolbar, clicking the map draws.

- **Click a point** to select it. A bar opens beside it: choose **Feature** (a circle), **Danger** (a triangle) or **Treasure** (a diamond), each with its count so far. Give it a **Number** (taking a number from another point swaps the two), place an **Entrance** or a **Hidden entrance** on it, write a note on it, or **Erase** it with its routes and entrance.
- **Click the gap between two marked neighbours** to draw a route. Choose **Open** (a solid line), **Closed** (a crossed line) or **Hidden** (a dotted line), write what's along the way, or **No route** to take it away.
- **Escape** closes the bar. **Click the same point or route again** to close it too.
- **Enter** or **Space** press the part of the map that has the keyboard's focus.

### Rolling

Each step in **The book's steps** has its own roll button for whatever is still to do: **Roll the points still to mark**, **Roll the routes still to draw** and **Roll the entrances still to place**. **Roll the rest** follows the book's steps for everything not done yet, keeping what you have already drawn.

The steps check that **every point can be reached**, even where routes are closed or hidden, and name the points that can't. A step reads **Done**, **Still to do**, **More than the rules ask for** or **Needs fixing**.

A roll never places the hidden entrance, since the book makes it optional: place one yourself if you want it.

### Breaking the rules

The counts of points, routes and entrances are the book's to start with. Change any number to suit the Site, or **Start from** a different set: **The book** or **A sealed tomb**.

**Clear** erases every point, route and entrance, and what's written about them, after asking. The rules and the Site's own notes stay.

### Undo and Redo

**Ctrl+Z** undoes the last change on the map, and **Ctrl+Y** or **Ctrl+Shift+Z** redoes it (**Cmd** on a Mac). They leave a text box's own undo alone while you're typing. The **Undo** and **Redo** buttons in the toolbar do the same.

## Showing players what they've found

Players see a Site only through what has been revealed: the points they've found, with the open and closed routes from them, and anything else you reveal.

- Choose **Reveal** in the toolbar. Then **click a point, a hidden route or an entrance** to show or hide it.
- In the key, each entry has a marker saying whether players have found it. **Click it** to reveal or hide that one.
- **Reveal all** and **Hide all** do the whole Site at once.
- **Show Players** opens Foundry's own Show to Players window for the Site's entry. Players who open it see the map as they know it: only what they've found, and routes leading off to places not yet explored.

## Site journals

Each Site with something drawn or written on it also gets a Journal entry of its own, in a **Site Journals** folder, kept up to date as you draw and reveal. Open it with **Journal** in the Site's toolbar, or on its row in the Referee Toolkit.

| Page | What it holds |
| --- | --- |
| **The Site** | The whole Site, everything written about it included. For you alone. |
| **What the Company Found** | Only what the players have found, by kind and number: none of your notes. |
| **Notes** | Your own notes. Never written over. |

The entry starts hidden from players. Share it when you like: players then see only **What the Company Found**. The two written pages are rewritten whenever the Site changes, so edits made there are lost; a notice at the top of each says so, for its editors only.

Deleting a Site deletes its journal too, unless you have written in its Notes page.

Turn Site journals off with the world setting **Journal Entries for Sites**, in Configure Settings or on the Referee Toolkit's Settings page.

## See also

- [Places and the Lay of the Land](Places-and-the-Lay-of-the-Land): what is kept for each hex of a Realm.
- [The Referee Toolkit](The-Referee-Toolkit)
- [Macros and Hotkeys](Macros-and-Hotkeys)
