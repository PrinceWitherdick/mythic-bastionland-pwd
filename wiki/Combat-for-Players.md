# Combat for Players

A fight in Mythic Bastionland is a run of Attacks, and in this system each one is a chat card the whole table works on together. You roll from your sheet; then the card lets anyone spend dice on Gambits, Deny a die, Focus, or join in, and finally the target's owner applies the Damage. This page walks through a blow from start to finish, then covers duels and taking Damage. For the Referee's side (the turn order, NPCs, Warbands and Morale) see [Running Combat](Running-Combat).

## Making an Attack

1. **Target** the Token (or Tokens) you're attacking. Hold `T` over a Token, or use Foundry's target tool.
2. **Click Attack** on your Knight sheet's action bar.
3. **Tick what you attack with**, check the situation, and press **Roll Attack**.

A Slain or Mortally Wounded Knight can't Attack; you're told why.

![The Attack dialog for Dame Isolde Marrow against Old Gullet, with her mace, kite shield and dagger under Weapons and shields, the This turn ticks, Old Gullet's weakness ticked for +d8, the Bonus dice box, the Smite menu, the folded More for](images/combat-for-players-attack-dialog.webp)

### The Attack dialog

- **Weapons and shields** lists everything you wear or wield, each with its dice and tags. Tick the ones this blow uses. Broken or used-up weapons are left out and named under the list. The dialog refuses an impossible grip (two Hefty items, a Long weapon with anything else, more than two hands' worth) and says why.
- A **specialist** weapon has a second tick under it: tick it when the situation it's made for comes up, to add its die.
- **This turn**: **Moved this turn** (ticked for you when your Token has moved this turn in a Combat), **Began the turn engaged in melee**, and **Mounted**. Hover each for what it changes.
- **Charging on (your steed) at enemies on foot** appears when you ride a steed: tick it to add its trample. It is greyed out when nobody targeted is on foot.
- **Bonus dice**: type extra dice the Referee gives you, such as `d8`, or several as `d6, d12`. In a Combat you can tick **Keep the bonus dice for the rest of the fight**.
- **Smite**: pick **Smite for +d12**, **Blast**, or **Smite for a lasting mark**. The VIG Save is made when you roll. The menu is greyed out while you're Fatigued or Impaired.
- **Declared for this blow** lists what your Ability can lend this one blow. One with limited uses comes unticked and spends a use when you tick it.
- **More for this blow** (folded): **In a confined space**, **Charged a spearwall this turn**, and anything else to declare.
- A foe's known weakness, a die you keep for the fight, and a Gambit that has Impaired you show as their own lines.

The dialog remembers, per character, the weapons you ticked, your specialist ticks and the situation boxes, and opens on them next time. Bonus dice and Smite are never remembered: each is for one blow.

If you target several Tokens with a **Blast**, one card is rolled for each target. Only a Blast strikes more than one, so an Attack at several Tokens that isn't one is refused: target just one, or make it a Blast. Smite for +d12 against a swarm is refused too, since a swarm Impairs any blow that isn't a Blast; Smite for a Blast instead.

## The Attack card

![An Attack card against Old Gullet as its player sees it, with the d8, d8 and d6 drawn as die shapes and the highest marked, the prompt to spend a die of 4 or more on a Gambit, the Damage total and the Focus button](images/combat-for-players-attack-card.webp)

The card shows every die rolled, the highest marked, and the **Damage** (the highest die left, plus any Bolster). Under the dice it prompts you when something can still be done: "One die shows 4 or higher: click it to spend it on a Gambit", or who can still Deny. **What a Gambit can do** folds out the list of Gambits.

### Gambits

- **Click a die showing 4 or more** to spend it on a Gambit. A window asks which Gambit, which Save the foe gets (VIG by default; the Referee may rule another), and for Impair, which of their weapons (or their whole next Attack).
- A melee die of **8 or more** can also make a **Strong Gambit**: **No Save** or a **Greater effect**. Bolster and Move can't be Strong.
- **Click a spent die** to take its Gambit back. Once the foe has made their Save against it, its Greater effect has been carried out, or it's a Dismount, only the Referee can take it back.
- **Dismount** rolls its d6 as you declare it.

Each declared Gambit is listed on the card. Where the foe gets a Save, a **VIG Save** button (or whichever Save was picked) sits beside it for the foe's owner or the Referee to roll; a pass strikes the Gambit through. Only a foe the Attack was aimed at can make that Save. A **Greater effect** has a **Disarm, unhelm or break** button once the Save is settled: pick the foe's weapon to knock away, helm to take off, or wooden thing to break, or write in something else.

Only the attacker (and anyone who joined) can spend dice and Focus. Clicking any Gambit on your sheet just posts its rule to chat.

### Gambit marks

Impair, Stop and Trap outlast the Attack. While they hold, the foe's sheet shows a mark among their conditions, and their next Attack dialog says so (an Impair ticks Impaired for them). In a Combat the marks lapse by the turn order by themselves; outside one, clear a mark with the × on its pill once it has run its course.

### Feats in a fight

- **Deny** (SPI): click **Deny** on the card, pick who Denies and which die to strike out. You can Deny for whoever this hits, or an ally of yours within arm's reach on the map. The button is greyed out, with the reason on hover, when nobody you control can.
- **Focus** (CLA): click **Focus** to make a Gambit without spending a die. The CLA Save shows beside that Gambit on the card.
- **Smite** (VIG) is chosen in the Attack dialog, before the roll.

A failed Feat Save leaves the Knight Fatigued, and a Fatigued Knight can't use any of them. Each Knight can use each Feat once per Attack.

### Joining an Attack

Everyone attacking the same target rolls together as one Attack.

- **Click Join this Attack**, pick who joins from the characters you play, and answer your own Attack dialog. Your dice are added to the card's pool. (The Referee selects the Token of whoever joins first.) The button only shows while you have someone who could join.
- Joining closes once a Deny, Gambit or Focus has been declared.

Some Abilities add more buttons here, shown only to the Knight who has them: **Roll the Pool Again** (once, on a joint Attack, before anything is spent) and **Turn a Die** (for a Knight with a rune etched for a number a die shows).

### Applying the Damage

**Apply Damage** is shown to whoever owns a target, and to the Referee.

- **Click Apply Damage** to take the Damage as the card has it. If dice of 4+ are still unspent, a Gambit still waits on its Save, or someone could still Deny, you're asked first. A Save can't be rolled once the Damage lands.
- A ranged blow, armour that counts only sometimes, a shield a Trap may hold, or anything else the table must judge opens the **Take Damage** window first.
- **Shift-click Apply Damage** to open the Take Damage window anyway.
- With several targets owned by different players, each applies their own; the button stays until every target has taken the blow.

If the blow leaves the target at exactly 0 GD, the Scar is rolled for you on the die that dealt it. See [Scars, Death and Successors](Scars-Death-and-Successors).

## Taking Damage

**Take Damage** on the sheet (or a judged Apply Damage) opens the Damage window:

- **Damage** and **Armour** boxes, filled in where the card knows them.
- **Armour that counts only sometimes**: tick each piece that counts against this blow; the Armour box follows.
- **Ignore Armour**, **Behind protective cover, against a ranged Attack (+1 Armour)**, **In a shieldwall (+1 Armour)** (ticked for you when three or more of your side stand together on the map, all with shields), and **Exposed (take it as if at 0 GD)**.

Press **Apply**. A Damage card shows GD and VIG before and after, and the outcome: turned aside, Wounded, left at 0 GD for a Scar, Mortally Wounded, or Slain. The condition pills on the sheet follow. Damage taken from the sheet this way doesn't roll a Scar for you; use **Roll Scar** if the card says one is due.

Some Abilities step in here: a Knight who can take an ally's Mortal Wound is asked whether to, when one nearby would be Mortally Wounded or Slain.

## Duels

Two combatants who agree to fight can do it as a duel, where both Attacks are rolled and settled at once.

- **Target the one Token** you've agreed to duel, then **click Duel** on your sheet.
- Pick **Duel** or **Joust** (fought mounted), and tick any of **Stake Glory** (two Knights only: the winner gains 1, the loser loses 1), **Bloodless** (leaves no Scars) or **Sparring** (a practice bout: nobody is left dying or Scarred, and GD and VIG are put back when it ends). Press **Begin**.

A duel card follows the two duelists, showing who has rolled and who is yet to Attack.

- **Each duelist presses Attack** on their own sheet. The Attack dialog ticks the duel for you and aims at the other duelist; the card's Damage is held back.
- Use Feats and declare Gambits on your Attack cards as usual.
- **Resolve Both Attacks** applies both blows together. Only the Referee, or someone who owns both duelists, can press it.
- **(Name) wins** or **No victor** ends the duel, after a confirmation, moving any Glory staked. A sparring bout is shaken off then too, or when the Combat ends or time passes.

## On the map

With the Sequencer module (and JB2A) installed, each weapon that added a die strikes on the map in turn, biggest first, with a sound, and the target reacts when the Damage lands. The Referee can turn this off with **Attack Effects on the Map**. See [Installing and Recommended Modules](Installing-and-Recommended-Modules).

## See also
- [Saves, Luck and Feats](Saves-Luck-and-Feats)
- [Scars, Death and Successors](Scars-Death-and-Successors)
- [Property, Steeds and Squires](Property-Steeds-and-Squires)
- [Running Combat](Running-Combat)
- [Hidden Tricks](Hidden-Tricks)
