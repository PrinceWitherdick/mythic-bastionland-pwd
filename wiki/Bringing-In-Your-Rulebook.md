# Bringing In Your Rulebook

The system ships none of the Mythic Bastionland book: no rules text, no Knights, Seers or Myths, no art beyond the free Blank Realm sheet's map legend. Its own code is MIT licensed, and the book is Chris McDowall's. Everything from the book comes from **your own copy of the PDF**, read once in your browser and saved in your own Foundry data folder. This page covers how to bring it in, what that makes, and what to do when something is missing.

Bringing the book in does two jobs at once, whichever way you start it:

- it keeps **a copy to read in Foundry**, for the [rulebook reader](The-Rulebook-Reader) and every page link; and
- it reads **the art and tables** out of it, for the sheets, choosers, compendiums and rules text.

You need the book the system was made for: the 212-page PDF. A different page count is allowed, but the import asks first (see [A different edition](#a-different-edition)).

## Ways to bring it in

All of these do the whole job. Run them as a Referee: the import saves files, and only a Referee can fill the compendiums.

- **The Welcome window.** A new world opens with **Welcome to Mythic Bastionland**. Its **Your Rulebook** column has one button, **Choose the PDF**. Pick the file and the work starts straight away. Under it, two rows tick themselves off: **The art and tables** and **A copy to read in Foundry**, the second showing the path the world reads its book from. **Read It** opens the reader. Closing the Welcome once, by any means, stops it opening by itself again; open it later from **Configure Settings**, under the system's section, with **Open the Welcome**.
- **The Import PDF macro.** On the Referee's hotbar in slot **9**. It asks for the file in an **Import PDF** window that says what will be read, then press **Import**. It is also in the **Mythic Bastionland Macros** compendium. See [Macros and Hotkeys](Macros-and-Hotkeys).
- **The Your Rulebook window.** Opened by the **Rulebook** button in the Journal tab, the book icon in the Referee Toolkit's header, the **Rulebook** macro or the **B** key, while the world has no book yet. Once it has one, the reader's own header has a **Your Rulebook** entry that opens it again.
- **The chat card.** A new world without a book also gets a **Your Rulebook** card in chat, whispered to the Referee, with an **Import PDF** button.

From a script, `game.system.api.bringInRulebook()` does the same.

![The Welcome to Mythic Bastionland window, its Your Rulebook column on the left showing The art and tables marked as imported with a date, and A copy to read in Foundry showing the path the world reads its rulebook from, with the Choose a di](images/bringing-in-your-rulebook-welcome.webp)

## The Your Rulebook window

| Button | What it does |
|---|---|
| **Choose a File on This Computer** | Copies the PDF into your Foundry data folder, so it is still there next session, then imports the art and tables from it. |
| **Browse the Server** | Picks a PDF already on the server, for a hosted Foundry where you uploaded the book yourself. The world reads it where it is, and the art and tables are imported from it. A file not ending in `.pdf` is saved anyway, with a warning. |
| **Read It** | Opens the reader. |
| **Forget It** | Takes the world's pointer to the book away and closes the reader. The file stays on the server. |

The window also says where the copy goes, and that Foundry serves everything in its data folder to anyone signed into the world who knows the path. Treat the copy as shared with your table.

## What an import makes

The import reads the PDF in your browser. Nothing is uploaded anywhere except into your own Foundry data folder, under `mythic-bastionland-art/`. A progress bar names each step as it goes. It takes a little while; leave Foundry be until the report opens.

**Pictures**

- Every Knight's and Seer's portrait, and every Myth's illustration.
- A square token cut around each Knight's face. Knights already in the world, and their tokens on Scenes, are switched to it.

**Text for the choosers and sheets**

- Each Knight's page: verse, Property, Ability, Passion and table, used by [Choosing a Knight](Choosing-a-Knight).
- Each Seer's traits, and each Myth's Omens, Cast and table, used by [The Seer](The-Seer) and [Myths and Omens](Myths-and-Omens).
- The Spark Tables and the City Quest.
- **Creating a Realm**, shown beside a Realm you draw by hand. See [Making a Realm](Making-a-Realm).

**Rules text laid over the interface**

Wherever the system shows a rule in the book's own words, it reads those words from your copy: Travel and Exploration beside the Realm map, the Knighthood help, the rule word popups, the Scars, the seasonal events, the Council and the Court, and more. Until the book is in, each of these shows a short line of the system's own, or nothing, with the page to read.

**Compendiums (world compendiums, made by the import)**

| Compendium | What it holds |
|---|---|
| **Arms & Goods** | The weapons, armour and gear, each kind in its own folder. |
| **Beasts, Hirelings & Warbands** | The beasts, hirelings, Warbands and structures. |
| **NPCs** | Every Seer, every Myth's Cast and the City Quest's Cast, each in its own folder. Referees only: players can't open it. Drag people into the world as the Company meets them. See [NPCs, Structures and Compendiums](NPCs-Structures-and-Compendiums). |

**Folders in the Items and Actors tabs**

Both Arms & Goods compendiums are also copied into the world, under a folder named for each compendium with a subfolder per kind. Anything already there by the same name is left alone, so your edits survive a second import. Folders you delete stay deleted until you run the import again.

Every other browser signed in picks up the new pictures and text by itself; nobody needs to reload.

## The import report

When the import ends, a **PDF Imported** window lists what was read:

- how many of each kind of picture were saved, and how much of each kind of text was read;
- the Spark Tables, the City Quest, the rules pages and the rules text passages, each as "read of total";
- how many items and actors went into each compendium and into the world's folders;
- how many Knights and tokens were given their square token;
- where the index file was saved.

Below that, **Needs a look** lists anything that couldn't be read, by kind, roll and page, with the reason. A clean import says **Every picture was found and saved.** Close the window to finish.

![The PDF Imported report window after a full import, listing the counts of Knight, Seer and Myth art saved and text read, the Spark Tables, City Quest, rules pages and rules text read, the Arms & Goods and NPCs compendium lines, and the inde](images/bringing-in-your-rulebook-report.webp)

## A different edition

Before writing anything, the import checks that the PDF has 212 pages and that the first Knight's and Myth's pages have the pictures it looks for. If either check fails, an **A Different Edition?** window asks whether to import anyway. Pictures may be missing or mixed up if you do. The reader makes the same page-count check, and warns when a page link might land on the wrong page.

## Running it again

Run any of the ways in again at any time, for a new edition or after something went wrong. Pictures are replaced, the compendiums are refilled, and only what is missing is added to the world's folders.

## A new world on the same server

The copy every world keeps is saved at the same place, `mythic-bastionland-art/mythic-bastionland.pdf`. When a world with no book loads and finds that file already there, kept by another world:

- **A new world** points itself at it. The Welcome says **We already have your rulebook**, and imports the art and tables by itself while you watch. There is nothing to choose; **Choose a different PDF** is there if you want another.
- **A world already in play** points itself at it on the next load, says so in a notice, and imports the art and tables, ending on the same report.

A world whose Referee pressed **Forget It** stays without a book, even though the file is still there. Choosing a book again undoes that.

## Letting players read the book

By default only Referees get the **Rulebook** button, the **B** key and the page links. Turn on **Let Players Open the Rulebook** in the world settings to give players all three. Either way, a page the Referee shows the table with **Show This Page to Players** opens on every player's screen. See [The Rulebook Reader](The-Rulebook-Reader).
