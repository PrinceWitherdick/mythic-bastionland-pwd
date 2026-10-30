# Running Combat

This page is the Referee's side of a fight: setting up the turn order and Surprise, attacking with NPCs, answering the players' Gambits and Denies, applying Damage, Morale, Warbands, afflictions and the effects drawn on the map. The Attack dialog and the Attack card work the same for everyone, and are explained on [Combat for Players](Combat-for-Players). How to build an NPC's stat block is on [NPCs, Structures and Compendiums](NPCs-Structures-and-Compendiums).

## Turn order and Surprise

Nobody rolls initiative. As a character joins a Combat, the system places it: everyone a player owns goes ahead of everybody else, and the players sort out their own order among themselves. **Roll Initiative** in the Combat Tracker, for one combatant or for all, only puts them back in their side's place. In [Solo Play](Solo-Play) every Knight is on the players' side, whoever owns it.

To roll **Surprise**:

1. Add everyone to the Combat Tracker.
2. **Click the ⋮ button** at the top right of the Combat Tracker. **Roll Surprise** is in that menu, for Referees only, once the encounter has someone in it.
3. Tick everybody who was caught unready and press **Roll Saves**.

Each ticked character makes a CLA Save, and one **Surprise** card in chat shows every result. A character with two Tokens in the fight is listed once. Whoever failed is passed over on their first turn: when the tracker reaches them in round 1, a note says they were caught unready and the tracker moves on by itself. Roll it before the first turn is taken, so nobody's skipped turn has already come and gone.

## Attacking with an NPC

**Target** the Tokens it attacks, then press **Attack** on the NPC's sheet (the first button on its toolbar, beside **Duel** and **Take Damage**), or select its Token and press `5` for the **Attack** macro on your hotbar. The same Attack dialog opens as for a Knight, with the NPC's own weapons in it. See [Combat for Players](Combat-for-Players) for the dialog and the card.

What differs for you:

- **You own every card.** Any die of 4 or more on an NPC's card can be clicked to spend it on a Gambit, and **Focus** works for the NPC as it does for a Knight.
- **Taking a Gambit back late.** Once a Gambit has been Saved against or its Greater effect carried out, or for any Dismount, only you can take it back, on any card. You're asked first, since whatever was rolled for it is lost and anything done to a sheet stays done.
- **Feats for the Cast.** An NPC can only Smite, Focus or Deny if the Feat is marked under **Feats** on its sheet.
- **Joining an Attack.** To have a second NPC roll into the same Attack, select its Token and press **Join this Attack** on the card. A Referee is offered only the selected Tokens, since you own everybody.
- **Who sees the card.** The card follows the chat's roll mode. Posted privately, the players can't see it, and so can't Deny on it, and the blows on the map are shown only to Referees.

![The same Attack card as the Referee sees it, with the Deny, Focus, Join this Attack and Apply Damage buttons](images/running-combat-gambit-save.webp)

## Answering the players' Attacks

When a Knight attacks one of your NPCs, the card waits for your answers before the Damage lands.

- **Saving against a Gambit.** A Gambit that allows a Save shows a button such as **VIG Save** on its line. Click it to roll the Save for the NPC the Attack was aimed at; if it was aimed at several of yours, you're asked which one Saves. A passed Save strikes the Gambit through. The die stays spent either way. On a card aimed at nobody, target or select the Token of whoever Saves first.
- **Greater effects.** A Strong Gambit with a Greater effect shows **Disarm, unhelm or break** once the NPC has failed its Save, or straight away when it gets none. The window lists what the NPC holds, wears or carries that it could take. On an NPC, a helm knocked off or a shield lost takes a point off its Armour and the word for it off its Armour note; the card reminds you to give both back. **Something else** writes in any other effect and changes nobody's sheet.
- **Denying for an NPC.** If an NPC knows Deny, the **Deny** button lets it discard a die with a SPI Save. It offers the NPCs this Attack targeted and the actors of any Tokens you've selected. On the map, a Denier must be a target, or stand within arm's reach of a target as its ally. The button is always shown to a Referee; when nobody can Deny, hovering it says why.

Players act on your NPCs' cards too: they Deny, join, make their Saves and apply Damage to their own Knights. Only a message's author or a Referee can change a card, so the active Referee's client records those changes for them. **A Referee needs to be logged in** for those buttons to work.

## Applying Damage

**Apply Damage** sits at the foot of the card. It is shown to whoever owns one of the targets, and it stays on the card until every targeted Token has taken its Damage. Each owner presses it for their own: a player for their Knight, you for your NPCs. The card lists everyone it has landed on so far.

- **Before it lands,** if dice of 4 or more are still unspent, or a target could still Deny, a window says so and asks whether to apply the Damage anyway. Applying settles the card: no more Gambits, Denies or joiners.
- **A Referee owns every target.** When you press **Apply Damage**, it lands on every target still waiting, the players' Knights included. Leave the button to the players if they would rather take their own.
- **Most blows land without a window.** The card's Damage is taken against the target's Armour as it stands. The **Take Damage** window opens first when there's something to judge: a ranged blow (cover), Armour that only counts sometimes, a shield a Trap may hold, a creature with an immunity, or a Warband or structure the card can't tell this blow reaches. **Shift-click** Apply to open the window regardless.
- **A card rolled with no targets** lands on whatever Tokens the person pressing Apply targets now.
- **A deleted Token** is closed out the next time someone presses Apply, so the card can settle.

The **Take Damage** card that follows says what happened to GD and VIG. When an NPC is Wounded, it also carries the Morale line below.

## Morale

Morale only touches those the players don't play: NPCs, and Knights you play yourself. Structures never waver, and neither does a player's Knight.

**A single character.** When the Damage card says an NPC is Wounded, it carries a **Roll Morale** button that only its owner sees. The SPI Save posts a **Morale** card. You can also press **Morale** on the NPC's sheet; that one first opens a window saying what the Save does, and rolls once you press **Accept**.

**When Morale breaks.** A failed Save's card offers **Fled** and **Surrendered**. Either one marks the NPC on its sheet, marks its Combatant defeated, and passes over its turn in the tracker. The mark shows as a pill among the NPC's conditions: **click the ×** on it when they rally, or if it was pressed by mistake. They go back into the turn order unless they're down some other way. Only NPCs get these buttons; a Knight you play just shows the result.

**A whole side.** Sides are read from Token disposition (Friendly, Neutral, Hostile). Once half or more of a side of two or more is down (Mortally Wounded, Slain, fled, surrendered or marked defeated), a **Wavering Morale** card is whispered to the Referees, once per side per Combat. It names who is still standing and offers:

| Button | What it rolls |
| --- | --- |
| **Organised** | One Save on a leader's SPI. You're asked **Who leads them**. If the leader fails, the card's **Fled** and **Surrendered** mark the whole group at once. |
| **Disorganised** | A Save for each member still standing, on their own SPI. Each failure gets its own buttons. |

**Reaction.** The NPC sheet's **Reaction** button is a SPI Save for how someone takes something, when you're unsure which way they'd go. Like **Morale**, it explains itself and waits for **Accept**.

## Warbands in combat

An NPC set to the **Warband** scale on its sheet fights as a unit. Mustering one for a Domain is on [Domains and Courts](Domains-and-Courts).

- **Against individuals.** A Warband's Attack dialog has an **Against individuals** box that adds +d12 and makes the Attack a Blast. It ticks itself when everyone targeted is a single person or beast, and unticks when a Warband, swarm or structure is among them. Hover it to see why.
- **Led from the front.** Pick a leader under **Led from the front by** and the dice of the weapons they would wield join the Warband's roll, or a single d4 if they're Impaired or unarmed. Select the leader's Token first to have them listed. A Slain or dying Knight can't lead. Until their next turn they take whatever Damage gets past the Warband's Armour: on their own if you own them, otherwise a note in chat tells their player to apply it. The leader is let go at the start of their next turn, when the Combat ends, or with the × beside their name on the Warband's sheet.
- **Hitting a Warband.** Only a Blast or another large-scale Attack harms a Warband. Where the card can't tell, the **Take Damage** window asks. A Warband's own Attack is large-scale, so it can harm another Warband.
- **Its state.** The sheet shows **Routed** (a Mortal Wound or fleeing), **Broken** (SPI 0) and **Wiped Out** (VIG 0) as they happen. A Warband's Morale card comes when its VIG first drops to half or below, not on every Wound.
- **Upkeep.** A Warband's sheet has an **Upkeep** button. Pick what has worn them down (**Ill-rested**, **Poorly fed** or **Driven too hard**) and press **Roll SPI Loss**. It takes d6 SPI and posts the result; at SPI 0 the card says they no longer take orders.

## Afflict Targets

Some of the Cast leave something in those they touch. An NPC that does has an **Afflict Targets** button in its sheet's title bar.

1. Decide whether the victims caught it, rolling any Save the book calls for.
2. **Target** the Tokens that caught it.
3. Press **Afflict Targets**.

Each target that doesn't already carry it gets the affliction among their conditions, and a note in chat says who took what. From then on:

- A daily affliction takes its toll each Morning, when the Day moves on.
- One that bites each round takes its toll as the victim's turn starts in combat.
- Its label on the victim's sheet takes the toll on demand, and its **×** cures it (or washes it off, for one that burns).

Most afflictions are Virtue Loss, which can never Mortally Wound or Slay. Those that deal Damage are taken as a blow of their own, with a Damage card.

## Attack effects on the map

With the world setting **Attack Effects on the Map** turned on (it is by default), each Attack is drawn on the map and heard at the table:

- Every weapon that added a die strikes in turn, the biggest die first.
- Applying the Damage bursts on whoever lost GD, bloodies whoever lost VIG, and clanks where Armour took all of it.
- A Dismount Gambit gets a sound of its own.

The pictures need the **Sequencer** module and one of the **JB2A** modules (the free one or the Patreon one); the sounds need the **SoundFx Library** module. Without them, that half does nothing and nothing else changes. See [Installing and Recommended Modules](Installing-and-Recommended-Modules).

What the players are shown:

- **Hidden Tokens stay hidden.** When either end of a blow is a hidden Token, the pictures and sounds go only to the Referees and whoever set them off.
- **Private cards stay private.** So does a card posted in a private roll mode.
- **Crowds are trimmed.** A Blast animates at most six targets.
- **Reduce Motion.** A player who has turned on Reduce Motion, in their settings or in their browser, hears the sounds without the pictures.

## When the fight ends

Ending the encounter in the Combat Tracker asks the Referee, in a window titled **The Danger Has Passed**, whether to restore Guard for everyone who fought and clear their Fatigue and Exposed. Structures and the Slain are left out. Any Warband leaders are let go at the same time.

## Referee rolls

The Roll Tables sidebar gives Referees a **Referee Rolls** button: pick one of the Referee's d6 tables and press **Roll**. The Luck Roll there, and the **Luck Roll** macro on every hotbar, ask first whether to read the d6 on its table or at odds you've already told the players, from a slim chance to a high chance, each with the number it needs. See [Macros and Hotkeys](Macros-and-Hotkeys).

## See also
- [Combat for Players](Combat-for-Players)
- [NPCs, Structures and Compendiums](NPCs-Structures-and-Compendiums)
- [Domains and Courts](Domains-and-Courts)
- [Saves, Luck and Feats](Saves-Luck-and-Feats)
- [World Settings Reference](World-Settings-Reference)
