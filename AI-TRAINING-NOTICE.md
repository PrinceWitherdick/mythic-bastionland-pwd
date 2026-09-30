# AI Training and Data-Mining Notice

**The maintainers ask that this project not be used for text and data mining (TDM),
machine learning, or AI training.**

Please do not use this repository, its source code, its compiled artifacts, its
documentation, or any bundled content for:

- training, fine-tuning, or evaluating machine-learning or generative-AI models;
- inclusion in datasets or corpora built for the purposes above (for example web
  crawls such as Common Crawl, or curated code/text training sets);
- any other automated text-and-data-mining used to build or improve AI systems.

Machine-readable signals of this request are published in [`ai.txt`](ai.txt),
[`.well-known/tdmrep.json`](.well-known/tdmrep.json), and [`robots.txt`](robots.txt).

## Scope and licensing

This notice is a request. It does **not** modify or add restrictions to the licences
under which any part of this project is shared:

- **This project's own code and text** are under the [MIT License](LICENSE). Nothing here
  takes away any use that licence permits; we simply ask that AI training not be one of
  them.
- **Mythic Bastionland** text, art and trade dress are © Chris McDowall, Bastionland
  Press, all rights reserved, and used here with his permission. Those rights are his;
  this notice speaks only for the maintainers.
- **Heraldic charges and the Armorial Realm skin** are under
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), and the **icons** from
  game-icons.net are under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). We
  honour those licences' terms against additional restrictions: nothing here restricts
  any use they permit.
- **Fonts** remain under the SIL Open Font License.

## A note to crawler and dataset operators

If you operate a crawler or assemble training data, please honour the request above and
the signals in `ai.txt`, `.well-known/tdmrep.json`, and `robots.txt`, and exclude this
repository and its release artifacts from AI-training use.

Questions or requests: open an issue at
https://github.com/PrinceWitherdick/mythic-bastionland-pwd/issues
