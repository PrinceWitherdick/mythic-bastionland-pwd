# Installing and Recommended Modules

How to install the system, what it needs, and which optional modules add to it.

## Requirements

- Foundry VTT **v13 or v14**. The system is verified on v14.363 and works on v13 as well.
- Your own copy of the **Mythic Bastionland rulebook PDF**. The system ships none of the book's text or art, so without the PDF there are no Knights, Seers or Myths to choose from, no Spark Tables, no portraits and no compendiums. See [Bringing In Your Rulebook](Bringing-In-Your-Rulebook).
- No modules. Everything on this wiki is built into the system.

## Install

In Foundry's setup screen, go to **Game Systems**, then **Install System**, and paste this manifest URL:

```
https://github.com/PrinceWitherdick/mythic-bastionland-pwd/releases/latest/download/system.json
```

Create a world with the **Mythic Bastionland** system and launch it. The first time a Referee loads a new world, the **Welcome to Mythic Bastionland** window opens to bring in your PDF. See [Your First Session](Your-First-Session) for what happens next.

Updates arrive through Foundry's normal **Update** button on the Game Systems tab, from the same URL.

Updating never touches what the system read from your PDF. The pictures, the rules text and the kept copy of the book live in a `mythic-bastionland-art` folder in your Foundry data folder, outside the system's own folder.

## Recommended modules

None of these is needed. Each one adds something when it is installed and turned on for the world, and nothing happens when it isn't.

| Module | What it adds |
|---|---|
| [Dice So Nice!](https://foundryvtt.com/packages/dice-so-nice) | Rolls every Save, Attack and table roll as 3D dice on the table. Every roll in the system uses Foundry's own dice, so there is nothing to set up. |
| [Sequencer](https://foundryvtt.com/packages/sequencer) | Draws Attacks on the map: swords swing, arrows fly, and blood marks whoever loses VIG. Needs JB2A for the pictures. |
| [JB2A](https://foundryvtt.com/packages/JB2A_DnD5e) | The animations Sequencer plays. The free edition is enough; the Patreon edition works too. |
| [SoundFx Library](https://foundryvtt.com/packages/soundfxlibrary) | Gives Attacks their sound, with or without Sequencer. |
| [FXMaster](https://foundryvtt.com/packages/fxmaster) | Draws the weather on the Scene the players are on. FXMaster+ works the same way. |
| [Tokenizer](https://foundryvtt.com/packages/vtta-tokenizer) | Makes round map tokens from Knight and NPC portraits, with a frame and background of your choosing. |

A new world whose Referee is missing any of these gets a **Recommended Modules** card in chat, whispered to the Referee, with a **Manage Modules** button. A world already in play without FXMaster is told about the weather once, the same way.

### Attack effects

With Sequencer and JB2A installed, an Attack is drawn on the map: every weapon that added a die strikes in turn, the biggest die first, each animation picked from the weapon's name. Applying the Damage bursts on whoever lost GD, bloodies whoever lost VIG, and clanks where the Armour took the whole blow. SoundFx Library adds the sounds, heard by the whole table.

It is one world setting, **Attack Effects on the Map**, on by default. It does nothing when the modules aren't there. Anyone who has turned on **Reduce Motion**, in the system's settings or in their browser, hears the sounds but sees no animation. See [Running Combat](Running-Combat) and [Your Settings and Accessibility](Your-Settings-and-Accessibility).

### Weather on the map

With FXMaster on:

- The day's Sky and Weather roll sets the weather each morning, and the Referee can pick another from the weather button in the [Referee Toolkit](The-Referee-Toolkit)'s banner.
- The weather falls on the Scene the players are on: clouds, fog, rain, hail, snow, blizzard snow and a storm's grey light.
- The weather picker has **Take It Off the Map** to keep the weather set but stop drawing it, and **Put It Back on the Map** to bring it back.
- The Referee's **Weather on the Map** settings switch single kinds off, such as the hail or the storm light.

Without FXMaster the weather is still rolled and kept, and the Toolkit has no weather button. See [Time, Phases and Seasons](Time-Phases-and-Seasons) and [World Settings Reference](World-Settings-Reference).
