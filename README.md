# Mythic Bastionland for Foundry VTT

An unofficial Foundry VTT system for [Mythic Bastionland](https://www.bastionland.com) by Chris McDowall. It is not affiliated with Bastionland Press, and it ships none of the book's text beyond the short rules reminders printed on the free character sheet, and none of its art beyond the map legend of the free Blank Realm sheet.

Requires Foundry VTT v14.

## What's here

The first milestone is the **Knight** character sheet, laid out after the official printed sheet:

- **Identity:** name, "Known as the ___ Knight", the Seer who knighted them, their ultimate fate, and a picture shown in the shield.
- **Heraldry:** click the shield to paint it with the tinctures and divisions of heraldry, or place a picture of your own. **Add a charge** offers 215 lions, towers, wyverns, crosses and more, drawn after public-domain heraldry books. A charge arrives in the colour in hand; pick a tincture while placing it to recolour it, and **Flip** to face it the other way. On a black charge the lines lighten so its detail still shows.
- **Choose Knight:** make a Knight the way the book does. Pick a Start (Wanderer, Courtier or Ruler), roll Virtues and GD with its dice, then roll d6 and d12 for the Knight or pick one from the list. Knights other characters already are get marked. Applying sets Age, Glory, the rolled scores, Known as and Knighted by, puts the Knight's portrait in the shield, and adds their Property, Ability and Passion along with the dagger, torches, rope, dry rations and camping gear every Knight carries. Rolls go to chat. Open it from the sheet's toolbar, or use **New Knight** in the Actors tab to create a Knight from scratch.
- **Virtues and Guard:** VIG, CLA and SPI with current and maximum values, capped at 0–19. Click a Virtue to roll a Save (d20 equal or under).
- **Glory, Age and Rank:** Rank is worked out from Glory (0 / 3 / 6 / 9 / 12), and the sheet shows how far off the next Rank is.
- **Conditions:** Fatigued, Exposed and Mortal Wound are marked by hand. Exhausted (VIG 0), Impaired (SPI 0) and Exposed from CLA 0 follow from the Virtues.
- **Property, Ability, Passion and Scars:** stored as items, created on the sheet or dragged on. Worn armour adds up to the Knight's Armour.
- **Feats:** Smite, Focus and Deny roll their Save and mark Fatigue on a failure. A Fatigued Knight can't use them.
- **Attack:** target the Tokens you're attacking, pick weapons and shields, add bonus dice or Smite, then roll everything together. Impaired and unarmed Attacks roll a single d4. A Blast against several targets rolls separately for each, one card apiece. The dialog also asks about the turn, and holds the Attack to the rules for wielding weapons:
  - **Moved this turn** is ticked for you when the Token has moved this turn in combat. A Slow weapon can't be used after moving, and an Exhausted character can't Attack at all.
  - **Began the turn engaged in melee** leaves purely ranged weapons out of the roll.
  - **In a confined space** Impairs an Attack with a Long weapon.
  - A Knight can wield only one Hefty item, and a Long weapon on its own. NPCs aren't held to this, since stat blocks list a creature's attacks without saying how it holds them.
  - **Mounted** is ticked for anybody with a steed. A weapon marked Hefty if mounted, such as the lance, then counts as Hefty rather than Long, so it can go with a shield.
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
- **Roll Scar:** re-rolls the die that caused the Scar, rolls where it landed, applies any Virtue Loss or immediate GD increase, and records the Scar.
- **Recovery:** Rest restores GD and clears Fatigue. Each Virtue has its own restore button next to its recovery method.
- **Remedies:** mark a gear item as a Remedy for a Virtue, and a flask button appears beside it. Using it asks who's present, restores that Virtue to each of them, and uses the Remedy up.
- **Steed:** drag an NPC from the Actors tab onto the Knight sheet to ride it. When its weapons include a trample, the Attack dialog offers a mounted charge that adds the trample dice. A **Dismount** Gambit rolls the d6 being dismounted causes and adds it to the dice; take the Gambit back if the target Saves.
- **Squire:** Take a Squire on the Knight sheet rolls 2d6 for each Virtue and a d6 for their extra equipment, then creates the Squire, with 1GD, a dagger and a pony, beside the Knight in the Actors tab. A Company of more than 2 Knights is asked first. A Squire's sheet has no Glory, Rank or Feats, and a new Age doesn't give them Glory. **Knight this Squire** rolls the d6 they gain in each Virtue and makes them a Knight. Drag a Squire onto a Knight's sheet to link them by hand.
- **Reopen on reload:** Knight, item and journal sheets you had open come back where you left them when you reload Foundry. Turn it off with **Reopen Sheets on Reload** in Configure Settings. It's saved per browser.

### NPCs

The **NPC** sheet is laid out like the stat blocks the book prints for each Myth's Cast and each Seer, for anybody who isn't a player's Knight:

- **Stats:** name and epithet, VIG, CLA and SPI, GD, and Armour with a note on what it is. Saves, Attack, Take Damage and Rest work as they do for Knights.
- **Attacks and gear:** weapons, armour and gear items. Weapons can also be Blast or ignore Armour.
- **Feats:** off by default, since only some of the Cast can perform one. Mark the ones this character can.
- **Warbands:** set the scale to Warband and a Mortal Wound routs them, SPI 0 breaks them and VIG 0 wipes them out. Take Damage asks whether the Attack was Blast or large-scale, since nothing else harms them, and their Attacks on individuals get +d12 and Blast.
- **Leading from the front:** a Warband's Attack dialog lists individuals to lead it: the selected Tokens, your character and the Knights you can see. The leader's worn and wielded Attack dice join the roll. Until the leader's next turn in combat, Damage that gets past the Warband's Armour opens Take Damage for the leader too. The NPC sheet shows who leads the Warband.
- **Structures:** mark an NPC that counts as a structure, and Take Damage asks whether the Attack was fire, a siege weapon or a suitably large creature. Damage wears its GD down without touching VIG, and at 0GD it's destroyed.
- **Morale:** rolls the SPI Save to stand rather than rout or surrender. The Damage card offers the roll when an NPC is Wounded, or when a Warband's VIG falls to half. In combat, once half of an NPC side is down, GMs get a card to roll the group: once on a leader's SPI if organised, or for each member standing. Knights are never asked.
- **Choose from Book:** after Import Book Art, browse the Myths, the Seers and the City Quest, read each Myth's Omens, and create an NPC from any stat block in its Cast, or from a Seer. Use **New NPC** in the Actors tab to make several at once.
- **Paste Stat Block:** paste a stat block as text, such as one copied from your PDF, and the sheet fills in from it.

### Domains

A **Domain** is an actor for a Holding granted to a ruler (Dominion and Authority), made with Create Actor in the Actors tab:

- **The Holding:** its name and picture, whether it's the Seat of Power, and who rules it.
- **Council:** the Steward, Marshal, Sheriff, Envoy and the Circle, with what each seat does.
- **Crises:** the Crises the Domain faces, each with how it's resolved and a button to resolve it. **Add Crisis** gives it one the Referee chooses, such as one a failed task brings.
- **Crisis Roll:** a Calamity adds two Crises, and a Dilemma asks which of two to take. The sheet shows whether it's been rolled this Season. A Crisis rolled that the Domain already faces passes to the next on the list.
- **Misrule:** the sheet warns at 3 unresolved Crises, and turning the Season or Age in the Time window puts every Domain still at 3 or more into misrule.
- **Increased Collections** and **Drama in Court** roll their tables. Drama in Court also rolls the Drama Spark Table when Import Book Art has brought it in.
- **Authority:** how many Warbands the Domain can muster, with reminders of grand designs and succession.

### Referee tools

GMs get five buttons at the top of the Roll Tables tab:

- **Referee Rolls:** roll a d6 on one of the book's quick tables and post the result: the Luck Roll, Passage of Time, Unresolved Situation, Travelling Blind, Dire Weather and Local Mood.
- **Spark Tables:** after Import Book Art, browse the four pages of Spark Tables laid out as the book sets them. The dice button on a table rolls a d12 for each column, posts the two entries as a prompt, and marks them in the window.
- **Time:** the world's calendar of Age, Season, Day and Phase, and what moves it on:
  - **Next Phase** posts the new Phase, with a reminder of what it costs, such as lost sleep each Morning.
  - **Turn the Season** asks which Knights take part, and each picks a pursuit (Pilgrimage, Courtesy or Service). They have their Virtues restored, and a Mutilation Scar settles, raising max GD by d6 if it's 10 or less.
  - **Turn the Age** does the same with Duty, Succession or Legacy, and each Knight also gains 1 Glory. An Old Knight loses d12 VIG, and dies peacefully at 0. The new Age begins in Spring.
  - **Passage of Time** and **Unresolved Situation** roll those tables.
  - **Hardship** takes d6 from a Virtue for everybody ticked: SPI for night travel, CLA for no proper sleep, and VIG for Winter cold or going without supplies.
  - Clicking a Season or Phase, or changing the Age or Day, sets the calendar by hand without any of that. In Winter the Wilderness Roll card reminds the GM of the cold and dire weather.
  - **Glory** awards 1 Glory to each Knight ticked for a Myth resolved, a tournament won or a battle won, and says when a Knight reaches a new Rank. Squires are left out.
- **Myths:** each Myth in a Realm Scene with its six Omens, quoted after Import Book Art, and the ones seen so far marked. **Next Omen** counts one more and shows it to GMs, and **Myth Resolved** awards the Glory. The same window tracks the City Quest: **Roll an Omen of the City** rolls d12 plus those already encountered, skipping duplicates, and says when the Quest ends. The Wilderness Roll card reminds GMs of it on a random Myth's Omen once a player's Knight is Knight-Radiant.
- **Sites:** map a Site the way the book does, with features, dangers and treasure on a hexagon joined by open, closed and hidden routes, and an entrance and hidden entrance. Change the counts or start from the burial complex, and the same seed always draws the same Site. Post the map to chat for GMs, or save it as a Journal entry with a numbered key to fill in.
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
- **Realm Key:** a chat card only GMs see. It lists each Myth with its page, the Holdings, and the Seer at each Sanctum, named from Import Book Art where it has been run.
- **Barriers:** a Token can't move across a Barrier, even one nobody has found yet, or off the edge of the map. Moving around one a hex at a time works. A GM with Foundry's Unconstrained Movement turned on passes through.
- **Hex readout:** on a Realm Scene everybody sees the hex under the pointer named at the top of the screen, with its terrain and whatever they can see in it.
- **Realm tools:** GMs get a Realm group in the scene controls on a Realm Scene.
  - **Inspect hexes:** click a hex to open its panel. It holds the hex's terrain and whatever is in the hex: a Holding's style, name and Seat of Power; a Myth's number, roll and Omens seen; a Landmark's type, name and, for a Sanctum, its Seer. It also has a button to reveal a hidden thing, the hex's six Barriers, and a Wilderness Roll made there.
  - **Paint terrain:** pick a terrain in the palette, then click or drag across hexes. Alt-click a hex to pick up its terrain.
  - **Barriers:** click a hex edge to add or remove a Barrier, and Shift-click to reveal or hide it.
  - **Wilderness Roll:** select the Company's Tokens and press it. A Holding's hex needs no roll, and a Myth's own hex gives its next Omen. Otherwise choose travelling or camping, and the d6 is rolled: a random Myth's Omen, the nearest Myth's, or the hex's Landmark, which is revealed. The Myth's count of Omens seen goes up, and a card only GMs see names the Myth and the Omen, quoting it if Import Book Art has been run.
  - **Tidy the Realm:** snaps icons back to the middle of their hexes, unlocks hidden Tiles, lays the river and Barrier lines again, and lists anything it can't put right.
  - **Reroll the Realm:** rolls a new Realm onto the same Scene. Tokens and anything else on the Scene stay.

The map looks like the Realm Sheets: the terrain, Holdings and Landmarks from the legend of the Blank Realm sheet, traced so they stay sharp however far you zoom, in white hexes ruled in grey. Rivers are inked as the Realm Sheets draw them, and Myths are numbered in the red pen the sheet marks Landmarks in. As on the sheet, a Holding takes the place of its hex's terrain. **Realm Appearance**, under Configure Settings, offers other skins and sets of colours, and takes pictures of your own.

### Art and text from your own book

Beyond the Blank Realm's legend, the system ships none of the book's art or text. A GM who owns the rulebook PDF can bring them in with the **Import Book Art** macro, which is added to the Macro Directory the first time a GM opens a world:

1. Run the macro and choose your copy of the rulebook, the 212-page PDF. It is read in your browser and never uploaded.
2. Every Knight's and Seer's portrait and every Myth's illustration is saved to `mythic-bastionland-art/` in your Foundry data folder, named by roll: `knights/1-01-<name>.webp`, `seers/…` and `myths/…`. An `index.json` beside them lists each picture's roll, page and name, along with text read from your copy: each Knight's Property, Ability and Passion, each Seer's Virtues and traits, each Myth's Omens and Cast, the Spark Tables, and the City Quest's Omens and Cast.
3. When a GM runs it, everything listed in Arms & Goods, People & Realms and Warfare goes into two world compendiums, **Arms & Goods** and **Beasts, Hirelings & Warbands**, each kind in its own folder:
   - weapons (one for each example a line names, so Hefty Weapons gives a spear, a mace and an axe), armour, tools, Remedies and poisons;
   - beasts, hirelings, Warbands, and structures, ships and siege towers, as NPCs.

   Bows, slings and siege artillery are marked ranged, which the book leaves unsaid. Hirelings print only GD, so theirs keep the default Virtues with a note to roll d12+d6. Running the import again replaces what's in both compendiums. Choose Knight and Choose from Book fill characters in from it.

Running the import again replaces the files. It needs a user who is allowed to upload files, and like anything in the data folder, the pictures and the index can be fetched by anyone who can reach your Foundry server.

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
- `module/book-art/` reads a rulebook PDF you own and saves its art and text, for Import Book Art.
- `module/apps/` holds windows other than sheets, such as the Knight and NPC choosers.
- `module/canvas/` holds what runs on the Scene, such as the check that stops Tokens crossing a Realm's Barriers.
- `module/sheets/` and `templates/` hold the sheets.
- `packs/src/` holds the compendium sources.
- `assets/realm/` holds the Realm's pictures, every skin in every colour set, drawn by `node scripts/realm-placeholders.js` from `scripts/lib/realm-drawings.js`. Run it again after changing a skin, a colour set, or the Realm's terrain, Holding or Landmark lists. The Blank Realm skin is drawn from the sheet's legend, traced into `scripts/data/realm-sheet-art.json` by `python scripts/realm-sheet-art.py <Blank Realm PDF>`, which needs PyMuPDF, numpy and potracer. Tracing again is only needed if the sheet changes.
- `assets/heraldry/charges/` holds the heraldry painter's charges and their credits, built by `npm run charges` from the `CHARGES` list in `module/rules/heraldry-charges.js`. It fetches each drawing from the Book of Traceable Heraldic Art once, keeps it in `node_modules/.cache`, and cleans it down to the two colours the painter tints. Pass `-- --refresh` to fetch them again. A new drawing must come from a public-domain source; the tests hold a list of the sources checked so far.

The system id lives only in `module/system-id.js`. Lint rejects the id spelled out anywhere else.

## Credits

- Fonts: [IM Fell English](https://fonts.google.com/specimen/IM+Fell+English) by Igino Marini, [UnifrakturCook](https://fonts.google.com/specimen/UnifrakturCook), and the digits from [EB Garamond](https://fonts.google.com/specimen/EB+Garamond), all under the SIL Open Font License (see `assets/fonts/licenses`).
- Heraldic charges: adapted from the [Book of Traceable Heraldic Art](https://heraldicart.org), digital illustration by Mathghamhain Ua Ruadháin, © 2016–2023 Matthew Simon Ryan Cavalletto, using only drawings after public-domain books. They are shared under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), which covers those drawings only. Each drawing's entry, source, original artist and adapter are listed in `assets/heraldry/charges/CREDITS.md`, and each file carries its own credit.
- Realm terrain, Holdings and Landmarks: traced from the map legend of the free Mythic Bastionland Blank Realm sheet by Chris McDowall, Bastionland Press. Each picture carries the credit.
- Realm icons from [game-icons.net](https://game-icons.net), under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/): the Seat of Power's [Crown](https://game-icons.net/1x1/lorc/crown.html) by Lorc, and the drawn skins' [Castle](https://game-icons.net/1x1/delapouite/castle.html) and [Rempart](https://game-icons.net/1x1/delapouite/rempart.html) by Delapouite and [White Tower](https://game-icons.net/1x1/lorc/white-tower.html) by Lorc. Each picture carries the credit.
- Mythic Bastionland © Chris McDowall, Bastionland Press.
