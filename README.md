# Mythic Bastionland for Foundry VTT

An unofficial Foundry VTT system for [Mythic Bastionland](https://www.bastionland.com) by Chris McDowall. It is not affiliated with Bastionland Press, and it ships none of the book's text beyond the short rules reminders printed on the free character sheet and the Travel rules printed on the free Blank Realm sheet, and none of its art beyond the map legend of the free Blank Realm sheet.

Requires Foundry VTT v14.

## What's here

The first milestone is the **Knight** character sheet, laid out after the official printed sheet:

- **Identity:** name, "Known as the ___ Knight", the Seer who knighted them, their ultimate fate, and a picture shown in the shield.
- **Heraldry:** click the shield to paint it with the tinctures and divisions of heraldry, or place a picture of your own. **Add a charge** offers 215 lions, towers, wyverns, crosses and more, drawn after public-domain heraldry books. A charge arrives in the colour in hand; pick a tincture while placing it to recolour it, and **Flip** to face it the other way. On a black charge the lines lighten so its detail still shows.
- **Seer:** the Seer who knighted them has a page of their own on the sheet's side rail, between the Knight and the Chronicle. It has the Seer's picture, **What the book says** (their stat line, traits, and the prompts along the foot of their Knight's page), and **Notes** for whatever the Knight learns of them. What the book says is read only and shown in full. After Import PDF the sheet fills in the picture and the book's text by itself, finding the Seer by the name beside Knighted by, or by the Knight while that's blank. A picture chosen by hand is kept, and the Notes are never touched.
- **New Knight:** make a Knight the way the book does. Pick a Start (Wanderer, Courtier or Ruler), roll Virtues and GD with its dice, then roll d6 and d12 for the Knight or pick one from the list. Knights other characters already are get marked. Applying sets Age, Glory, the rolled scores, Known as and Knighted by, fills in the Seer page, puts the Knight's portrait in the shield, and adds their Property, Ability and Passion along with the dagger, torches, rope, dry rations and camping gear every Knight carries. Rolls go to chat. Open it with **New Knight** in the sheet's title bar, next to **Domain**; a Squire's sheet has **Knight Squire** there instead. A Knight made with **Create Actor** opens it straight away.
- **Virtues and Guard:** VIG, CLA and SPI with current and maximum values, capped at 0–19. Click a Virtue to roll a Save (d20 equal or under).
- **Glory, Age and Rank:** Rank is worked out from Glory (0 / 3 / 6 / 9 / 12), and the sheet shows how far off the next Rank is.
- **Conditions:** Fatigued, Exposed and Mortal Wound are marked by hand. Exhausted (VIG 0), Impaired (SPI 0) and Exposed from CLA 0 follow from the Virtues.
- **Property, Ability, Passion and Scars:** stored as items, created on the sheet or dragged on. A + button opens the new item's sheet and nothing is added until you press Save, so a button pressed by mistake costs nothing. Worn armour adds up to the Knight's Armour.
- **Feats:** Smite, Focus and Deny roll their Save and mark Fatigue on a failure. A Fatigued Knight can't use them.
- **Attack:** target the Tokens you're attacking, pick weapons and shields, add bonus dice or Smite, then roll everything together. Impaired and unarmed Attacks roll a single d4. A Blast against several targets rolls separately for each, one card apiece. The dialog also asks about the turn, and holds the Attack to the rules for wielding weapons:
  - **Moved this turn** is ticked for you when the Token has moved this turn in combat. A Slow weapon can't be used after moving, and an Exhausted character can't Attack at all.
  - **Began the turn engaged in melee** leaves purely ranged weapons out of the roll.
  - **In a confined space** Impairs an Attack with a Long weapon.
  - A Knight can wield only one Hefty item, and a Long weapon on its own. NPCs aren't held to this, since stat blocks list a creature's attacks without saying how it holds them.
  - **Mounted** is ticked for anybody with a steed. A weapon marked Hefty if mounted, such as the lance, then counts as Hefty rather than Long, so it can go with a shield.
  - A **specialist weapon** (p12) is listed with a box to tick when its situation comes up, such as against the undead, which adds its +d8 or +d10. Set the die and the situation on the weapon's sheet.
  - **Charged a spearwall this turn** refuses the Attack, since enemies of a spearwall can't Attack on the turn they charge it.

  Problems show in the dialog as you tick boxes, and anything left out of the roll is noted on the card. The chat card then takes the Attack through the book's steps:
  - **Deny:** the target or an ally selects their Token, presses Deny, picks a die to discard and rolls the SPI Save. A player can Deny on somebody else's card while a GM is logged in.
  - **Gambits:** whoever rolled clicks a die of 4+ to spend it on a Gambit, choosing No Save or a Greater effect for a melee die of 8+. Clicking a spent die takes the Gambit back. **Focus** performs a Gambit without a die, after its CLA Save.
  - **Damage:** the card keeps the Damage up to date, the highest die left plus Bolster. Each Feat can be used once per Attack by each combatant.
  - **Apply Damage:** the GM, or whoever owns a target, opens Take Damage for each target with the Damage, ignore Armour and Blast already filled in. A Scar outcome opens Roll Scar with the die that caused it. The card is then settled.
- **Duel:** target the one Token you've agreed to fight and press Duel on the sheet. Choose a duel or a joust, whether two Knights stake Glory, and whether it's bloodless. A duel card follows the fight:
  - Each duelist presses Attack as normal. The dialog offers to make it part of the duel, which targets the other duelist and holds back the Damage. Both can Deny, Focus and declare Gambits on their cards.
  - Once both have rolled, a GM, or whoever owns both, presses **Resolve Both Attacks**. Both Damages are read before either lands, so they happen at the same time. A bloodless duel leaves no Scars.
  - Press the victor's button, or No victor, to end it. With Glory staked, the victor gains 1 and the loser loses 1.
- **Take Damage:** applies Armour, then GD, then VIG, and reports Evade, Scar, Wound, Mortal Wound or Slain. Protective cover adds a point of Armour against a ranged Attack, and a shieldwall adds a point against any.
- **Roll Surprise:** a GM picks it from the Combat Tracker's encounter menu (the ⋮ button) and ticks everybody who wasn't readied for combat. Each rolls a CLA Save, and one card shows who misses the first turn.
- **Roll Scar** (under Scars on the Knight sheet): re-rolls the die that caused the Scar, rolls where it landed, applies any Virtue Loss or immediate GD increase, and records the Scar.
- **Recovery:** Rest restores GD and clears Fatigue. Each Virtue has its own restore button next to its recovery method.
- **Remedies:** mark a gear item as a Remedy for a Virtue, and a flask button appears beside it. Using it asks who's present, restores that Virtue to each of them, and uses the Remedy up.
- **Steed:** drag an NPC from the Actors tab onto the Knight sheet to ride it. When its weapons include a trample, the Attack dialog offers a mounted charge that adds the trample dice. A **Dismount** Gambit rolls the d6 being dismounted causes and adds it to the dice; take the Gambit back if the target Saves.
- **Squire:** Take a Squire on the Knight sheet rolls 2d6 for each Virtue and a d6 for their extra equipment, then creates the Squire, with 1GD, a dagger, a pony and a kneeling portrait, beside the Knight in the Actors tab. A Company of more than 2 Knights is asked first. A Squire's sheet has no Glory, Rank or Feats, and a new Age doesn't give them Glory. **Knight this Squire** rolls the d6 they gain in each Virtue and makes them a Knight, taking the kneeling portrait off if nobody has changed it. Drag a Squire onto a Knight's sheet to link them by hand.
- **Successor:** name the Knight or Squire who follows this Knight, or drag another Knight onto the sheet. The Succession and Legacy pursuits use it when the Age turns.
- **Reopen on reload:** Knight, item and journal sheets you had open come back where you left them when you reload Foundry. Turn it off with **Reopen Sheets on Reload** in Configure Settings. It's saved per browser.

### Structures

The **Structure** actor is for ships, walls, gates and siege engines (Wood and Stone, p11). It has only GD and Armour, no Virtues:

- **What it is:** Structure, Ship or Siege Engine, with that kind's rules on the sheet. A ship notes what it carries.
- **Take Damage** asks whether the Attack was fire, a siege weapon or a suitably large creature, since nothing else harms it. At 0GD it's **Destroyed**, and it never rolls Morale.
- **Repair:** a day of repairs restores its GD.
- **Collide:** a ship rolls the d12 Damage a collision deals, or the d6 when it's much the larger ship, and takes it.
- **Attack** appears once it has a weapon, such as a siege engine's.
- Import PDF files the book's structures, ships and siege towers as Structures. An NPC made with Create Actor and filled in from Choose from Book becomes one when its stat block has only GD and counts as a structure. On the first load after updating, structure NPCs whose Virtues were never set become Structures by themselves.
### NPCs

The **NPC** sheet is laid out like the stat blocks the book prints for each Myth's Cast and each Seer, for anybody who isn't a player's Knight:

- **Stats:** name and epithet, VIG, CLA and SPI, GD, and Armour with a note on what it is. Saves, Attack, Take Damage and Rest work as they do for Knights.
- **Attacks and gear:** weapons, armour and gear items. Weapons can also be Blast or ignore Armour.
- **Feats:** off by default, since only some of the Cast can perform one. Mark the ones this character can.
- **Warbands:** set the scale to Warband and a Mortal Wound routs them, SPI 0 breaks them and VIG 0 wipes them out. Take Damage asks whether the Attack was Blast or large-scale, since nothing else harms them, and their Attacks on individuals get +d12 and Blast.
- **Leading from the front:** a Warband's Attack dialog lists individuals to lead it: the selected Tokens, your character and the Knights you can see. The leader's worn and wielded Attack dice join the roll. Until the leader's next turn in combat, Damage that gets past the Warband's Armour opens Take Damage for the leader too. The NPC sheet shows who leads the Warband.
- **Creatures that count as structures:** mark an NPC that counts as a structure, such as a colossus of stone, and Take Damage asks whether the Attack was fire, a siege weapon or a suitably large creature. Damage wears its GD down without touching VIG, and at 0GD it's destroyed. An NPC with only GD is better as a Structure: **Make a Structure** on its sheet turns it into one, keeping its Tokens.
- **Morale:** rolls the SPI Save to stand rather than rout or surrender. The Damage card offers the roll when an NPC is Wounded, or when a Warband's VIG falls to half. In combat, once half of an NPC side is down, GMs get a card to roll the group: once on a leader's SPI if organised, or for each member standing. Knights are never asked.
- **Choose from Book** (in the NPC sheet's title bar): after Import PDF, browse the Myths, the Seers and the City Quest, read each Myth's Omens, and fill in an NPC from any stat block in its Cast, or from a Seer. An NPC made with **Create Actor** opens it straight away, and becomes a Structure if the stat block is one.
- **Paste Stat Block** (also in the title bar): paste a stat block as text, such as one copied from your PDF, and the sheet fills in from it.

### Domains

A **Domain** is an actor for a Holding granted to a ruler (Dominion and Authority), made with Create Actor in the Actors tab:

- **The Holding:** its name and picture, whether it's the Seat of Power, and who rules it.
- **Council:** the Steward, Marshal, Sheriff, Envoy and the Circle, with what each seat does.
- **Crises:** the Crises the Domain faces, each with how it's resolved and a button to resolve it. **Add Crisis** gives it one the Referee chooses, such as one a failed task brings.
- **Crisis Roll:** a Calamity adds two Crises, and a Dilemma asks which of two to take. The sheet shows whether it's been rolled this Season. A Crisis rolled that the Domain already faces passes to the next on the list.
- **Misrule:** the sheet warns at 3 unresolved Crises, and turning the Season or Age in the Time window puts every Domain still at 3 or more into misrule.
- **Increased Collections** and **Drama in Court** roll their tables. Drama in Court also rolls the Drama Spark Table when Import PDF has brought it in.
- **Authority:** how many Warbands the Domain can muster, with reminders of grand designs and succession.
- **Succession:** write in the ruler's successor, or leave it to the successor the ruling Knight named. **Pass On** hands the Domain to them, and the card warns that they will face some resistance.
- **Conquest:** **Seize by Force** puts whoever took the Holding in charge. The sheet marks it in turmoil for the rest of the Season, and the Season's card says when it has adapted to its new ruler.
- A Knight chosen as the new ruler rules the Domain from their sheet, and the Knight who ruled before no longer does.

### Referee tools

GMs get five buttons at the top of the Roll Tables tab:

- **Referee Rolls:** roll a d6 on one of the book's quick tables and post the result: the Luck Roll, Passage of Time, Unresolved Situation, Travelling Blind, Dire Weather and Local Mood.
- **Spark Tables:** after Import PDF, browse the four pages of Spark Tables laid out as the book sets them. The dice button on a table rolls a d12 for each column, posts the two entries as a prompt, and marks them in the window.
- **Time:** the world's calendar of Age, Season, Day and Phase, and what moves it on:
  - **Next Phase** posts the new Phase, with a reminder of what it costs, such as lost sleep each Morning.
  - **Turn the Season** asks which Knights take part, and each picks a pursuit (Pilgrimage, Courtesy or Service). They have their Virtues restored, and a Mutilation Scar settles, raising max GD by d6 if it's 10 or less.
  - **Turn the Age** does the same with Duty, Succession or Legacy, and each Knight also gains 1 Glory. An Old Knight loses d12 VIG, and dies peacefully at 0. The new Age begins in Spring. Succession names a successor, and offers to Knight them if they're a Squire. Legacy gives the successor half the Knight's Glory, rounded down.
  - **Journey to a Distant Realm** (p14) turns the Season the way Turn the Season does, but nobody picks a pursuit. Pick another Realm Scene as the destination and it becomes the active Scene once the Company arrives.
  - **Passage of Time** and **Unresolved Situation** roll those tables.
  - **Hardship** takes d6 from a Virtue for everybody ticked: SPI for night travel, CLA for no proper sleep, and VIG for Winter cold or going without supplies.
  - Clicking a Season or Phase, or changing the Age or Day, sets the calendar by hand without any of that. In Winter the Wilderness Roll card reminds the GM of the cold and dire weather.
  - **Glory** awards 1 Glory to each Knight ticked for a Myth resolved, a tournament won or a battle won, and says when a Knight reaches a new Rank. Squires are left out.
- **GM Toolkit:** opens the GM Toolkit, below, which took over from the Myths window.
- **Sites:** **New Site**, in the Journal and Roll Tables directories and as a macro on each GM's hotbar, makes a Journal entry that opens on a map drawn the way the book does (p15). Click the points on the hexagon to mark features, dangers and treasure, and the gaps between marked neighbours to draw open, closed and hidden routes. A bar over the map sets a point's number and entrance, or what's along a route. The book's four steps sit beneath the map, counting what's drawn against the rules, warning when a point can't be reached, and rolling whatever isn't done. **Roll the rest** does all four, keeping anything already drawn. The book makes the hidden entrance optional, so the dice leave it for the GM to place. Breaking the rules changes the counts, or starts from the book's sealed burial complex. The key beside the map holds what's at each point and each entrance. In **Reveal**, clicking a point, hidden route or entrance shows it to players. **Show Players** opens the Site for them, and they see only what's been found, plus the open and closed routes leading from it, updating as the GM reveals more. Undo and Redo take back changes. A New Site closed with nothing drawn or written is deleted again.
- **Doom and other Scars that wait:** a Doom Scar lasts the Season it was taken in, and while it does, a Mortal Wound Slays instead. Gouge, Tear and Humiliation get a settle button on the Knight sheet for the Referee to press when the Knight is stitched up, patched up or avenged.
- **Growing older:** changing a Knight's Age to Mature or Old offers to reroll each Virtue on d12+d6, keeping the higher when becoming Mature and the lower when becoming Old.

### The Realm

The Realm is a Foundry Scene, so everybody sees the same map and moves their own Knight on it:

- **New Realm:** a GM button in the Scenes tab. Give the Realm a name and a seed, and it's rolled the way Creating a Realm describes onto a Scene of 12 by 12 hexes:
  - clusters of terrain and a river crossing the map;
  - four Holdings a good distance apart, one of them the Seat of Power;
  - six numbered Myths in remote hexes;
  - three or four of each Landmark;
  - Barriers on one sixth as many hex edges as there are hexes.

  The same seed rolls the same Realm.
- **What players see:** the terrain, the river and the Holdings. Myths, Landmarks and Barriers are hidden Tiles and Drawings, which GMs see faded and can reveal with the eye on the Tile or Drawing HUD.
  - Leave hidden Tiles unlocked: Foundry hides a hidden, locked Tile from GMs too.
  - Like hidden Tokens, hidden parts of the Realm are still sent to every player's browser, and so are the GMs' Realm cards. A player sees a Wilderness Roll only as the GM rolling privately.
  - The same goes for what you write in the Lay of the Land, and for the GM Toolkit's notes on Myths and the Company's journey: they ride on the Scene, so they reach every browser. They're kept there for consistency, not secrecy.
- **Realm Key:** a chat card only GMs see. It lists each Myth with its page, the Holdings, and the Seer at each Sanctum, named from Import PDF where it has been run.
- **The Company:** one Token stands for all the Knights, because the Seers deemed that they travel as a Company (p7) — "while some of you may rest, roam, or die, your collective journey will be as one".
  - The New Realm dialog places it. Choose the Company's **Start** and it begins where the book puts it (p6): a **Wanderer** arrives over the edge of the map, a **Courtier** at the Seat of Power, and a **Ruler** at a Holding of their own, never the Seat that lies under a wicked influence. The same seed puts it in the same place.
  - Give it a picture of your own there, or keep the pennant that ships with the system. Change it later from the token HUD like any Token.
  - It belongs to **no Actor**, which is how every player can move it without anything being owned or shared out. The Knights' own sheets stay one per Knight, where the book keeps them.
  - **Company here** on the Hex panel stands it in that hex, making the Token the first time. That is the way to give a Realm made before this a Company, or to move it without dragging.
  - Where the Company Token stands is where the Company is: the Wilderness Roll, the Travel rules and the Lay of the Land all read it, so there is no guessing from selected Tokens and no “the Company is split”. Delete the Token and they fall back to the player-owned Tokens as before.
- **The Lay of the Land:** what you've made of a hex, kept in the hex. The book asks the Referee to fill the blanks in a Hex with Spark Table prompts (p19), and this is where those rolls are kept, so a Company coming back finds the hex they left. Open it from the Hex panel.
  - It shows what the Realm already says stands there, whether the Company has been there, a box to write what's in the hex, and every Spark Table roll made for it so far, newest first, each with the dice and the date it was rolled.
  - **Roll a wilderness hex** rolls the first table of each row of the Nature page (p22) in one go — the lay of the land, its weather and a feature of it. The dropdown rolls any of the four pages' tables on its own. Both need Import PDF; without it you can still write notes.
  - Rolls are whispered to GMs. **Tell the players** posts what you wrote, and only what you wrote, as a card everyone sees; a Myth or Landmark still hidden never rides out in it.
  - **Ask about a new hex** in the settings decides what happens when a player's Token comes to rest in a hex nothing has been written down for: nothing, a note in the corner, or the window opening. Each browser sets its own, and a hex is only offered once per session. The default is the note.
  - A hex keeps its last 24 rolls. Rerolling the Realm leaves what you wrote alone, so notes about hexes that have changed are yours to clear.
- **Barriers:** a Token can't move across a Barrier, even one nobody has found yet, or off the edge of the map. Moving around one a hex at a time works. A GM with Foundry's Unconstrained Movement turned on passes through.
- **Hex readout:** on a Realm Scene everybody sees the hex under the pointer named at the top of the screen, with its terrain and whatever they can see in it.
- **Travel and Exploration:** while a Realm Scene is on the canvas, everybody has the rules for getting about it on both sides of the map, split so that neither side is too tall. The text is the rulebook's own, as printed on p18-19 and on the free Blank Realm sheet; only the worked example of the Goblin is left out.
  - **Travel**, on the left, is about moving across the map: the three ways to travel, the Wilderness Roll, Myth Hexes, Omens, Barriers, and the Travelling Blind, Dire Weather and Local Mood tables.
  - **Rest and Exploration**, on the right, is about stopping and looking around: Hospitality, Camping, Supplies, Night, Sleep and Winter, Exploration (the lay of the land, exploration actions, Saves, Searching and Vision), and Gathering Folklore.
  - They move with the map as you pan and zoom, but keep their own size so they stay readable. When the map runs past the top or bottom of the screen, they stay on screen beside it. The sidebar, scene controls and windows sit above them, so pan or zoom out if something covers them.
  - Each group opens and closes, and each side's chevron folds that side down to its title. Each browser remembers how it was left.
  - At night, Night stands out; each morning, Sleep and Supplies; and all Winter, Winter and Dire Weather.
  - GMs get a button under each table: the Wilderness Roll for the Company, and the Travelling Blind, Dire Weather and Local Mood rolls.
  - The page numbers open the rulebook at that page for anyone the rulebook is offered to.
- **Realm tools:** GMs get a Realm group in the scene controls on a Realm Scene.
  - **Inspect hexes:** click a hex to open its panel. It holds the hex's terrain and whatever is in the hex: a Holding's style, name and Seat of Power; a Myth's number, roll and Omens seen; a Landmark's type, name and, for a Sanctum, its Seer. It also has a button to reveal a hidden thing, the hex's six Barriers, and a Wilderness Roll made there.
  - **Paint terrain:** pick a terrain in the palette, then click or drag across hexes. Alt-click a hex to pick up its terrain.
  - **Barriers:** click a hex edge to add or remove a Barrier, and Shift-click to reveal or hide it.
  - **Wilderness Roll:** select the Company's Tokens and press it. A Holding's hex needs no roll, and a Myth's own hex gives its next Omen. Otherwise choose travelling or camping, and the d6 is rolled: a random Myth's Omen, the nearest Myth's, or the hex's Landmark, which is revealed. The Myth's count of Omens seen goes up, and a card only GMs see names the Myth and the Omen, quoting it if Import PDF has been run.
  - **Tidy the Realm:** snaps icons back to the middle of their hexes, unlocks hidden Tiles, lays the river and Barrier lines again, and lists anything it can't put right.
  - **Reroll the Realm:** rolls a new Realm onto the same Scene. Tokens and anything else on the Scene stay.

The map looks like the Realm Sheets: the terrain, Holdings and Landmarks from the legend of the Blank Realm sheet, traced so they stay sharp however far you zoom, in white hexes ruled in grey. Rivers are inked as the Realm Sheets draw them, and Myths are numbered in the red pen the sheet marks Landmarks in. As on the sheet, a Holding takes the place of its hex's terrain. **Realm Appearance**, under Configure Settings, offers other skins and sets of colours, and takes pictures of your own.

### The GM Toolkit

The GM's own place for how the Realm stands, as the Stonetop system keeps its GM's. It's an Actor of its own type, and each world has exactly one, made the first time a GM loads the world with this version. Players never see it.

Each GM is given it as their character, as on Stonetop, so **C**, Foundry's character sheet key, opens it whenever no Token is selected, and the Players list shows it by their name.
- It's given once, the first time a GM loads the world with a toolkit in it. A GM who already has a character of their own keeps theirs, and a GM who takes the toolkit off isn't given it again. Set it back under **User Configuration** from the Players list.
- Foundry would sign a GM's chat with their character's name when no Token is selected. The toolkit never speaks, so those messages keep the GM's own name.

It's also in the Actors tab, behind **GM Toolkit** in the Roll Tables tab, and on the Realm controls of a Realm Scene. Its pages hang off a rail on the window's edge, and the **Realm** at the top picks which Realm the first three show.

- **Myths and Omens:** each Myth of the Realm with the Omen playing out and the one to come (p18), and all six folded beneath. The Omens are quoted after Import PDF.
  - **Next Omen** counts one more and whispers it to GMs; **−** takes one back. The Hex panel and the Wilderness Roll count the same Omens.
  - Each Myth has a box for your notes on it.
  - **Myth Resolved** marks it resolved and awards the Glory (p27). A resolved Myth offers **Roll the New Myth**, which rolls the Myth that replaces it in the same hex and under the same number, with none of its Omens met. The Realm's Undo takes the roll back, with your notes on the old Myth.
  - The City Quest is kept here too: **Roll an Omen of the City** rolls d12 plus those already encountered, skipping duplicates, and says when the Quest ends. The Wilderness Roll card reminds GMs of it on a random Myth's Omen once a player's Knight is Knight-Radiant.
- **Journey:** every hex the Company has come into, the last reached first: what stands there, how often and when the Company was there, what you wrote about it, and the Spark Tables rolled there.
  - The active GM's browser counts a hex each time the Company Token walks into it, hexes passed through on the way included. A Token put down from the Hex panel counts only where it lands, and a move taken back counts nothing. Without a Company Token, any player's Token counts.
  - **Count a Visit** and **Forget the Visits** set it right by hand, here and in the Lay of the Land.
- **Places:** the Realm's Holdings, its Landmarks, found or not, with the Seer at each Sanctum, every other hex you've written about or rolled for, and the Sites in the Journal.
- Each hex on those two pages holds the same note and rolls as the Lay of the Land. It has **Show on the Map**, **Roll a wilderness hex**, **Lay of the Land** and **Tell the players**. **Show on the Map** views that Realm, pans to the hex and marks it on your screen alone. Nothing is pinged to players, so a hidden Myth stays hidden.
- **Time:** **Next Phase**, **Turn the Season** and **Turn the Age**, doing what they do in the Time window. The page also sets the calendar by hand, rolls Passage of Time and Unresolved Situation, and has Hardship and Glory. Resolved Myths wait here for the Season to turn.
- **Notes:** your own notes, such as the plans and ambitions the players share at the end of a session (p16).
- The world's last toolkit can't be deleted, since it holds your notes. A second one is refused, and Create Actor stops offering the type once the world has one. A world left open while the system updated needs launching again before the toolkit can be made.

### Art and text from your own book

Beyond the Blank Realm's legend and Travel rules, the system ships none of the book's art or text. A GM who owns the rulebook PDF can bring them in with the **Import PDF** macro, which is added to the Macro Directory the first time a GM opens a world:

1. Run the macro and choose your copy of the rulebook, the 212-page PDF. It is read in your browser and never uploaded.
2. Every Knight's and Seer's portrait and every Myth's illustration is saved to `mythic-bastionland-art/` in your Foundry data folder, named by roll: `knights/1-01-<name>.webp`, `seers/…` and `myths/…`. An `index.json` beside them lists each picture's roll, page and name, along with text read from your copy: each Knight's Property, Ability and Passion, each Seer's Virtues and traits, each Myth's Omens and Cast, the Spark Tables, and the City Quest's Omens and Cast.
3. When a GM runs it, everything listed in Arms & Goods, People & Realms and Warfare goes into two world compendiums, **Arms & Goods** and **Beasts, Hirelings & Warbands**, each kind in its own folder:
   - weapons (one for each example a line names, so Hefty Weapons gives a spear, a mace and an axe), armour, tools, Remedies and poisons;
   - beasts, hirelings, Warbands, and structures, ships and siege towers, as NPCs.

   Bows, slings and siege artillery are marked ranged, which the book leaves unsaid. Hirelings print only GD, so theirs keep the default Virtues with a note to roll d12+d6. Running the import again replaces what's in both compendiums. Choose Knight and Choose from Book fill characters in from it.

Running the import again replaces the files. It needs a user who is allowed to upload files, and like anything in the data folder, the pictures and the index can be fetched by anyone who can reach your Foundry server.

A new world greets its GM with **Welcome to Mythic Bastionland**, where the PDF is chosen once and put to both uses: this import, and a copy kept for reading the rulebook in Foundry. It opens when the world loads until a GM closes it once, and **Open the Welcome**, under Configure Settings, brings it back. Worlds begun before it existed aren't shown it by themselves.

## Development

The repository is the system folder. Clone it into your Foundry data folder's `systems` directory, then restart Foundry after editing `system.json`:

```sh
git clone https://github.com/PrinceWitherdick/mythic-bastionland-pwd.git "<Foundry data>/Data/systems/mythic-bastionland-pwd"
```

Foundry serves every file in a system folder to connected players, so keep source books and other private files outside it.

```sh
npm install
npm test        # rules, templates, and localization keys
npm run lint
```

Compendium packs are built from the JSON in `packs/src`. Build them before the first launch, and again after changing `packs/src`. Foundry must be closed or at the Setup screen, because it locks a pack while a world is open:

```sh
npm run pack    # packs/src into packs
npm run unpack  # packs back into packs/src, after editing a compendium inside Foundry
```

The built packs aren't committed, because Foundry rewrites them whenever a world is opened.

The layout:

- `module/rules/` holds the game arithmetic as plain functions with no Foundry dependency, so all of it is unit tested. That includes reading the rulebook's pages and stat blocks.
- `module/actions/` connects those rules to Foundry through dialogs, actor updates and chat cards.
- `module/book-art/` reads a rulebook PDF you own and saves its art and text, for Import PDF.
- `module/apps/` holds windows other than sheets, such as the Knight and NPC choosers.
- `module/canvas/` holds what runs on the Scene, such as the check that stops Tokens crossing a Realm's Barriers.
- `module/sheets/` and `templates/` hold the sheets.
- `packs/src/` holds the compendium sources.
- `assets/realm/` holds the Realm's pictures, every skin in every colour set, drawn by `node scripts/realm-placeholders.js` from `scripts/lib/realm-drawings.js`. Run it again after changing a skin, a colour set, or the Realm's terrain, Holding or Landmark lists. The Blank Realm skin is drawn from the sheet's legend, traced into `scripts/data/realm-sheet-art.json` by `python scripts/realm-sheet-art.py <Blank Realm PDF>`, which needs PyMuPDF, numpy and potracer. Tracing again is only needed if the sheet changes.
- `assets/heraldry/charges/` holds the heraldry painter's charges and their credits, built by `npm run charges` from the `CHARGES` list in `module/rules/heraldry-charges.js`. It fetches each drawing from the Book of Traceable Heraldic Art once, keeps it in `node_modules/.cache`, and cleans it down to the two colours the painter tints. Pass `-- --refresh` to fetch them again. A new drawing must come from a public-domain source; the tests hold a list of the sources checked so far.
- The Armorial Realm skin's drawings come from the same book. `node scripts/realm-armorial-art.js` fetches and cleans the ones its `ARMORIAL_ART` list names into `scripts/data/realm-armorial-art.json`, sharing the charges' cache, and `scripts/lib/realm-drawings.js` says which picture each is drawn in. Run `node scripts/realm-placeholders.js` after it. The same public-domain rule applies.

The system id lives only in `module/system-id.js`. Lint rejects the id spelled out anywhere else.

## Credits

- Fonts: [IM Fell English](https://fonts.google.com/specimen/IM+Fell+English) by Igino Marini, [UnifrakturCook](https://fonts.google.com/specimen/UnifrakturCook), and the digits from [EB Garamond](https://fonts.google.com/specimen/EB+Garamond), all under the SIL Open Font License (see `assets/fonts/licenses`).
- Heraldic charges: adapted from the [Book of Traceable Heraldic Art](https://heraldicart.org), digital illustration by Mathghamhain Ua Ruadháin, © 2016–2023 Matthew Simon Ryan Cavalletto, using only drawings after public-domain books. They are shared under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), which covers those drawings only. Each drawing's entry, source, original artist and adapter are listed in `assets/heraldry/charges/CREDITS.md`, and each file carries its own credit.
- Armorial Realm skin: its terrain, Holdings, Landmarks and Seat of Power are drawings from the [Book of Traceable Heraldic Art](https://heraldicart.org), digital illustration by Mathghamhain Ua Ruadháin, © 2016–2023 Matthew Simon Ryan Cavalletto, each after a public-domain book, recoloured and set into a Realm picture. Those pictures, in `assets/realm/armorial/`, are shared under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), which covers them only. Each picture's own credit names its drawing, source, original artist and adapter. Every skin's Seat of Power wears the Armorial skin's crown, so each skin's `seat.svg` is shared the same way.
- Realm terrain, Holdings and Landmarks: traced from the map legend of the free Mythic Bastionland Blank Realm sheet by Chris McDowall, Bastionland Press. Each picture carries the credit.
- Travel rules beside Realm Scenes: the Travel text of the free Mythic Bastionland Blank Realm sheet by Chris McDowall, Bastionland Press. The panel credits it too.
- Realm icons from [game-icons.net](https://game-icons.net), under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/): the drawn skins' [Village](https://game-icons.net/1x1/delapouite/village.html), [Castle](https://game-icons.net/1x1/delapouite/castle.html) and [Rempart](https://game-icons.net/1x1/delapouite/rempart.html) by Delapouite and [White Tower](https://game-icons.net/1x1/lorc/white-tower.html) by Lorc. Each picture carries the credit.
- Import PDF macro icon: [Spell book](https://game-icons.net/1x1/delapouite/spell-book.html) by Delapouite, from [game-icons.net](https://game-icons.net) under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), the same icon as Stonetop's Import PDF macro. The picture carries the credit.
- GM Toolkit portrait: [Read](https://game-icons.net/1x1/skoll/read.html) by Skoll, from [game-icons.net](https://game-icons.net) under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), the same mark as Stonetop's GM Toolkit, recoloured. The picture carries the credit.
- Squire portrait: [Kneeling](https://game-icons.net/1x1/delapouite/kneeling.html) by Delapouite, from [game-icons.net](https://game-icons.net) under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), recoloured. The picture carries the credit.
- Mythic Bastionland © Chris McDowall, Bastionland Press.
