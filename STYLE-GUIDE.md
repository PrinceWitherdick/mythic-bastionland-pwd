# Style guide

How the system's sheets, windows, dialogs and chat cards should look and read. The **Knight sheet** is the reference: when this guide is silent, do what the Knight sheet does (`templates/actor/knight-sheet.hbs`, styled in `styles/mythic-bastionland.css`).

Each rule is tagged with where it comes from:

- **[Owner]**: the project owner's stated rule. Not up for restyling.
- **[Knight]**: how the Knight sheet does it today.
- **[Open]**: the Knight sheet doesn't settle it and the project does it more than one way. The commonest practice is recorded here until the owner decides.

## 1. The idea

A sheet is a page of the printed book, not an app.

- Parchment, ink, and the red ochre a scribe headed a section with. **[Knight]**
- Blocks are not boxed. Space parts them, and a heading with its hairline opens each one. A rule standing alone between paragraphs is a printer's habit; the line hangs off the heading instead. **[Knight]**
- Lists that read as prose (Abilities, Scars) have no lines between rows. Stock lists (Property) are striped like a ledger. **[Knight]**
- Controls look like writing where they can: a dashed blank to fill in, a circled choice, a line of small caps between two hairlines. A solid button is for a one-off action that isn't part of the page's text. **[Knight]**
- The sheets paint their own parchment, so they look the same in Foundry's light and dark themes. **[Knight]**

## 2. Tokens

All colours, faces and the two small sizes are custom properties on `:root` in `styles/mythic-bastionland.css`. The Colour Scheme and Contrast settings redefine them in `styles/settings.css`.

| Token | Parchment value | Use it for |
|---|---|---|
| `--bastionland-paper` | `#efe8d8` | The page |
| `--bastionland-paper-deep` | `#e3d9c3` | A raised surface: a button's fill, a focused blank, an icon's hover disc |
| `--bastionland-ink` | `#231f1a` | Text; the border of a button or a score box |
| `--bastionland-ink-soft` | `#5a5046` | Hints, tags, empty states, icons at rest |
| `--bastionland-ink-faint` | `#a39680` | Placeholder writing only. It has no contrast floor, so never use it for words that must be read |
| `--bastionland-rule` | `#8a7d6a` | Dashed and dotted lines, input borders, dividers |
| `--bastionland-rubric` | `#9a3520` | Headings, their hairlines, action icons, a pointed-at word |
| `--bastionland-blood` | `#8b1e1e` | What is on or due: an active condition, the open tab, a die that is due |
| `--bastionland-verdigris` | `#2f6150` | Keyboard focus; a Feat or Gambit row under the pointer |
| `--bastionland-spring`, `-harvest`, `-winter` | | A Season's own colour |

Rules:

- **No raw colour outside a token definition.** No hex, no `rgb()` of a colour a token already holds, and no `var(--bastionland-x, #fallback)`. **[Knight]**, guarded by `tests/styles/colour-schemes.test.js`.
- **Shade and light go through the scheme.** A darkening wash is `rgb(var(--bastionland-shade-rgb) / a)`; a pale well is `rgb(var(--bastionland-sheen-rgb) / calc(a * var(--bastionland-sheen)))`. Never raw black or white, and never `color-mix()` with them, or a dark scheme gets it backwards. **[Knight]**, guarded.
- **Fade text with `--bastionland-ink-soft`, never with `opacity`.** Faded ink fell below the contrast floor on parchment. Opacity is for glyphs and for a whole row that is switched off. **[Owner]**
- The page's highlight is `--bastionland-page-sheen`; use the token, don't retype the gradient. **[Knight]**
- **A shadow comes from one of two tokens**: `--bastionland-lift` under a panel or button held over the map, `--bastionland-float` under a list or preview that drops over a window. A shadow is dark on any paper, so these are the one place raw black is right. **[Owner]**, guarded by `tests/styles/style-guide.test.js`.
- A local custom property is fine for a value one component computes (`--pill-pad`, `--bastionland-narrow-order`). A second name for a shared colour is not.

## 3. Type

Three faces, each a token:

| Token | Face | Use it for |
|---|---|---|
| `--bastionland-font-display` | UnifrakturCook (its `k` from Pirata One) | A title: the Knight's name, a card's title, a window's main heading |
| `--bastionland-font-body` | IM Fell English | Everything read as text; numbers in boxes |
| `--bastionland-font-caps` | IM Fell English SC | Headings, buttons, labels, names set as small caps |

Never name a font family directly; the Typeface setting swaps the tokens. Digits come from EB Garamond through `unicode-range`, and a new face must be declared in both the CSS and `module/fonts.js` (`tests/assets.test.js`).

Sizes, as the Knight sheet uses them **[Knight]**:

| Size | For |
|---|---|
| `2.3rem` | The title: a sheet's name, in the Display face. **[Owner]** An Item's window is narrow, so its name is `1.8rem` |
| `1.7rem` | A score and its abbreviation |
| `1.35rem` | A section heading |
| `1.15rem` | A line to fill in and its italic label |
| `1.05rem` | A small heading; an item's name; an action in the action line |
| `1rem` | A button |
| `0.95rem` | A dense list: conditions, Recovery, Feats and Gambits |
| `var(--bastionland-font-text)`, 15px | Body text: what a page, a dialog and a chat card set their words in |
| `var(--bastionland-font-note)`, 15px | A hint, note, caption, empty state |
| `var(--bastionland-font-floor)`, 14px | Words inside tight furniture only |

Rules:

- **Nothing anyone reads is under 14px, and small print is 15px.** A hint is set apart by italic and soft ink, not by being shrunk. The 14px floor is for a die chip, a numbered disc, a tally, a tab, a window-header button. Glyphs are exempt. Use the three size tokens, never a literal `15px` or `14px`. **[Owner]**, guarded by `tests/styles/text-size.test.js` and `tests/styles/style-guide.test.js`.
- **A hint is italic**, on a sheet, in a dialog and on a card alike. **[Owner]**
- **No text shadow anywhere**, canvas text included. **[Owner]**
- **No placeholder is bold.** **[Owner]**
- **No button or chip label all in capitals in the Caps face.** Its line box centres on its small capitals, so capitals alone sit 0.125em high against whatever they are centred on. Write the label in mixed case and let the face draw the small caps. A heading set in capitals on a line of its own is fine (section headings, a dialog's headings and legends, a Feat's name); where a hairline or an icon sits beside one, that mark carries the nudge, as the section heading's hairline does. **[Owner]**
- IM Fell has no bold; the browser fakes one. **Bold is for the lead words of a name, a score's abbreviation, the result just rolled and the chosen row. Never a heading.** **[Owner]**
- Small capitals come from the Caps face, not from `font-variant: small-caps` on the body face, which the browser fakes by shrinking capitals. **[Knight]**, guarded.
- Italic marks a script label, a hint, an empty state, a derived value. The No Italic Text setting removes it, so italic must never be the only thing telling two things apart.
- Letter-spacing on Caps text: `0.05em` on a heading, `0.03em` to `0.04em` on a name or label. **[Open]**

## 4. Headings

Use `.bastionland-heading` for every section heading: rubric, Caps face, `1.35rem`, with a 1px hairline (`::after`) running out to the margin. `.bastionland-heading--small` is the same at `1.05rem`. **[Knight]**

- A heading that shares its line with something else (an Armour badge, a count) goes in a `.bastionland-block__header`, and the hairline runs up to its neighbour.
- A heading that shares its line with a control, or already heads a ruled row, keeps the rubric and drops the hairline. Add its parent to the `:is()` list beside the heading rule; don't write a new modifier.
- Headings inside rich text take the same hand through the editor rules; don't restyle them per window.
- A title in the Display face is one per page or card. Everything under it is a `.bastionland-heading`; a chat card's sections take the small one.
- A few headings keep a rule of their own because they do more than head a section, and each is drawn to match: the Travel panel's folding heads (they hold a page number), the Timeline's Age and Season heads (part of its board), the Ledger's dates and a rail dialog's banner title (each with a mark beside it that carries its own nudge).

## 5. Surfaces

- **The page** is `.bastionland-page`: padding `1.25rem 1.5rem 1.5rem`, a `1rem` gap between its rows, the sheen over the paper, body face at 15px, line-height 1.35. A new window's content takes this class instead of painting its own. **[Knight]**
- **Blocks have no frame.** Columns are `1.6rem` apart down the page and `2rem` across. **[Knight]**
- **A boxed well** (a rich text box, a dialog's fieldset, code) is a 1px `--bastionland-rule` border, `3px` radius, and a sheen fill. **[Knight]**
- **Radii** **[Owner]**: `3px` for anything on the page (a button, a box, a card, a framed picture, a square chip); `6px` for a panel that floats over the map; `999px` for a pill; `50%` for a disc; `2px` for a striped row; `0.6rem` for a score box alone. Never Foundry's `4px` (guarded). The tab rail and the time banner hanging from the top of the screen keep their own larger corners.
- **Shadows.** Nothing lying on the page casts one; set `box-shadow: none` on anything Foundry would shade. Only what floats has a shadow, from `--bastionland-lift` or `--bastionland-float`. The tab rail throws its own to the side it hangs from. **[Owner]**
- **Stripes.** Every other row of a stock list or a table takes `color-mix(in srgb, var(--bastionland-ink) 6%, transparent)`. A stock list is `.bastionland-items--zebra`: `padding: 0.2rem 0.35rem` and no gap between rows. **[Owner]**
- **Dividers.** A hairline is `1px solid var(--bastionland-rule)`; a line to write on is `1px dashed`. A dotted line between rows is a divider and is fine.

## 6. Controls

**Solid button** (`.bastionland-button`, or any button in a `.bastionland-toolbar`): `2.1rem` high, `0 0.75rem` padding, 1px ink border, `3px` radius, `--bastionland-paper-deep` fill, Caps face at `1rem`, icon and label `0.4rem` apart. Hover fills it with ink and turns the words to paper. Disabled is `opacity: 0.5`. **[Knight]**

- A shared button is `flex: 1 1 8rem`. Placed straight in a flex column, that basis becomes its height, so give it `flex: none` there.
- A `<button>` with no class of its own still takes the Caps face at `1rem` and a `3px` corner, from one rule with no specificity near the top of `mythic-bastionland.css`; without it Foundry draws a plain button in its own sans face at 14px. It stays Foundry's 28px tall. Give a button `.bastionland-button` when it should be the full solid button.

**Action line** (`.bastionland-toolbar--actions`): a sheet's actions in play, read as a line of the page. Small caps at `1.05rem` between two hairlines, rubric icons, a rubric lozenge between entries, no boxes. Hover reddens the entry and underlines its words. **[Knight]**

- One-off setup actions (Domain, Knight a Squire) go in the window's title bar as header buttons, not in the action line. **[Knight]**

**Quiet add** (`.bastionland-add`): a text button under a list, soft ink at note size, ink and an underline on hover. **Add a row** (`.bastionland-button--add`): a dashed bar the full width of the section. Neither is a solid button. **[Knight]**

**Icon button** (`.bastionland-icon`): a `1.5rem` disc round a `0.875rem` glyph, which is 24px round 14px. Soft ink at rest; `--bastionland-paper-deep` disc and ink on hover. Every badge that centres a glyph or a figure is sized in whole pixels the same way, with at least 8px of disc round the glyph. **[Knight]**, guarded by `tests/styles/icon-centre.test.js`.

**Fields.**

- A line to fill in is `.bastionland-blank`: no box, a dashed underline, body face at `1.15rem`. Focus turns the line solid and lays `--bastionland-paper-deep` behind it. **[Knight]**
- A number that matters is a `.bastionland-box`: 3px ink border for the current value, 2px dotted rule for the maximum (`--max`). **[Knight]**
- Native inputs, selects, tick boxes and buttons are coloured through Foundry's own variables, already remapped inside `.bastionland-page` and `.bastionland-dialog`. Don't restyle a field per window. **[Knight]**
- Every `<select>` in a system window drops the parchment list (`module/apps/dropdown.js`). The pointed-at row takes `--bastionland-paper-deep` and rubric, not a bar of another colour. **[Knight]**
- **A die that fills a field sits at the field's right end, on the same line**, inside the same `.form-fields`. The general rule already handles it; no per-window fix. **[Owner]**
- **No text box whose words are thrown away.** A dialog asks for text only if it is stored and read again. **[Owner]**

**Focus.** A keyboard's focus is `outline: 2px solid var(--bastionland-verdigris)` with `outline-offset: 2px`. **A click never leaves a ring or a glow.** Don't add focus outlines of your own. **[Owner]**

**Hover.** What a hover does says what the thing is:

| Thing | Hover |
|---|---|
| Solid button | Fills with ink |
| A clickable word, with its icon | Turns `--bastionland-blood`; no line or box at rest |
| A choice pill | Circled in the rule colour; in ink once chosen |
| An item's name; a quiet add | Underlines |
| A Feat or Gambit row | Turns verdigris |
| An icon button | Gets its disc |

- **Only a page number has a dotted underline.** No other clickable thing gets one, and no plain word gets a box round it on hover. **[Owner]**
- **The red a pointed-at word turns is blood, everywhere.** Rubric is a resting colour: a heading, its hairline, an action's icon. **[Owner]**, guarded.

**Tools that wait.** A row's tools (the pencil, a remove cross) are hidden until the row is hovered or holds focus: the tools take `.bastionland-reveal`, the row `.bastionland-reveal-host`. They fade in over `120ms`, and always show on a touch screen. **The pencil is never faint at rest.** **[Owner]** A glyph that hints at a roll (the d20 on a Save) may rest at `opacity: 0.4` and come up to 1.

## 7. Pills

Anything pill-shaped that holds words carries **`bastionland-pill`** and sets only **`--pill-pad`** (the padding it would have on paper; the default is `0.3em`). The shared rules trim the line box to the letters and round the height to whole screen pixels, so the words sit dead centre at every zoom. **[Knight]**

- **A pill is never a flex or grid box.** The trim only works on a block. A `<button>` pill is made `inline-block` by the shared rule, so its own rule must not set `display`. Guarded by `tests/styles/icon-centre.test.js`.
- Text in the Caps face adds `bastionland-pill--small-caps`.
- A pill writes its block padding and border width through the shared sums, falling back to what it has untrimmed, as the Knight sheet's conditions do: `padding: var(--pill-padding-top, 0.0625rem) 0.6rem var(--pill-padding-bottom, 0.0625rem)` and `border: var(--pill-border, 1px) ...`. Never a fixed block padding, and don't copy the `@supports` blocks.
- A pill is pill-shaped: `border-radius: 999px`. A square chip (`3px`) marks what a hex is, its terrain, a feature or one of its Cast; it carries the pill class for its centring.
- A pill-shaped control that lays a swatch, a picture or a tally beside its label stays a flex box and trims its label instead, as the Site map's chips do.
- States: dashed rule border and soft ink at rest; blood fill with paper text when on (`.is-active`); italic with a help cursor when derived. A choice is circled in ink when chosen. **[Knight]**

## 8. Lists and rows

- A list laid out as a row spaces its entries with `gap`, and its `ul`/`ol` is named in the shared rule that zeroes Foundry's `li` margin (top of `mythic-bastionland.css`). Guarded.
- A row of name and tools is a baseline flex with a `0.35rem` gap; tools sit at the far end with `margin-left: auto`.
- An item's name never breaks; its gloss starts beside it and wraps like prose. **Only the lead words are bold**, up to the first " (" or ", ". **[Owner]**
- Tags and counts are soft ink. A row that can't be used fades to `opacity: 0.5`, but its tools don't.
- An empty list says so with `.bastionland-empty`: soft, italic, note size.
- **Choosing one of many is a radio list** (`.bastionland-choice-list`) with one OK button: the name in bold, an optional detail line under it. Never a button per option. **[Owner]**

## 9. Icons

- Font Awesome **solid** only, but for the empty circle and the empty box, whose outline is what they say. Every `<i>` is `inert`, unless it carries a tooltip of its own. Guarded by `tests/styles/style-guide.test.js`.
- A custom drawing is a mask over `currentColor` (`.bastionland-glyph`), so it takes the ink it sits in.
- Colour: soft ink at rest, ink on hover; rubric in the action line; paper on blood in the open tab.
- Beside words, an icon sits in an inline-flex row with `align-items: center` and a `0.4rem` gap.
- Hotbar macros wear a white drawing on a square ink tile, no disc (`tests/assets.test.js`). **[Owner]**
- Tokens stay square. **[Owner]**

## 10. Spacing and motion

Spacing is in `rem`, from a short set **[Knight]**: `0.1`, `0.2`, `0.3`/`0.35`, `0.4`, `0.5`/`0.55`, `0.9`/`1`, `1.6`. Tight things (a row's parts) take `0.3` to `0.4rem`; a list's rows `0.2` to `0.55rem`; blocks `1.6rem`. Reach for a neighbour's value before inventing one.

Motion:

- A reveal or a hover fade is `120ms`. **[Knight]** Longer times are in use for a card landing or a panel sliding. **[Open]**
- A button fades only what a hover or focus changes (colour, background, border, outline, shadow). Don't set `transition: all`.
- Anything that moves or pulses must stop under Reduce Motion (`styles/settings.css`).

## 11. The tab rail

A sheet with pages uses the shared icon rail (`templates/actor/tab-rail.hbs`, `module/sheets/tab-rail.js`), hung outside the window's right edge. One rule serves the Knight, NPC, Domain and Toolkit. The open tab is a blood square with a paper glyph; a pointed-at one takes a faint wash of the rule colour (`color-mix(in srgb, var(--bastionland-rule) 22%, transparent)`). Chronicle comes last, then Settings. **[Owner]** for the order.

- **A rail's open page is filled in blood**, whether the rail is icons or words: the sheet rail, a rail dialog, the Knighthood guide, a journal's list of pages. **[Owner]**
- **A pressed toggle, or the chosen one of a segmented pair, is filled in ink.** **[Owner]**
- Verdigris is for the keyboard's focus. The heraldry painter and the Realm palette still mark a choice with it. **[Open]**
- Tabs across the top of a pane (a hex's panes, the Places views) are drawn two other ways. **[Open]**

## 12. Dialogs and chat cards

**Dialogs.**

- Every dialog carries `bastionland-dialog`, and its template opens with `<div class="bastionland-dialog__body">`. Open one through `parchment()` in `module/apps/ui.js`. Guarded by `tests/apps/dialog-style.test.js`.
- The frame and title bar stay Foundry's. Everything inside is parchment.
- Every window and dialog is resizable (`tests/apps/resizable-windows.test.js`).
- A new end-of-Phase question goes in the Phase end window, not a new pop-up. **[Owner]**
- Foundry's own File Picker, Settings and image popout are left as Foundry draws them. **[Owner]**

**Chat cards.**

- A card's template opens with an element carrying `bastionland-card`; the message itself takes the card's paper, so the colour fills the box. Guarded by `tests/styles/card-fill.test.js`.
- One title in the Display face at `1.5rem`, a hairline under the header, body at 15px.
- No `svg`, `canvas` or `path` in a card: the server strips them. Dice are drawn by the `die-face` partial with a CSS mask (`tests/styles/chat-dice.test.js`).
- A card painted in a Phase's or Season's colours sets its own paper, ink, soft ink and rule, and takes parchment's other inks.

## 13. Schemes and Foundry's dark theme

- Use tokens and a scheme costs nothing. Every scheme must define all twelve colours and meet the contrast floors in `tests/styles/colour-schemes.test.js`.
- **A new surface that paints its own parchment** must join three lists in `mythic-bastionland.css`: the window classes whose `.window-content` is pinned to paper, the `:is()` block that pins Foundry's light-theme text colours, and its `:root.bastionland-dark` twin. Otherwise Foundry's dark theme leaks pale text onto it.
- Canvas drawing (PIXI) can't read CSS tokens. Keep its colours together in `module/canvas/inks.js` and `module/rules/colour.js`, matching the tokens' values.

## 14. Wording

- **Referee, never GM**, in anything a user reads. It is the Referee Toolkit. Code names keep `gm`. **[Owner]**
- **No page numbers in a notification or a tooltip.** Say what to do instead. Page numbers belong in windows, sheets and cards. **[Owner]**, guarded by `tests/tooltips.test.js` and `tests/notifications.test.js`.
- No words of the book in the repository (see the README).

## 15. Text sits vertically centred

Words must sit on the middle of their capitals inside a chip, pill, button, icon row or bullet. Off-centre text is a bug. **[Owner]**

- The IM Fell faces carry `ascent-override` and `descent-override` so their line box centres on the capitals. A new web font needs the same check, in the CSS and in `module/fonts.js`.
- A chip that trims its text is a block, never flex or grid (see Pills).
- A row list uses `gap` and zeroes the `li` margin (see Lists).
- After adding or restyling any of these, measure it in a headless browser at 1×, 1.25× and 1.5×, and extend `tests/styles/icon-centre.test.js` to cover it.

## 16. Before you ship a piece of UI

1. Does it use the shared class (`.bastionland-heading`, `.bastionland-button`, `.bastionland-icon`, `bastionland-pill`, `.bastionland-reveal`, `.bastionland-blank`) rather than a look of its own?
2. Every colour a token? Every font a token? Sizes at or above the floor, through the two size tokens where they apply?
3. Does it read under Lamplit, Midnight, Ashen and High Contrast, and in Foundry's dark theme?
4. Text centred, measured, not judged by eye?
5. Says Referee; no page number in a tooltip or alert?
6. `npm test` passes.

What the tests hold, and what they don't:

| Rule | Guard |
|---|---|
| Text size floor | `tests/styles/text-size.test.js` |
| Tokens, schemes, contrast, no raw shade | `tests/styles/colour-schemes.test.js` |
| Whole-pixel badges, pills never flex, row lists, font metrics | `tests/styles/icon-centre.test.js` |
| Chat card frame; chat dice | `tests/styles/card-fill.test.js`, `tests/styles/chat-dice.test.js` |
| Dialog skin; resizable windows | `tests/apps/dialog-style.test.js`, `tests/apps/resizable-windows.test.js` |
| No page numbers in tooltips or alerts | `tests/tooltips.test.js`, `tests/notifications.test.js` |
| Macro icons | `tests/assets.test.js` |
| Size tokens; no 4px corner; shadows from the two tokens; blood on hover; Caps-face small caps; a plain button's face; italic hints; no bold heading; inert and solid icons | `tests/styles/style-guide.test.js` |
| The Company button still under Reduce Motion | `tests/styles/map-buttons.test.js` |
| No text shadow; no bold placeholder; no click ring | A blanket CSS rule each, no test |
| Fade with soft ink, not opacity | Nothing |
| Only page numbers dotted | Nothing |
| Shared heading, button and pill classes used | Nothing |
| Washes, fade times, letter-spacing | Nothing |
| Referee, not GM | Three string groups only |
