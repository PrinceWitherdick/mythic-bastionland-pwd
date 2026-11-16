# Choosing a Knight

Every player character starts as a blank Knight and is filled in from the book in the **Choose a Knight** window: pick the Company's Start, roll Virtues and GD, then roll or pick one of the book's 72 Knights and give them a name. The window reads the Knights' names, portraits, Property, Ability, Passion and Seer from your imported rulebook, so run **Import PDF** first (see [Bringing In Your Rulebook](Bringing-In-Your-Rulebook)). Without it you can still roll, but each Knight shows only as "Knight 3-07" and nothing is filled in.

## Making a Knight

Players may make their own Knights. On a new world the system gives Players and Trusted Players Foundry's **Create Actors** permission once (a Referee who takes it away again under Configure Permissions keeps it taken away), and a player's **Create Actor** dialog offers only the Knight type. The Referee Toolkit, Domains, NPCs and Structures stay the Referee's to make.

- **Create a Knight** from the Actors tab. It opens on an empty page that says nobody has claimed this Knight yet.
- **Click Choose a Knight** on that page to open the chooser.
- **Click Fill in the sheet by hand** instead to skip the book and get the whole blank sheet, to type in yourself.

A Knight made this way gets a folder of their own in the Actors tab, named after them, inside a **Company** folder. Their steed and Squire are moved into it as they are taken, and the folder follows the Knight's name when it changes. A Knight made inside a folder you picked stays where you put it. Folders are made by the Referee's client, so a Knight made while no Referee is logged in is filed when the next one joins.

### Making a Knight for a player (Referee)

The Referee can make a Knight ahead of the game and hand it over to be chosen:

- **Create a Knight** as above. On its empty page the Referee also sees a **Played by** menu.
- **Pick a player** in **Played by**. The Knight becomes theirs (in place of whoever held it), becomes their assigned character if they have none, and the sheet opens on their screen, now or the next time they log in.
- **Pick Nobody yet** to take the Knight back.

![A new Knight's empty page with the hint that nobody has claimed them yet, the Choose a Knight button, the Fill in the sheet by hand link, and the Played by menu set to Player](images/choosing-a-knight-unchosen.webp)

## The Choose a Knight window

![The Choose a Knight window with Choose your own open, a row of Knight portraits for one d6 result, the picked Knight's portrait, verse, Property, Ability, Passion and Seer on the right, and a name typed beside Apply](images/choosing-a-knight-chooser.webp)

The window works down three numbered steps on the left, with the Knight you have picked shown large on the right.

### 1. Start

The opening situation the whole Company shares: **Wanderer**, **Courtier** or **Ruler**. Each button shows the dice it uses for Virtues and GD. The window opens on the Start the Company's Realm was made with, or on Wanderer if there is none. A Knight made to replace one who fell always opens on Wanderer.

When the replacement joins a Company that already has Glory, a **Glory** box appears under the Starts with a suggested figure and the range the rest of the Company holds. Change it if you like; leave it blank to take the suggestion.

### 2. Virtues and Guard

- **Click Roll Virtues and GD** to roll VIG, CLA and SPI in order, then GD, with the chosen Start's dice. The rolls are posted to chat on a card.
- **Type in any box** to change a result by hand. Virtues are held between 0 and 19.

### 3. Knight

- **Click Roll d6 and d12** to roll a Knight. The rolled Knight is shown, together with the rest of their d6 result. Nothing goes to chat.
- **Click Choose your own** to pick by hand. The window slides wider to show the Knights, one d6 result at a time; click again to fold them away and give the width back.
- **Click a number from 1 to 6** above the grid to show that d6 result's twelve Knights.
- **Click the magnifying glass** to search all 72 Knights by name or by roll (such as `3-07`). `Esc` closes the search and goes back to the d6 result.
- **Click a Knight's card** to pick them. Hover a portrait to see it larger.
- **Click Homebrew**, after the six numbers, for the Knights the Referee wrote (see [Homebrew Knights](#homebrew-knights)). Players see it once at least one is ready for them; the Referee always does.

The right-hand side shows the picked Knight's roll and book page, portrait, the verse under their name, their Property, Ability and Passion, and under **Knighted by** their Seer's portrait, name and description.

### Name and Apply

Along the bottom:

- **Name:** type the Knight's name. It starts with the actor's own name, unless Create Actor only gave the stand-in "Knight".
- **Click the die** to the right of the box to roll a medieval name. It never gives the name already in the box, and avoids names other Knights in the world already have.
- **Click Apply to (name)** to fill in the Knight. It stays greyed out until a Knight is picked and a name is typed.

Applying sets the name (and the Token's, if it matched), the Age and Glory the Start gives, Virtues, GD, the Knight's Property, Ability, Passion and the standard kit, their Seer, their portrait and Token picture, and makes a steed from their Property if they bring one. On a Knight that was already chosen, a **Replace This Knight?** confirmation lists what will be replaced first. Scars and the Chronicle are always kept.

## Choosing again: New Knight

A chosen Knight's sheet has **New Knight** in its window title bar. It opens the same window on this Knight, to reroll or pick another. Their Property, Ability, Passion, scores, Age and Glory are replaced, and steeds or companions made from their old Property are deleted. Scars and the Chronicle stay. See [The Knight Sheet](The-Knight-Sheet#the-title-bar-buttons).

## No two characters are the same Knight

By default no two living characters can be the same Knight from the book, whether player Knights or the Referee's [NPC Knights](NPCs-Structures-and-Compendiums#npc-knights):

- In the chooser a taken Knight's card is greyed, its tooltip says whose Knight it is, and clicking it explains why it can't be picked.
- **Roll d6 and d12** only ever lands on a free Knight.
- Typing a taken Knight into the sheet's **Known as the ... Knight** box is refused, and the old value comes back.
- A slain Knight's Knight is free again, and Squires don't count.

The rule binds the Referee too. To allow it, the Referee turns on **Allow the Same Knight Twice** in the world settings (also on the Settings page's **For the Referee** group). See [World Settings Reference](World-Settings-Reference).

## When a Squire is Knighted

Knighting a Squire (the **Knight this Squire** button in the Squire's title bar) rolls a d6 for each Virtue and posts it to chat. Then the window opens in a keep-everything mode:

- Steps 1 and 2 are replaced by a **Knighted** block showing the Virtues and GD they keep.
- Step 3 reads **Which Knight?**. Roll or pick as usual.
- If the Squire was still called "Squire to ...", the name box starts empty.
- Apply only adds: the Knight's Property, Ability and Passion, any of the standard kit they don't already carry, the Seer, and the book portrait if they still had the stand-in picture. Nothing they had is taken away. A steed from the Knight's Property becomes the one they ride, and their pony stays in the Actors tab.

If you close the window without choosing, the sheet's title bar shows **Choose Their Knight** until you do. See [Property, Steeds and Squires](Property-Steeds-and-Squires#knighting-a-squire).

A Squire can be Knighted as a homebrew Knight too: pick them on the **Homebrew** page.

## Homebrew Knights

The Referee can write Knights of their own, each with the Seer who knighted them, and players choose them in this window as they would a Knight of the book. Each homebrew Knight is a Journal entry, filed in a **Homebrew Knights** folder.

Start one with:

- **New Knight** at the top of the Journal directory;
- **Write a homebrew Knight**, the first card on the **Homebrew** page of Choose a Knight (Referee only).

### The Homebrew Knight sheet

![A homebrew Knight's sheet, The Lantern Knight, with Ready for players and Start from a book Knight at the top, the empty portrait frame, the name and verse, four Property lines with what each gives listed under them, Ability, Passion, Their Ability works like, and their Seer with scores](images/choosing-a-knight-homebrew-sheet.webp)

Everything saves as you type. Close a new Knight without writing anything and its empty entry is deleted.

- **Portrait.** Click the frame (**Choose their portrait**) to pick one. **Frame** under it chooses the part a Knight sheet shows, in the same window a Knight's own portrait uses; the box is the Knight sheet's shape, and a Knight made from them keeps that framing. **No Picture** clears it. There is no separate Token picture: the Token is the portrait.
- **Name**, written between **The** and **Knight** (The Lantern Knight, say), and two lines of **Verse**.
- **Property**, a line each, written the way Knights' Property is: dice and qualities in brackets for a weapon, such as `(d8 long)`, A and a number for armour, such as `(A1)`, a stat line for a companion, and `(see below)` on the possession their table is about. **What their Property gives** under the box shows what each line will make: a weapon, armour, gear or a companion.
- **Ability** and **Passion**, each with a name and its text, and a box for **Choices, one a line, if it ends on a list**.
- **Their Ability works like**: pick a Knight of the book to borrow what their Ability does in play, such as the dice it adds to an Attack or the weapon it gives, or leave it on **Nothing automatic**. It needs the rulebook imported.
- **Table**: a name and a table of two columns and six rows, rolled from the Knight's sheet with a d6 for each column. Leave it empty if they have none. **Sentences** (optional) says how each column's result reads on the chat card: put `{entry}` where it goes, or `{a entry}` to give it "a" or "an".
- **Their Seer**: their picture (shown whole, with no framing), the **Seer's name**, **Scores** (VIG, CLA, SPI and GD) and **Traits**, a line each: Armour first, such as `A1 (thick robes)`, then any attacks, such as `Staff (d6)`, then whatever else is true of them. **What their traits make of them** shows how they will be read.

### Start from a book Knight

**Start from a book Knight** copies a Knight of the book in to change as you like: everything on their page, their table, their Ability working as theirs does, and their Seer. Its list has a **Search the Knights…** box; each Knight is shown with the Seer who knighted them. If you've already written anything, you're asked before it is replaced. Give them a new name before players can choose them. It needs the rulebook imported.

### Ready for players

Players can't see a homebrew Knight until the Referee ticks **Ready for players** on the sheet. To tick it, the Knight needs a name, and they and their Seer need names no other Knight or Seer has, book or homebrew. Untick it to take them back.

Names are kept apart from then on. While a Knight is ready, or a character goes by them, renaming them (or their Seer) into a name another Knight or Seer already has is put back, with a warning. A draft nobody can choose yet may share a name for now; the sheet says so under the box.

Renaming a Knight that characters already go by asks **Rename Them Too?**, so those sheets keep their table, verse and Seer. This works from the sheet, the Journal sidebar or Start from a book Knight alike.

### Choosing one

In Choose a Knight, homebrew Knights are on the **Homebrew** page, after the six d6 results. They are only ever chosen by hand: **Roll d6 and d12** never lands on one. The right-hand side reads **Homebrew, written by the Referee** where a book Knight shows their roll and page, and gives the Referee an **Edit this Knight** button.

Applying one fills in the sheet as a book Knight does: Property, Ability, Passion, the standard kit, their table, their Seer, and their portrait as framed. The rule that [no two characters are the same Knight](#no-two-characters-are-the-same-knight) covers them too.

> **Did you know?**
> - The chooser keeps up with the table: if another player takes a Knight while your window is open, that card greys out, and Apply checks again before it saves.
> - A Knight who falls hands their player a fresh blank Knight with this window already open. See [Scars, Death and Successors](Scars-Death-and-Successors).
> - New Knights' Tokens show their name to everyone on hover.

## See also
- [The Knight Sheet](The-Knight-Sheet)
- [The Seer](The-Seer)
- [Property, Steeds and Squires](Property-Steeds-and-Squires)
- [Bringing In Your Rulebook](Bringing-In-Your-Rulebook)
