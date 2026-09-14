# Mythic Bastionland for Foundry VTT

An unofficial Foundry VTT system for [Mythic Bastionland](https://www.bastionland.com) by Chris McDowall. It is not affiliated with Bastionland Press, and it ships none of the book's text beyond the short rules reminders printed on the free character sheet.

Requires Foundry VTT v14.

## What's here

The first milestone is the **Knight** character sheet, laid out after the official printed sheet:

- **Identity:** name, "Known as the ___ Knight", the Seer who knighted them, their ultimate fate, and heraldry shown in the shield.
- **Virtues and Guard:** VIG, CLA and SPI with current and maximum values, capped at 0–19. Click a Virtue to roll a Save (d20 equal or under).
- **Glory, Age and Rank:** Rank is worked out from Glory (0 / 3 / 6 / 9 / 12), and the sheet shows how far off the next Rank is.
- **Conditions:** Fatigued, Exposed and Mortal Wound are marked by hand. Exhausted (VIG 0), Impaired (SPI 0) and Exposed from CLA 0 follow from the Virtues.
- **Property, Ability, Passion and Scars:** stored as items, created on the sheet or dragged on. Worn armour adds up to the Knight's Armour.
- **Feats:** Smite, Focus and Deny roll their Save and mark Fatigue on a failure. A Fatigued Knight can't use them.
- **Attack:** pick weapons and shields, add bonus dice or Smite, then roll everything together. The chat card shows the highest die and which dice can pay for Gambits and Strong Gambits. Impaired and unarmed Attacks roll a single d4.
- **Take Damage:** applies Armour, then GD, then VIG, and reports Evade, Scar, Wound, Mortal Wound or Slain.
- **Roll Scar:** re-rolls the die that caused the Scar, rolls where it landed, applies any Virtue Loss or immediate GD increase, and records the Scar.
- **Recovery:** Rest restores GD and clears Fatigue. Each Virtue has its own restore button next to its recovery method.

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

The layout:

- `module/rules/` holds the game arithmetic as plain functions with no Foundry dependency, so all of it is unit tested.
- `module/actions/` connects those rules to Foundry through dialogs, actor updates and chat cards.
- `module/sheets/` and `templates/` hold the sheets.

The system id lives only in `module/system-id.js`. Lint rejects the id spelled out anywhere else.

## Credits

- Fonts: [IM Fell English](https://fonts.google.com/specimen/IM+Fell+English) by Igino Marini, [UnifrakturCook](https://fonts.google.com/specimen/UnifrakturCook), and the digits from [EB Garamond](https://fonts.google.com/specimen/EB+Garamond), all under the SIL Open Font License (see `assets/fonts/licenses`).
- Mythic Bastionland © Chris McDowall, Bastionland Press.
