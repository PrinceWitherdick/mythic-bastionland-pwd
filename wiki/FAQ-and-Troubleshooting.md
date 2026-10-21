# FAQ and Troubleshooting

Answers to the questions that come up most, and what to do when something looks wrong.

## Getting started

**Do I need the rulebook PDF?**
Yes. The system ships none of the book's text or art, so without your own copy there are no Knights, Seers or Myths to choose from, no Spark Tables, no portraits and no compendiums. Bring it in once and everything fills in. See [Bringing In Your Rulebook](Bringing-In-Your-Rulebook).

**Do I need any modules?**
No. Everything is built in. A few optional modules add 3D dice, Attack animations and sounds, weather on the map and round tokens. See [Installing and Recommended Modules](Installing-and-Recommended-Modules).

**Does it work on Foundry v13?**
Yes, v13 and v14 both, with the same features. The one difference you may notice is Foundry's own look: v14 draws its interface dark unless you change it. The system's sheets stay on parchment either way, unless you pick another **Colour Scheme**.

**Will a system update overwrite my world or my imported book?**
No. Updates replace the system's own files. Your world's actors, journals, items and settings stay as they are, and what was read from your PDF lives in `mythic-bastionland-art/` in your Foundry data folder, outside the system's folder.

## The rulebook and its art

**Pictures, rules text or the choosers' lists are missing.**
The book hasn't been brought in to this world yet, or part of it couldn't be read. As the Referee, run **Import PDF** from hotbar slot 9 (or the Welcome window) and choose your PDF. Until then, rules shown in the book's words read as a short line of the system's own, or nothing, with the page to look up, and rule word popups say to import the book. See [Bringing In Your Rulebook](Bringing-In-Your-Rulebook).

**The import finished, but some things are still missing.**
Read the **Needs a look** list at the foot of the **PDF Imported** report: it names each Knight, Myth, table or page that couldn't be read. The import was made for the 212-page edition; another edition can leave gaps, and the import asks before it starts if the page count differs. You can run the import again at any time.

**My players don't see the new pictures.**
They should, without reloading: every browser signed in picks up a new import by itself. If one doesn't, ask that player to reload.

**I already imported the book in another world. Do I have to do it again?**
No. A world with no book that finds the copy another world kept on the same server takes it up by itself and imports what it needs. The only exception is a world where you pressed **Forget It** in the **Your Rulebook** window; choose the book again there.

**Players can't open the rulebook.**
That is the default. Turn on **Let Players Open the Rulebook** in the world settings to give them the **Rulebook** button, the `B` key and the page links. Without it, you can still show them any page with **Show This Page to Players** in the reader's title bar. See [The Rulebook Reader](The-Rulebook-Reader).

**Page numbers like "(p16)" aren't clickable.**
They become links only once the world has a book, and only for people allowed to read it. Typed chat and other modules' cards are never linked.

**Can my players download the PDF?**
Foundry serves everything in its data folder to anyone signed into the world who knows the path, and the kept copy is in that folder. Treat it as shared with your table.

## How things look

**The sheets are too dark, or too light.**
Each person picks their own **Colour Scheme** on the **Settings** tab of their Knight (or the Referee Toolkit): **Parchment**, three dark schemes (**Lamplit**, **Midnight**, **Ashen**), or **Follow Foundry**, which takes Parchment or Lamplit as Foundry's own windows are light or dark. Foundry's own windows follow Foundry's interface setting, not the system's. See [Your Settings and Accessibility](Your-Settings-and-Accessibility).

**The text is too small, too faint or too fancy.**
On the same Settings tab: **Text Size** up to 1.40, **High Contrast**, a plainer **Typeface**, and **No Italic Text**.

**The travel rules beside the map, the time bar or the hex label are in my way.**
Each can be hidden for your browser alone on the Settings tab: **Travel Rules beside the Realm Map**, **Phase, Season and Age at the Top of the Screen** and **Name the Realm Hex under the Pointer**. Everyone else keeps theirs.

**A player's sheet looks different from mine.**
Colour scheme, text size, typeface and the rest are per-browser settings. Each person sets their own.

## Knights and players

**Two players want the same Knight from the book.**
By default a Knight a living character already is can't be rolled, chosen or typed in again; a slain Knight's can. Turn on **Allow the Same Knight Twice** in the world settings to allow it. See [Choosing a Knight](Choosing-a-Knight).

**My players can't make their own Knights.**
The system lets players create actors once, when the world is first set up, and their **Create Actor** then offers only a Knight. If you took that permission away under **Configure Permissions**, give **Create New Actors** back to players there.

## The Realm map

**I deleted the Company's Token by mistake.**
The Referee is whispered a **The Company has left the map** card with **Put them back**, which stands the Company in the hex it was deleted from, with its picture. Failing that, a **Place the Company** button shows over the top edge of the map while the Realm has no Company Token: press it and click a hex. Right-click or `Esc` lets you place them later. See [Travels and Places](Travels-and-Places).

**The weather isn't showing on the map.**
Check, in order:

- **FXMaster** (or FXMaster+) is installed and turned on for this world. Without it the weather is kept but never drawn.
- **Weather on the Map** is on in the world settings, and you haven't pressed **Take It Off the Map** in the weather picker.
- The kind you expect is ticked under **Types of Weather** on the Toolkit's Settings tab (or the matching setting, such as **Rain**).
- The weather is set: from the weather button in the Referee Toolkit's banner, or by the day's Sky and Weather roll each morning.
- The players are on the Scene you expect: the weather falls on the Scene the players are on.

See [Time, Phases and Seasons](Time-Phases-and-Seasons).

**I have FXMaster but the Toolkit has no weather button.**
**Show the Weather Button** is off in your browser. It is on the Toolkit's Settings tab under **Weather on the Map**.

**Attacks aren't animated, or make no sound.**
The pictures need **Sequencer** and **JB2A**; the sounds need **SoundFx Library**. **Attack Effects on the Map** must be on in the world settings. Anyone with **Reduce Motion** on, in the system's settings or in their operating system, hears the sounds but sees no animation. See [Installing and Recommended Modules](Installing-and-Recommended-Modules).

## Time and the Timeline

**The Campaign Timeline is missing.**
**Campaign Timeline** is off in the world settings. Turn it on and reload. Nothing was lost while it was off: events are still written down. See [The Campaign Timeline](The-Campaign-Timeline).

**A Tour keeps starting by itself.**
Turn off **Start the Tours by Themselves** on your Settings tab. The Tours then wait in Foundry's **Tour Management** for you to play when you like.

**The Welcome window won't open again.**
It opens by itself only once, for a new world. Open it from **Configure Settings**, in the Mythic Bastionland section, with **Open the Welcome**, or from the Toolkit's Settings tab.

## Still stuck?

[Report a problem](https://github.com/PrinceWitherdick/mythic-bastionland-pwd/issues), with your Foundry version and what the browser console (`F12`) says.
