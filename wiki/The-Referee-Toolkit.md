# The Referee Toolkit

The Referee Toolkit is the Referee's own sheet: the Realm's Myths and their Omens, an index of every place in the Realm and where the Company has been, the calendar and what moves it, the campaign's Timeline, and your own notes. Players never see it.

![The Referee Toolkit open on its Places page, the banner across the top with the Realm's name, where the Company is, the book icon and the calendar, the By Visit, By Kind and Tracking pills, and a list of one-line place rows with hex, terrai](images/the-referee-toolkit-places.webp)

## Opening the Toolkit

Every world has exactly one **Referee Toolkit** actor. It is made for you the first time a Referee loads the world after setup, and it is owned by Referees only. There are several ways to open it:

- **Press `C`.** The Toolkit is made each Referee's character, so Foundry's own character sheet key opens it. A Referee who already had a character keeps theirs and is not given the Toolkit; one who clears it later is not given it again.
- **Hotbar slot 1.** Each Referee gets a **Referee Toolkit** macro, placed first on the hotbar. See [Macros and Hotkeys](Macros-and-Hotkeys).
- **The Roll Tables sidebar.** Referees get a row of buttons at the top of the Roll Tables directory: **Referee Rolls**, **Spark Tables**, **Time** (opens the Toolkit on its Time page), **New Site** and **Referee Toolkit**.
- **Open in the Toolkit**, on a Myth in a hex's Places pane, opens the Toolkit on that Myth's card. See [Places and the Lay of the Land](Places-and-the-Lay-of-the-Land).
- From the Actors sidebar, like any other actor.

The pages hang off the window's edge as a column of icon tabs. Hover an icon for the page's name. The column moves to the other side when the window is dragged close to the edge of the screen.

| Tab | What it is for |
| --- | --- |
| **Myths and Omens** | Each of the Realm's six Myths, the Omen playing out and the one to come, their tables and Casts, then the City Quest. The sheet opens here. |
| **Places** | Every place in the Realm, each hex once, with where the Company has been, your tracked places and the Sites. |
| **Time** | This Season and its events, the buttons that move time on, Crisis Rolls due, Myths to replace, Glory, and the record of past Seasons. |
| **Timeline** | The campaign's Timeline, every thread side by side. |
| **Notes** | Your own notes, in a rich-text editor. |
| **Settings** | Your own display settings, plus the Referee's settings for the table. At the foot of the rail. |

> **Did you know?**
> - A second Toolkit can't be made, players can't make one at all, and the world's last one can't be deleted, since it holds your notes. Once the world has one, **Create Actor** stops offering the type.
> - With the Toolkit as your character, Foundry would sign your chat with its name whenever no Token is selected. The system signs it with your own name instead. An alias you chose on purpose is kept.
> - If the system was added while the world was already running, the Toolkit can't be made until you launch the world again; trying to open it says so.

## The banner

The banner across the top shows which Realm the pages are about and where the Company is, with the calendar at its right end.

- **The Realm.** With one Realm Scene, its name is shown. With several, it's a dropdown: pick the Realm the Myths and Places pages should show. Until you pick, the pages follow the Realm on the canvas, or else the first Realm. Once you pick one, they stay on it whatever the canvas shows, so a click always acts on the Realm the page names.
- **The Company is in ...** names the hex the Company's Token stands in. **Click it** (**Show on the Map**) to view that Realm, pan to the hex, ping it and ring it in green, and open the hex in Places. The ping and ring are for you alone, so no player learns where anything hidden lies. When the Company's Token isn't on this Realm's map, the banner says so instead.
- **Click the portrait** to choose a new picture for the Toolkit.
- **The book icon** opens your rulebook in the reader. While the world has no copy of the rulebook yet, the icon is dimmed and clicking it opens the window that points the world at your PDF. See [The Rulebook Reader](The-Rulebook-Reader).

### The calendar

- **Season** and **Phase** are dropdowns. Picking one sets the calendar by hand: nothing that happens between Phases or Seasons is carried out. Use the Time page's buttons for that.
- **Hover the Age** to read the date in full, the way a chronicle would write it.
- **Click the Age box** to open **The Age**: turn the Age with **A Year Passes**, or **Set the Age** by hand, which only puts the number right.
- **The weather** sits under the Phase when the FXMaster module is active. Click it to pick the weather drawn on the Scene the players are on. You can hide the button from the Settings page.

The Season, Phase, Age and weather are covered on [Time, Phases and Seasons](Time-Phases-and-Seasons).

> **Did you know?**
> - Pointing at anything in the Toolkit that names a hex (a place row, a Myth's hex chip, the Company's hex in the banner) rings that hex in green on the map, as long as that Realm is the Scene on the canvas.
> - With **Reduce Motion** on, Show on the Map jumps straight to the hex instead of panning.

## Myths and Omens

Each Myth folds to one row: its number, name, picture, a pip for each Omen met, and its hex. Opening one folds the one open before it, so the others stay a row each. Open, a Myth shows its Omens, your notes on it, its table, its Cast, and the buttons to mark it **Resolved**. **Choose the Myths** at the foot of the list opens **The Realm's Myths**, where you roll one Myth again, roll them all again, or choose one from the book's table. The **City Quest** comes last, with **Roll an Omen of the City** and **Start Over**.

- **Click the Omen the Company has met** to mark it. The ones before it are crossed out. Click the Omen playing out again to take it back.
- **Click a Myth's picture** to see it larger, in a window you can show the players.
- **Click a Myth's hex chip** to show the hex on the map, as the banner's Company line does.
- **Drag an actor onto a Myth's card** to add them to its Cast.

Everything on this page, from the Omens to the Cast and Myths you write yourself, is on [Myths and Omens](Myths-and-Omens).

## Places

The Places page is an index of the Realm on show: every Holding and Landmark, found or not, every hex the Company has walked into, and any other hex you have written about, rolled for, or told the players about. Each hex is listed once, on one row. A line at the top counts how many of the Realm's hexes have been visited.

**Click a row** to open that hex in Places, where everything kept for it is read and changed. The Toolkit's rows are for finding a hex; Places is where you work on it. See [Places and the Lay of the Land](Places-and-the-Lay-of-the-Land).

### What a row shows

- The name heading the row: the name you gave the hex, else the Holding there, else the Landmark, else the hex's own label. Its kind follows (for example a Holding's kind, and **Seat of Power** for the Realm's seat).
- Chips for the hex, its terrain, and what else stands there: a Holding, a Myth, a Landmark and its Seer. A chip for something the players haven't found yet is drawn as hidden, and says **Hidden from players** on hover. A Landmark not yet found also gets **Not found yet**.
- **The Company is here** on the hex the Company's Token stands in.
- When the Company was there: once, or how many times and when last.
- The wilderness as last rolled: one chip per Spark Table rolled on the Nature page for the hex, as **Table: result**. If a hex was rolled more than once, only the latest rolls in game time show. Hover a chip for when it was rolled.

### Three ways to list them

Pick one of the pills at the top. Every list runs by column, then row.

| Order | What it lists |
| --- | --- |
| **By Visit** | **Visited**, every hex the Company has come into, then **Not Visited Yet**: the Holdings and Landmarks, and any other hex you've written about or rolled for. This is the order the page opens in. |
| **By Kind** | **Holdings**, **Landmarks**, then **Other Hexes**: visited or written-about hexes with neither, such as a Myth's hex. A hex with both a Holding and a Landmark is listed once, under Holdings. |
| **Tracking** | **Tracked Places**, your own list of hexes to keep an eye on, oldest first. |

The order you pick lasts until the window is closed.

### Tracking places

- **Click the pin** at the right of any row, in any order, to **Track This Place**. A pinned row's pin is filled; click it again to **Stop Tracking**.
- On the Tracking list, each row has a **×** instead of a pin, which takes it off the list.
- **Add a Place**, the dashed button at the foot of the Tracking list, adds a hex by hand:
  - If the Realm is the Scene on the canvas, the Toolkit folds out of the way and asks you to click the hex on the map. **Right-click or press Esc** to stop. The Toolkit comes back afterwards.
  - Otherwise a **Track a Hex** window asks for the hex's **Column** and **Row**.

### Sites

The **Sites** section comes last in every order. Each Site is one row: its name, a chip for each kind of point drawn on it with how many, and how many of its points have been found.

- **Open the Site** opens its map.
- **Journal** opens the Site's Journal entry, when it has one.
- **The pin** tracks the Site. On the Tracking list, only tracked Sites show, and the section is left out while none is.
- **New Site** at the foot of the section (not on the Tracking list) starts a new one.

See [Sites](Sites).

### Searching

Type in **Search the places...** to hide every row that doesn't match. The search reads a row's name, kind, hex, terrain, what stands there, the visits line, your note, the players' note, and every Spark Table rolled there with its date, not only what the row shows. It ignores case and accents. Sections left empty are hidden, and **No place matches.** shows when nothing does. The search is never saved, but it survives the page being redrawn.

> **Did you know?**
> - A tracked hex that a smaller map has left outside the Realm is hidden, not forgotten: it comes back if the map grows again.
> - With [Solo Play](Solo-Play) on, the Toolkit shows only what the Company has found.

## Time

The Time page holds the calendar's working parts: **This Season** with its events and **Weeks Pass**, your notes on the Season, the **Move Time On** buttons (**Next Phase**, **Months Pass**, **A Year Passes**, **Journey to a Distant Realm**, **End the Session**), **Thrown Off Course** when the Company is, **Crisis Rolls Due** for every Domain that hasn't made its roll this Season, **Myths to Replace** with **Roll the New Myth**, the **Glory** awards (**Myth Resolved**, **Tournament Won**, **Battle Won**), and **Past Seasons**, folded by Age.

See [Time, Phases and Seasons](Time-Phases-and-Seasons) for what each does, [Ending a Session](Ending-a-Session) for the end-of-session window, and [Domains and Courts](Domains-and-Courts) for the Crisis Roll.

## Timeline

The campaign's Timeline, as the Timeline window shows it: the Company's thread, each Knight's, each Domain's and each Realm's, side by side. Most of it writes itself as things happen. **Open in a Window** pops it out into the full Timeline window. See [The Campaign Timeline](The-Campaign-Timeline).

## Notes

Your own notes, kept on the Toolkit actor and seen only by Referees. Click the editor's edit button to write. A good place for what the players say they mean to do next session.

## Settings

The sliders icon at the foot of the rail. The page has four groups:

- **Reading** and **Windows**: your own settings, kept in this browser, the same as on a Knight sheet. See [Your Settings and Accessibility](Your-Settings-and-Accessibility).
- **For the Referee**: world settings such as Solo Play, Attack Effects on the Map and showing the Timeline to players, plus buttons for Realm Appearance, the Welcome window, and **Company picture**, which changes the picture the Company's Token carries on the Realm on show, even before the Token is on the map.
- **Weather on the Map**: whether the weather button shows, whether the weather is drawn at all, and **Types of Weather**, one dropdown of tick boxes to keep single parts (such as hail or a storm's grey light) off the map.

**All Settings...** opens Foundry's Configure Settings on the system's tab. Every world setting is listed on [World Settings Reference](World-Settings-Reference).

![The Referee Toolkit's banner, with its picture and name, the Realm's name, the hex the Company is in, the book icon, and the Season, Age and Phase](images/the-referee-toolkit-banner.webp)

## See also
- [Myths and Omens](Myths-and-Omens)
- [Places and the Lay of the Land](Places-and-the-Lay-of-the-Land)
- [Time, Phases and Seasons](Time-Phases-and-Seasons)
- [The Campaign Timeline](The-Campaign-Timeline)
- [Sites](Sites)
- [Macros and Hotkeys](Macros-and-Hotkeys)
- [Your First Session](Your-First-Session)
