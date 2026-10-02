# Mythic Bastionland for Foundry VTT

[![Watch the video on YouTube](https://img.youtube.com/vi/R_7xp_46yaM/maxresdefault.jpg)](https://www.youtube.com/watch?v=R_7xp_46yaM)

An unofficial [Foundry VTT](https://foundryvtt.com) system for playing [Mythic Bastionland](https://www.bastionland.com) by Chris McDowall, made with his permission. It is not an official Bastionland Press product.

> **You need the rulebook PDF.** Without a purchased copy of the Mythic Bastionland PDF, this system is practically useless: no Knights, Seers or Myths to choose from, no Spark Tables, no portraits and no compendiums, just empty sheets and a blank map. [Buy the book](https://bastionlandpress.com/collections/all), then import your PDF with the **Import PDF** macro or the Welcome window.

It ships none of the book's text, and none of its art beyond the free Blank Realm sheet's map legend. The rules it shows in the book's own words, and everything else from the book, are read from your own copy of the PDF (see [Art and text from your own book](#art-and-text-from-your-own-book)).

## 🤖 Created in collaboration with AI to facilitate rapid development. Absolutely no image generation was or will be used.

## Features

Everything below is built into the system. No extra modules required.

### For Players

#### The Knight Sheet

Laid out after the official printed sheet: Virtues and Guard, Glory, Age and Rank, Conditions, Property, Ability, Passion, Scars and Feats. Click a Virtue to roll a Save. Rank follows from Glory, and conditions such as Exhausted or Impaired follow from the Virtues. Side tabs hold the Knight's **Property, Steed and Squire**, the **Seer** who knighted them, the **Chronicle**, and your own **Settings** (text size, contrast, typeface, reduced motion).

Hover a rule word such as Exposed, Hefty or Gambit, or a heading such as Glory or Passion, to see what the book says about it, once your PDF is imported. The title bar has a **Ledger** of every change made to the Knight, and a **Domain** button for Knights who rule one.

#### Making a Knight

**New Knight** makes a Knight the way the book does. Pick a Start, roll Virtues and GD, then roll for one of the 72 Knights or pick one yourself. Name them, or roll a name. Applying fills in the whole sheet: portrait, Seer, Property, Ability, Passion, the Knight's d6 table and the kit every Knight carries.

Players can make their own Knights. A GM can also make blank Knights ahead of time and hand each one to a player, who chooses the Knight when they open it. **Take a Squire** and **Take a Steed** add the rest of the retinue. **Knight this Squire** promotes a Squire who has earned it.

#### Heraldry

Click the shield to paint it with heraldry's tinctures and divisions. **Add a charge** offers 215 lions, towers, wyverns, crosses and more, drawn after public-domain heraldry books. **Randomize** paints a whole coat of arms and follows the rule of tincture. Every charge, picture and painting, and the arms' field, sits on a layer of its own, listed under the shield, to bring forward, send back, move or remove later. A Knight's Token wears their shield.

#### Combat

**Attack** rolls every weapon, shield and bonus die together, and holds the roll to the rules for wielding: Hefty and Long weapons, Slow weapons after moving, fighting mounted, specialist weapons, confined spaces. The chat card then walks through the book's steps:

- **Deny:** discard a die after an SPI Save.
- **Gambits:** spend a die of 4+ (or use Focus), with a VIG Save for the foe. Impair, Stop and Trap stay on the foe until they lapse by turn order.
- **Apply Damage:** Armour, then GD, then VIG, then any Scars. A Knight who falls gets **A Knight Falls**, so their player can carry on with a new Knight, their Squire or a follower.

**Duel** runs a duel or a joust, with Glory staked if the fighters choose. Both Attacks resolve at the same time.

#### Property

Weapons, armour and gear sort themselves by die and by armour piece. Worn armour adds up to the Armour score, one piece of each type. Items can have a rarity, a count, a restock, a **Broken** mark, armour that only counts in some situations, bucklers, wooden weapons, a second way to fight, poisons, and Remedies that restore a Virtue.

### For Game Masters

#### GM Toolkit

Every world gets one **GM Toolkit**, the Referee's own sheet. Press **C** to open it, or use the first slot on the hotbar.

- **Myths and Omens:** each Myth of the Realm on one row, with Omens counted as they're met, its Cast ready to drop into the world, and its d6 table with a roll button. **Myth Resolved** awards the Glory and rolls the Myth that replaces it. The City Quest is kept here too.
- **Places:** every hex the Company has visited and every place in the Realm, each with its visits, notes and Spark Table rolls, plus the Sites you've made. You can search them. **Random Page Prompt** opens a random spread and the prompts along its foot (p19, p179): click the ones you'll use, then **Save to hex** and click a hex on the map to keep them there.
- **Time:** the current Season, its events, the Crisis Rolls owed, Glory, and a log of past Seasons.
- **Notes**, and the Referee's settings.

#### Time and the Calendar

The Phase, Season and Age sit in a bar at the top of the screen. The GM's buttons move time on: **Next Phase**, **Weeks Pass** (each Season's feast, mass and Tax, Tithe or Levy), **Turn the Season** with its pursuits, and **Turn the Age** with Duty, Succession or Legacy, ageing and Glory. **End the Session** walks through the book's end-of-session steps and keeps the recap with that Season.

#### The Realm

**New Realm**, at the top of the Scenes tab, rolls a Realm onto a Scene the way the book's Creating a Realm page does: terrain, a river, four Holdings, six Myths, Landmarks and Barriers. The same seed always gives the same map. Reroll until you like it, then keep it. You can also:

- **Draw it yourself**, one step at a time, with the book's instructions beside the map.
- **Import a map** drawn on paper, scanned or photographed, and line the hexes up over it. A painted map with no hexes on it works too: the Realm lays its own over it, as many as the map's shape takes.
- Untick any part of the setup to draw it by hand, or ignore the rules and set your own counts.

When a new world's GM closes the Welcome window, a short Foundry Tour points them to the Scenes tab and New Realm. They can play it again from **Tour Management** in the Settings tab.

Players see the terrain, the river and the Holdings. Myths, Landmarks and Barriers stay hidden until revealed, and Tokens can't walk through a Barrier. One **Company** Token stands for the whole party. The **Travel** and **Rest and Exploration** rules sit on either side of the map, with GM buttons for the Wilderness Roll, weather, hardships, gathering folklore, searching and looking from a vantage point. When the Company reaches a new hex, **The Lay of the Land** opens with what's known about it and keeps the Spark Table rolls made there. The first time the Company rests in a Wilderness hex with nothing kept in it, its land and one feature are rolled on the Nature tables and kept, so it's the same place when they come back (the **Roll a new hex's land** setting turns this off).

Players keep their own record of the Realm. A dashed line marks every hex the Company has been to, and anyone can hide the marks for themselves with the footprints among the Token tools or on the Settings page. Double-click a hex, or open **Places** from the Token tools, the players' hotbar or the Knight sheet's **Travels** page, to see what the Company knows of it:

- what stands there that they've found, and when they were there
- what the GM told them with **Tell the players**, kept as it was said
- a note any player can write for the whole table (a GM has to be online to save it)

Nothing they haven't found shows, and none of the GM's own notes or Spark Table rolls. A GM sees the same pages as the players do. What the players were told and their note live in the Scene, so like everything else on it they reach every browser.

Each hex the GM rolls or writes something for also gets a markdown **Journal entry**, filed in a folder for its Realm and kept up to date as the hex changes. It has three pages:

- **Rolled**, for GMs only: everything kept for the hex
- **What the Company Knows**, the same page the players' Places shows
- **Notes**, which belongs to the GM and is never written over

Players can open the entry once they could open the hex in their Places, and they see only the Company's page. The Lay of the Land and the GM Toolkit's hex cards have a **Journal** button that opens it. Turn the entries off with **Journal entries for hexes** in the settings. The entries carry the Spark Table words read from the GM's own book into the world's Journal, which stays in the world and never in this repository.

The map looks like the Realm Sheets, traced from the Blank Realm legend. **Realm Appearance** offers other skins, colour sets and your own pictures.

#### Sites

**New Site** makes a Journal entry with a map drawn the way the book describes Sites. Mark features, dangers, treasure and routes on a hexagon, roll whatever you haven't drawn, and reveal the Site to players as they explore it.

#### NPCs, Structures and Domains

- **NPC** sheets are laid out like the book's stat blocks. They cover Warbands with their scale, upkeep and a leader fighting from the front, plus Morale and Reaction rolls. **Paste Stat Block** fills one in from text copied out of your PDF.
- **Structure** sheets are for ships, walls, gates and siege engines, with their own Damage, repairs and collisions.
- **Domain** sheets are for a ruler's Holding: Council seats and their tasks, the Court, Crises and the Crisis Roll, misrule, mustering Warbands, succession and conquest.

#### Referee Tools

Buttons in the Roll Tables tab roll the book's quick tables (the Luck Roll, Passage of Time, Travelling Blind, Dire Weather and more) and open the **Spark Tables**. Each GM's hotbar gets the Toolkit, the Rulebook, End the Session, New Site and the Luck Roll.

### Art and text from your own book

None of Chris McDowall's text ships with the system, and of his art only the free Blank Realm sheet's legend does. If you own the rulebook PDF, the **Import PDF** macro (or the **Welcome** window a new world opens with) reads your copy, locally in your browser, and brings in:

- the book's own words for the rules the system shows: Travel and Exploration beside the map, the Knighthood page, the rule word tips, the Scars, the seasonal events, and the Council and Court. Until then each shows the system's own short line or nothing, with the page to read;
- every Knight's and Seer's portrait and every Myth's illustration;
- each Knight's verse, Property, Ability, Passion and table, each Seer's traits, each Myth's Omens, Cast and table, the Spark Tables and the City Quest;
- **Arms & Goods** and **Beasts, Hirelings & Warbands** compendiums;
- an **NPCs** compendium of Seers, Myth Casts and the City Quest Cast, visible to GMs only.

Nothing is uploaded anywhere. The pictures and text are saved under `mythic-bastionland-art/` in your own Foundry data folder, never in the system folder. Anyone who can reach your Foundry server can fetch files from that folder.

The same PDF can be opened in Foundry as a **Rulebook** reader, bound to the **B** key. Every page number in the system's windows and chat cards, such as "(p16)", opens the book at that page, and a GM can show a page to the table.

---

## Prerequisites

- Foundry VTT v13 or v14
- A purchased copy of the Mythic Bastionland PDF. The system does very little without it.

## Installation

In Foundry VTT, go to **Game Systems -> Install System** and paste this manifest URL:

```
https://github.com/PrinceWitherdick/mythic-bastionland-pwd/releases/latest/download/system.json
```

That is all you need. Install it and start a world. Foundry's **Update** button picks up each new release from the same URL.

## Recommended Modules

- **[Dice So Nice!](https://foundryvtt.com/packages/dice-so-nice)** rolls the dice on the table in 3D. Every roll in the system uses Foundry's dice, so there's nothing to set up.
- **[Sequencer](https://foundryvtt.com/packages/sequencer)** and **[JB2A](https://foundryvtt.com/packages/JB2A_DnD5e)** animate Attacks on the map: swords swing, arrows fly, and blood marks whoever loses VIG. Each animation is picked from the weapon's name. The free JB2A is enough.
- **[SoundFx Library](https://foundryvtt.com/packages/soundfxlibrary)** adds sound to those Attacks, with or without Sequencer.
- **[FXMaster](https://foundryvtt.com/packages/fxmaster)** draws the weather on the players' Scene: the day's Sky and Weather roll sets it each morning, and the GM can pick another from the Toolkit. The weather picker can take it off the map for a while, and the Settings tab can switch single parts of it off, such as the hail or the storm's grey light.
- **[Tokenizer](https://foundryvtt.com/packages/vtta-tokenizer)** makes round map tokens from Knight and NPC portraits, with a frame and a background of your choosing.

The Attack effects are one world setting, **Attack Effects on the Map**, which is on by default and does nothing when these modules aren't installed. Anyone with **Reduce Motion** turned on hears the sounds but sees no animation.

## Development

Clone the repository into your Foundry data folder's `systems` directory:

```sh
git clone https://github.com/PrinceWitherdick/mythic-bastionland-pwd.git "<Foundry data>/Data/systems/mythic-bastionland-pwd"
```

```sh
npm install
npm test          # rules, templates, and localization keys
npm run lint
npm run build     # release bundle, dist/mythic-bastionland.js
npm run pack      # compile packs/src into LevelDB packs (with Foundry closed)
npm run unpack    # extract packs back to packs/src
```

A checkout runs straight from the source files. A release runs from the single bundled file. Game arithmetic lives in `module/rules/` as plain functions with no Foundry dependency, so all of it is unit tested. The system id is defined only in `module/system-id.js`.

No words of the book belong in the repository, code comments and tests included. A passage the system shows in the book's words is added to `module/rules/book-prints.js` as a page and fingerprint with `node scripts/book-text.js print`, and `node scripts/book-text.js overlap` checks, against your own PDFs, that nothing else has crept in. Both take Foundry's copy of pdf.js through `PDFJS` (see the top of `scripts/book-text.js`).

## Credits

- **Mythic Bastionland** © Chris McDowall, [Bastionland Press](https://www.bastionland.com). The Realm's terrain, Holdings and Landmarks are traced from the free Blank Realm sheet's map legend. The rules shown in the book's words are read from your own copy.
- **Fonts:** [IM Fell English](https://fonts.google.com/specimen/IM+Fell+English), [UnifrakturCook](https://fonts.google.com/specimen/UnifrakturCook), [EB Garamond](https://fonts.google.com/specimen/EB+Garamond) and [Pirata One](https://fonts.google.com/specimen/Pirata+One), under the SIL Open Font License (`assets/fonts/licenses`).
- **Heraldic charges and the Armorial Realm skin** are adapted from the [Book of Traceable Heraldic Art](https://heraldicart.org), digital illustration by Mathghamhain Ua Ruadháin, © 2016–2023 Matthew Simon Ryan Cavalletto. Only drawings after public-domain books are used. They're shared under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), which covers those drawings and the pictures made from them (`assets/heraldry/charges/`, `assets/realm/armorial/` and each skin's `seat.svg`). Per-drawing credits are in [assets/heraldry/charges/CREDITS.md](assets/heraldry/charges/CREDITS.md) and in each file.
- **Icons** from [game-icons.net](https://game-icons.net) by Delapouite, Lorc, Skoll, Caro Asercion, Carl Olsen, Cathelineau, HeavenlyDog, Lucas and sbed, under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), recoloured. They're used for goods, macros, Company Tokens, the Realm's towns and castles, the GM Toolkit and the Squire. Each picture carries its credit, and the lists are in [goods](assets/icons/goods/CREDITS.md), [macro](assets/icons/macros/CREDITS.md) and [Company](assets/icons/company/CREDITS.md) CREDITS.md files.

## Licence

This project's code and text are under the [MIT License](LICENSE). That licence doesn't cover the Mythic Bastionland name, the traced Blank Realm art, or the fonts, heraldry and icons listed above, which keep their own terms. [LICENSE](LICENSE) sets out exactly what's excluded.

## Copyright

Mythic Bastionland, its text, art and trade dress are © Chris McDowall, Bastionland Press. All rights reserved. They're used here with his permission, and only as far as described above. They aren't covered by any licence this project grants.

This is an unofficial, fan-made system, made with Chris McDowall's permission. It is not an official Bastionland Press product. To play, you'll want a copy of [the book](https://bastionlandpress.com/collections/all).

## AI Training and Data Mining

The maintainers ask that this project and its release artifacts not be used to train, fine-tune, or evaluate AI models, or be included in datasets built for those purposes. This is a request and doesn't limit what the [MIT License](LICENSE) permits. See the [AI Training and Data-Mining Notice](AI-TRAINING-NOTICE.md), with machine-readable signals in [`ai.txt`](ai.txt), [`.well-known/tdmrep.json`](.well-known/tdmrep.json), and [`robots.txt`](robots.txt).
