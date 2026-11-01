# NPCs, Structures and Compendiums

Everyone the Knights meet who isn't a Knight is an **NPC** actor: hirelings, beasts, Warbands, Seers and the Cast of every Myth. Knights the Referee plays are [NPC Knights](#npc-knights), on the Knight sheet. Walls, gates, ships and siege engines are **Structure** actors, which have GD and Armour but no Virtues. Once you have brought in your rulebook, three world compendiums hold the book's NPCs, beasts, Warbands and goods ready made, so you rarely fill in a stat block by hand.

A new NPC or Structure made from the Actors sidebar opens blank. Fill it in yourself, or drag one in from a compendium (see [The compendiums](#the-compendiums) below).

## The NPC sheet

![An NPC sheet on its Stat Block page, with the picture, name and epithet at the top, the Individual, Swarm and Warband pills on the right of the header, the row of buttons below, Virtues with the A badge beside VIG, Age and Wields pills, Con](images/npcs-structures-and-compendiums-npc-sheet.webp)

The sheet has two pages, picked from the icon rail hanging off the window's right edge (it moves to the left edge when the window is too close to the right of your screen). Hover an icon to see its name.

| Page | What it is for |
| --- | --- |
| **Stat Block** (pawn) | Scores, Scale, Age, conditions, Feats, Weakness and what they carry. The sheet opens here. |
| **Traits & Notes** (feather) | A page of notes filling the window, the way a Knight's Chronicle does. |

### The header

- **The picture**: click it to choose a new one. Hover it to see a larger copy beside the sheet (turn this off with **Larger Art on Hover** in [Your Settings and Accessibility](Your-Settings-and-Accessibility)).
- **Name** and **Epithet**: type straight into them.
- **Owned by**: shown when the NPC is a Knight's steed or other companion. Click the Knight's name to open their sheet. See [Property, Steeds and Squires](Property-Steeds-and-Squires).
- **Scale**: three pills on the right of the header. Hover each for what it means.
  - **Individual**: one person, beast or thing.
  - **Swarm**: bats, bees and the like.
  - **Warband**: two dozen or so fighting as one. Picking it changes the sheet: **Age**, **Wields** and **Roll Virtues** go, an **Upkeep** button appears, and the Warband's own states join its conditions (see [Warbands](#warbands)).

Two labelled buttons can sit in the window's title bar, left of Foundry's own controls:

- **Roll Virtues** rolls each Virtue on d12+d6, as the book has hirelings rolled, and posts the scores to chat. If the NPC already has Virtues of its own (anything other than the blank 10s every NPC starts with), it asks first. Not offered for a Warband.
- **Afflict Targets** appears only for an NPC that causes an affliction. Target the Tokens that caught it, then press it. See [Running Combat](Running-Combat).

### The buttons

A row of buttons sits under the header for anyone who can edit the NPC.

| Button | What it does |
| --- | --- |
| **Attack** | Opens the Attack window. See [Running Combat](Running-Combat). |
| **Duel** | Target the one Token they agreed to fight, then press it. |
| **Take Damage** | Opens the Damage window. |
| **Morale** | A SPI Save to hold firm rather than rout or surrender. |
| **Reaction** | A SPI Save for how they take something, when you are uncertain which way they'd go. |
| **Upkeep** | Warbands only: a Warband short of rest or food, or driven too hard, loses d6 SPI. |
| **Rest** | GD back to full, Fatigue removed, no longer Exposed. |

**Morale**, **Reaction** and **Rest** each open a small window first, saying what is about to happen and what the score is (for a Save, the SPI it rolls against). Press **Accept** to go ahead, or close the window to back out. A Save posts its card to chat.

When Morale fails, the card offers to mark them **Fled** or **Surrendered**, which takes them out of the Combat's turn order. The mark then shows among their conditions with an × on it. **Click the mark** ("Clear it: they're back in the fight") to take it off. The Morale card itself is covered in [Running Combat](Running-Combat).

In a Combat, an NPC or NPC Knight who is Mortally Wounded, Slain, wiped out or destroyed is marked defeated, so their turns are skipped. Patch Up, healing or Repair stands them up again. Players' Knights are never marked.

A Warband led from the front rolls Morale on its leader's SPI. Only the Warband is offered Fled or Surrendered.

**Upkeep** asks what has worn the Warband down (**Ill-rested**, **Poorly fed** or **Driven too hard**), then rolls the SPI Loss and posts it. Virtue Loss is not Damage, so it never Mortally Wounds them.

### Scores and Armour

- **Click a Virtue's name** (VIG, CLA, SPI) to roll a Save on it.
- Each score has two boxes: what it is now, and its most. GD works the same way.
- **The A badge beside VIG** is their Armour. Hover it to see what the Armour is ("Mail, helm, shield", say), or just "Armour" if nothing is written. **Click it** to open **Their Armour**, where you change both what it is and the number. There is no Armour row; this badge is the only place to set it.

### Age, Wields and the structure tick

- **Age**: **Young**, **Mature** or **Old**. Click the Age they are to clear it again. Moving someone who already has an Age to an older one opens **Growing Older**: **Roll Virtues** rerolls each Virtue on d12+d6 (turning Mature keeps the higher result, turning Old the lower), and **Just change Age** leaves the scores as they are. A Warband has no Age.
- **Wields**: how they hold their weapons, which limits what joins an Attack.
  - **By their gear** (the default) reads it off what they carry. Hover it to see which way it read them.
  - **In two hands**: held as a Knight holds them.
  - **All at once**: claws, teeth, or more hands than two. Every attack joins in.
- **Counts as a structure**: tick this for a creature so big that only what harms a structure harms it. Walls and ships should be Structure actors instead. At 0 GD such a creature shows **Destroyed**: it makes no Attack, counts as down for Morale, and the after-Combat rest doesn't restore it.
- **Fights on when Mortally Wounded**: for the few of the Cast that keep fighting through a Mortal Wound. They can still Attack and aren't dying of it. The book's Rotting Corpse comes with it ticked.

### Conditions

The same condition pills as a Knight's sheet: click the ones you mark by hand, while the others light up on their own. Afflictions, marks left by Gambits, and dice that last through a fight show here too. See [Saves, Luck and Feats](Saves-Luck-and-Feats) and [Scars, Death and Successors](Scars-Death-and-Successors).

- **Patch Up** appears under the conditions when there is a Mortal Wound, or a Scar waiting on it, that can be tended.
- **Led from the front by ...** appears on a Warband while a leader shares its Damage. The leader is picked in the Warband's Attack window. The line clears itself when the leader's next turn starts; the × beside it ("Nobody leads from the front") clears it sooner.

### Feats and Weakness

- **Feats**: Smite, Focus and Deny, as pills. Feats are for Knights, but some of the Cast can perform one: **click a pill** to mark what this NPC can do. Each marked Feat is then listed below the pills; click it to show it to the table. Its Save is made where the Feat is used, in an Attack.
- **Weakness**: write what can be turned against them, and pick the die it is worth from the box under it (hover the box for a guide). Tick **The Knights know of it** once they have learned it: from then on the Attack window offers that die to anyone attacking them. Until then, attackers are not told.

### Attacks & Gear

Everything they carry, listed the way a Knight's Property is. Drag an item onto the list, or use the **+ Weapon**, **+ Armour** and **+ Gear** buttons under it. The rows work as they do on a Knight; see [Property, Steeds and Squires](Property-Steeds-and-Squires).

### Warbands

With **Warband** picked as the Scale, three more states join the conditions. They can't be clicked: they light up from the Warband's scores.

| State | When it lights |
| --- | --- |
| **Routed** | A Mortal Wound, or a failed Morale Save they fled from. |
| **Broken** | SPI 0: they act only in their own interest. Their Attack window says they follow no orders, and they count as down when their side's Morale is weighed. |
| **Wiped Out** | VIG 0. |

Warbands take no Scars. Warbands raised by a Domain are covered in [Domains and Courts](Domains-and-Courts).

## NPC Knights

An **NPC Knight** is a Knight the Referee plays: a Holding's ruler, a rival to duel, a Knight met on the road. It has the whole Knight sheet, with its Property, Ability, Passion and Seer, but it is never one of the Company.

- **Making one.** Create an actor of the type **Knight** from the Actors sidebar and pick **The Referee** under *Who plays this Knight?*, or tick **NPC Knight** in the title bar of a Knight's sheet. Untick it to make them a Knight of the Company again. Only a Referee sees the tick, and a Knight a player holds can't be made one.
- **Left out of the Company.** Mornings, the Season's pursuits, the end of a Phase, Search, and the Company's size leave NPC Knights out, even when their Tokens are selected. In a fight they make Morale Saves as NPCs do.
- **No Squire, no Travels.** An NPC Knight takes no Squire, and a Knight a Squire serves can't be made one until the Squire is unlinked or Knighted. The sheet has no Travels page.
- **Where they're kept.** NPC Knights are filed in the Actors sidebar's NPCs folder, and their Tokens keep Foundry's usual name display.
- **Made for you.** **Grant to a Knight** on a Holding, picking a Knight not yet in the world, makes them as an NPC Knight rolled as a Ruler. See [Domains and Courts](Domains-and-Courts).
- **Taken up.** An NPC Knight a player takes up as a successor becomes a Knight of the Company. See [Scars, Death and Successors](Scars-Death-and-Successors).

In a world made before NPC Knights, the Knights in the NPCs folder that no player held became NPC Knights, as did any a solo Referee had marked as not riding with the Company. So does a Knight brought in from an older compendium.

## The Structure sheet

A Structure is a thing with GD but no Virtues: a wall, a gate, a ship, a siege tower. Its sheet looks like an NPC's, with its own two pages on the rail: **Stat Block** (a dungeon gate) and **Traits & Notes**.

- **What it is**: **Structure**, **Ship** or **Siege Engine**. Hover each, or read the line under the pills, for how it is harmed and destroyed.
- **Stone**: tick it for a stone wall, which only siege engines harm. A gate in it is usually wood, so make the gate its own Structure.
- **Carries**: ships only. What it holds ("6 passengers, a Warband", say).
- **Guard** with its two boxes, and the **A badge** beside it, which works as on the NPC sheet (the window is called **Its Armour**).
- **Destroyed** lights up at 0 GD.
- **Weapons & Cargo**: add a Weapon or Gear, or drag one in.

The buttons:

| Button | What it does |
| --- | --- |
| **Attack** | Only shown once the Structure carries a weapon, as a siege engine does. |
| **Take Damage** | Damage, which only fire, siege engines or something big enough gets through. |
| **Repair** | A day of repairs: GD straight back to its most, and a card in chat says so. It asks first only when the Structure is destroyed. |
| **Collide** | Ships only. Rolls the Damage from colliding with another ship. |

### Colliding ships

1. **Target the other ship's Token** first, if it is on the map. This is optional.
2. Press **Collide** and say how this ship measures against the other: **Of a size (d12 each)**, **Much the larger (d6)** or **Much the smaller (d12)**.
3. Press **Roll the Damage**. This ship takes its Damage at once. With the other ship targeted, it takes its own Damage too.

If you can't change the other ship (a player's, say), its Damage is posted on a card with a **Take the Damage** button for its owner or the Referee to press.

> **Did you know?**
> - Rest after a fight skips Structures: their GD comes back by repair.
> - A world that had structure NPCs from an older version of the system has them made into Structure actors on its next load, keeping their Tokens, pictures, items and notes. An NPC with Virtues of its own that only counts as a structure stays an NPC.

## The compendiums

**Import PDF** reads your copy of the book and fills three world compendiums. How to run it, and what else it brings in, is on [Bringing In Your Rulebook](Bringing-In-Your-Rulebook).

| Compendium | Folders | What it holds |
| --- | --- | --- |
| **Arms & Goods** (Items) | Weapons, Armour, Tools, Remedies, Poisons | Everything a Knight can buy or carry. |
| **Beasts, Hirelings & Warbands** (Actors) | Beasts, Hirelings, Warbands, Structures, Ships & Siege | Steeds and beasts of burden, hired folk, the book's Warbands, and its ships, walls and siege engines. |
| **NPCs** (Actors) | Seers, Myths, The City Quest | Every Seer with a stat block, every Myth's Cast, and the City Quest's Cast. |

### Arms & Goods, and Beasts, Hirelings & Warbands

These two are also copied into your **Items** and **Actors** directories, in a folder named after each compendium with a subfolder per kind, so they are at hand without opening a compendium.

- Anything already in that folder by the same name is left alone, so your own edits survive a second import.
- Delete the folders and they stay deleted, until you run Import PDF again.
- A hireling brought into the world from **Beasts, Hirelings & Warbands** rolls each Virtue on d12+d6 as it is made, since the book gives only their GD. This happens only while its Virtues are still the blank 10s, and never for a Warband.

The Domain sheet's **Muster a Warband** and a Knight's **Take a Steed** both draw on the Beasts, Hirelings & Warbands compendium. See [Domains and Courts](Domains-and-Courts) and [Property, Steeds and Squires](Property-Steeds-and-Squires).

### NPCs

![The NPCs compendium window with its three top folders, Seers, Myths and The City Quest, the Myths folder open to its One to Six folders, and one of those open to the Myths inside it with their Cast listed](images/npcs-structures-and-compendiums-npcs-pack.webp)

The book's NPCs, sorted the way the book rolls for them:

- **Seers**, in folders **One** to **Six** by their d6. Each Seer's notes say which Knight they knighted, with the page.
- **Myths**, in folders **One** to **Six** by the Myth's d6, then a folder for each Myth holding its Cast. Each carries the Myth's picture and a note naming its Myth and page.
- **The City Quest**, its Cast in the order printed.

A few Seers and Cast members that are things rather than people come in as Structures.

This compendium is the Referee's: players can't open it, and nothing copies it into the world. **Drag in whoever the Company meets.** One of a Myth's Cast dragged into the world joins that Myth's Cast on the Referee Toolkit's Myths page. See [Myths and Omens](Myths-and-Omens).

> **Did you know?**
> - Running Import PDF again empties and refills all three compendiums. Make your changes to the copies in the world, not inside a compendium.
> - The access you set on a compendium is kept: the system sets it only when it first makes one.
> - An old macro that calls `game.system.api.openNpcChooser()` now opens the NPCs compendium.

## The Macros compendium

The system ships one compendium of its own, **Mythic Bastionland Macros**. Players can't open it. It holds:

| Macro | What it does |
| --- | --- |
| **Referee Toolkit** | Opens the [Referee Toolkit](The-Referee-Toolkit). |
| **Rulebook** | Opens or closes [the rulebook reader](The-Rulebook-Reader). |
| **Import PDF** | Brings in your rulebook. See [Bringing In Your Rulebook](Bringing-In-Your-Rulebook). |
| **New Site** | Starts a new [Site](Sites). |
| **Luck Roll** | Rolls a Luck Roll. See [Saves, Luck and Feats](Saves-Luck-and-Feats). |
| **End the Session** | Opens the [Ending a Session](Ending-a-Session) window. |

The system also makes its macros in each world and puts them on hotbars for you, so this compendium is mainly where to drag a fresh copy from if you delete one. See [Macros and Hotkeys](Macros-and-Hotkeys).

## See also
- [Running Combat](Running-Combat)
- [Bringing In Your Rulebook](Bringing-In-Your-Rulebook)
- [Myths and Omens](Myths-and-Omens)
- [Domains and Courts](Domains-and-Courts)
- [Property, Steeds and Squires](Property-Steeds-and-Squires)
- [Macros and Hotkeys](Macros-and-Hotkeys)
