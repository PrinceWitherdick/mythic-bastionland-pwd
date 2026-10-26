# The Rulebook Reader

The rulebook reader is your own copy of the Mythic Bastionland PDF, open in a window inside Foundry. It uses Foundry's built-in PDF viewer, so the book's chapters, its search and its own links all work. Every page number the system prints, in its windows and its chat cards, opens the book at that page.

The reader needs the book first. See [Bringing In Your Rulebook](Bringing-In-Your-Rulebook).

## Who can open it

The Referee can always open it. Players can open it only when the Referee turns on **Let Players Open the Rulebook** in the world settings; until then they have no button, no key and no page links. A page the Referee shows the table opens for every player either way.

## Opening the book

- **Press `B`.** It opens the book, or closes it when it is already in front. Change the key under **Configure Controls** (it is called **Open the Rulebook**).
- **The Rulebook macro**, in slot **2** of the Referee's hotbar. It works like `B`.
- **The Rulebook button** at the top of the Journal tab.
- **The book icon** in the [Referee Toolkit](The-Referee-Toolkit)'s header, between the banner and the calendar.
- **Any page link**, such as "(p16)" or "page 151", in the system's windows and chat cards. See [Page links](#page-links).

Before the world has a book, the Referee's `B`, macro, button and Toolkit icon all open the **Your Rulebook** window instead, to point the world at one. The Toolkit's icon is drawn dimmed until then, and its tooltip says which it will do. A player who is allowed the book but presses `B` before there is one is told the Referee hasn't given the world a copy yet.

## Reading

The reader opens on the book's first page, or on the page a link asked for. Inside it, Foundry's PDF viewer works as usual: the sidebar holds the chapters, the search box finds words, and the arrows turn pages.

- **Drag the page** to move about it. The reader starts with the hand tool in hand, so a drag pans rather than selects text.
- **`Ctrl` + mouse wheel** (`Cmd` on a Mac) zooms the page in steps, keeping the spot under the pointer where it is. It zooms the book, never the browser around it.
- A link in the book to a website opens in a new browser tab.

The window's menu in its title bar has:

- **Open in a New Tab**: the book in a browser tab of its own, at the page you are on.
- **Your Rulebook** (Referee): the window for choosing a different PDF, or forgetting this one.

If the PDF's page count differs from the edition the system's page numbers come from, the reader warns you when a link opens it at a page, since the page may be the wrong one.

![The rulebook reader window open on the book's front cover, with the PDF viewer's chapter sidebar open on the left and the eye-shaped Show This Page to Players button in the window's title bar](images/the-rulebook-reader-window.webp)

## Showing a page to the table

As the Referee, **click the eye in the reader's title bar** (**Show This Page to Players**). The reader opens at the same page on the screen of everyone else signed in, players included, whether or not they are allowed the book otherwise. A notice confirms which page was shown. If nobody else is signed in, a notice says so and nothing is sent.

## Page links

Every page reference the system prints is a link: "(p16)", "p18-19", "page 151", "Page 151". Links have a dotted underline, and their tooltip says **Open the rulebook at page N**. **Click one** to open the reader at that page, or turn an open reader to it.

- Links appear in the system's own windows, sheets and chat cards. Chat you type, and other modules' cards, are left alone.
- A link to a range of pages opens at its first page.
- Links appear only when the world has a book and you are allowed to read it. Otherwise the page number is plain text.

## Rule word popups

Rule words such as **Exposed**, **Hefty**, **Gambit**, **VIG**, **Glory** and **Scar** are set in bold in the system's windows and chat cards. **Hover one** to see what the book says it means, read from your PDF. Before the book is brought in, the popup says to import it.

- Words in headings, on most buttons and in anything with its own tooltip are left alone. An item's description in brackets, such as "(d8 hefty)", is still marked.
- Turn the popups off for yourself with **Rule Word Popups** on the **Settings** tab of your Knight or the Toolkit. The words then read as plain text, without the bold. See [Your Settings and Accessibility](Your-Settings-and-Accessibility).

## After a reload

With **Reopen Sheets on Reload** on (the default), a reader you had open when you reloaded Foundry opens again, where it was on your screen. The setting is your own, on the **Settings** tab.
