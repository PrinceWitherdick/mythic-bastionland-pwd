# Macros and Hotkeys

The keys the system adds, the macros it puts on each hotbar, the compendium they come from, the test-world macro, and the functions a macro of your own can call.

## Hotkeys

| Key | Who | What it does |
|---|---|---|
| `B` | Referee; players when **Let Players Open the Rulebook** is on | Opens the rulebook, or closes it when it is already in front. Before the world has a book, opens **Your Rulebook** for the Referee. See [The Rulebook Reader](The-Rulebook-Reader). |
| `6` | Referee | Opens the Spark Tables, or closes them when they are in front. It takes the hotbar's own `6` for the Referee; a player's `6` still runs their hotbar slot. |
| `C` | Referee | Foundry's own key for your character's sheet. The [Referee Toolkit](The-Referee-Toolkit) is made each Referee's character, so `C` opens it (when no Token is selected). A Referee who already had a character of their own keeps it. |
| `Ctrl`+`Z` | Referee | Takes back the last Realm edit, while the Realm tools are in use. See [Painting and Editing the Realm](Painting-and-Editing-the-Realm). |
| `Ctrl`+`Y` or `Ctrl`+`Shift`+`Z` | Referee | Puts back the last Realm edit taken back, while the Realm tools are in use. |

Change the system's keys under **Configure Controls**: they are named **Open the Rulebook**, **Open the Spark Tables** and **Redo a Realm edit**.

Other windows have keys of their own, such as the heraldry painter and the Realm map's alignment. They are listed in [Hidden Tricks](Hidden-Tricks).

## The hotbar

The system makes its macros in your world and places them on each user's hotbar once, the first time that user loads the world. Anything you already had in those slots moves along to free slots. After that the bar is yours: move or remove them as you like, and they won't come back.

**The Referee's hotbar**

| Slot | Macro | What it does |
|---|---|---|
| 1 | **Referee Toolkit** | Opens the [Referee Toolkit](The-Referee-Toolkit). |
| 2 | **Rulebook** | Opens or closes the rulebook, like `B`. |
| 3 | **New Site** | Starts a new Site map. See [Sites](Sites). |
| 4 | **Luck Roll** | Asks which way to read the roll (the Luck Roll table, or stated odds such as "Likely"), then rolls it. |
| 5 | **Attack** | Opens the Attack dialog for the selected Token, as its sheet's **Attack** button does. With several selected, asks which attacks. |
| 9 | **Import PDF** | Brings in your rulebook PDF. See [Bringing In Your Rulebook](Bringing-In-Your-Rulebook). |
| 0 | **End the Session** | Opens the end-of-session window. See [Ending a Session](Ending-a-Session). |

With **Solo Play** on, the Referee also gets the players' **Places** and **Timeline** macros, in the first free slots. See [Solo Play](Solo-Play).

**A player's hotbar**

| Slot | Macro | What it does |
|---|---|---|
| 1 | **Attack** | Opens the Attack dialog for your selected Token or, with none selected, your Knight, without opening the sheet. |
| 2 | **Places** | Opens the Company's record of where it has been. See [Travels and Places](Travels-and-Places). |
| 3 | **Timeline** | Opens the [Campaign Timeline](The-Campaign-Timeline). Only while the Timeline is turned on. |
| 0 | **Luck Roll** | The same Luck Roll. |

Foundry's number keys run the hotbar's slots, so a player targets with `T` and presses `1` to attack, keeping the map in view; the Referee presses `5`.

Players can run the Attack, Luck Roll, Places and Timeline macros but not the Referee's. The system keeps each macro's script up to date as it changes, and a name you give a macro is kept.

![The Referee's hotbar at the foot of the screen with Referee Toolkit, Rulebook, New Site and Luck Roll in slots 1 to 4, Import PDF in slot 9 and End the Session in slot 0, each a white drawing on a dark square tile](images/macros-and-hotkeys-hotbar.webp)

## The Mythic Bastionland Macros compendium

The system's **Mythic Bastionland Macros** compendium holds spare copies of **Attack**, **End the Session**, **Referee Toolkit**, **Import PDF**, **Luck Roll**, **New Site** and **Rulebook**. Drag one onto your hotbar if you deleted the world's copy. Only Referees can open it.

## The test-world macro

Every world also gets **(TEST ONLY) Populate World**, in a Macro folder called **For Testing Purposes**. It never goes on a hotbar, and players can't see it.

Run it in a world you don't mind filling. After a confirmation, it builds a fake game five Seasons in:

- three Knights of a Company of Courtiers, with their steeds, their tables and a Squire;
- a Domain with its Council, Court, tasks and a Warband;
- a Realm with its Journey, the Referee's notes and Spark Table rolls on the places visited, what the players were told and their own notes, the Barriers they met and what they saw from afar;
- its Myths, Omens and a Myth's Cast, and one Myth written by the Referee;
- two Sites, a year of chat with its feasts and masses, and Timeline threads for the Company, each Knight, the Squire, the Domain and the Realm;
- the Referee Toolkit's Seasons and notes.

The world's calendar, weather and City Quest move on to where the story ends. It takes about a minute; leave Foundry alone until it says it is done. With your rulebook imported, the Knights and Myths are the book's; without it, they get stand-in text.

**Run it again** to remove it all. After a second confirmation it deletes everything it made, takes its rows off the Timeline, and puts the calendar, weather, City Quest and the Toolkit's notes and Seasons back as they were. What you made yourself is left alone.

## Calling the system from a macro

The system's functions for macros are on `game.system.api`. Most of them are for the Referee and do nothing for a player.

| Function | What it does |
|---|---|
| `bringInRulebook()` | Asks for your PDF, keeps a copy to read and imports its art and tables. |
| `importBookArt()` | Imports the art and tables only, without keeping a copy to read. Kept for older macros. |
| `openRulebook({ page })` | Opens the rulebook, at a page if given. |
| `toggleRulebook()` | Opens or closes the rulebook, as `B` does. |
| `openRulebookSetup()` | Opens the **Your Rulebook** window. |
| `openWelcome()` | Opens the Welcome window (Referee). |
| `openGmToolkit(tab)` | Opens the Referee Toolkit, at a page if given: `"myths"`, `"places"`, `"time"`, `"timeline"` or `"notes"`. |
| `openMythsPanel()` | Opens the Toolkit on its Myths page. |
| `openTimePanel()` | Opens the Toolkit on its Time page. For a player, says the date instead. |
| `openKnightChooser(actor)` | Opens the Knight chooser, for an actor if given. See [Choosing a Knight](Choosing-a-Knight). |
| `newRealm()` | Starts a new Realm. See [Making a Realm](Making-a-Realm). |
| `openRealmAppearance()` | Opens **Realm Appearance** (Referee). |
| `wildernessRoll()` | Makes the Wilderness Roll for the Company's hex on the Realm on screen (Referee). See [Exploring the Wilderness](Exploring-the-Wilderness). |
| `rollSurprise()` | Asks who was caught unready in the current combat, and rolls their Saves (Referee). |
| `openRefereeRolls()` | Asks which of the Referee's quick tables to roll (Referee). |
| `rollRefereeTable(key)` | Rolls one quick table and posts it: `"luck"`, `"passage"`, `"unresolved"`, `"blind"`, `"weather"` or `"mood"`. |
| `rollLuck(odds)` | The Luck Roll. Asks which way to read it unless given `"table"`, `"high"`, `"likely"`, `"even"`, `"unlikely"` or `"slim"`. |
| `attackFromHotbar()` | Opens the Attack dialog for the selected Token or, for a player with none selected, their Knight; asks which when there are several. |
| `openSparkTables({ page })` | Opens the Spark Tables. |
| `openPlaces()` | Opens the Company's Places window. |
| `openHexLore({ scene, hex })` | Opens one hex of a Realm in Places, with its Lay of the Land for the Referee. |
| `openTimeline()` | Opens the Campaign Timeline window, when the Timeline is on. |
| `openSessionEnd()` | Opens the end-of-session window. |
| `newSite()` | Starts a new Site. |
| `newOwnMyth()` | Starts a Myth of your own. See [Myths and Omens](Myths-and-Omens). |
| `openNpcChooser()` | Opens the **NPCs** compendium. |
| `rollCityOmen()` | Rolls the next Omen of the City Quest (Referee). |
| `awardGlory(key)` | Awards 1 Glory: `"myth"`, `"tournament"` or `"battle"` (Referee). |
| `getCalendar()` | Returns the world's calendar: Age, Season, Phase and the rest. |
| `pickWeather()` | Opens the weather picker (Referee). |
| `populateTestWorld()` | Builds or removes the test world, as its macro does. |

For example, a macro that rolls Travelling Blind straight away:

```js
game.system.api.rollRefereeTable("blind");
```
