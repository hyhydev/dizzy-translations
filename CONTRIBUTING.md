# Translating Dizzy

Thanks for helping. This guide takes you from "I speak French and I use Dizzy" to your words being on the site. You only need a free GitHub account and a web browser.

If you're starting a language that isn't here yet, read [Agree the words first](#agree-the-words-first) before anything else, because a new language starts with its glossary.

## Editing in your browser

Everything happens on the GitHub website. There's nothing to install.

1. Sign in to GitHub (or make a free account).
2. Open the folder for your language, like `fr` for French or `pt-BR` for Brazilian Portuguese.
3. Pick a file. Each file holds the words for one part of the site. Every line in it has a key on the left (a name like `tournament.standings.empty`) and the text on the right, and the key's first word tells you the file: `tournament.standings.empty` lives in `tournament.json`.
4. Click the pencil icon near the top right of the file. If GitHub says it needs to make your own copy first, say yes. That's normal.
5. Type your translation between the quotes on the right-hand side. An empty `""` means nobody has translated that line yet.
6. When you're done, click "Commit changes", then "Propose changes".
7. On the next page, click "Create pull request", and then "Create pull request" again to send it.

That's it. Some automatic checks run on your pull request. A green tick means all is well. A red cross means something needs fixing: click "Details" and it will tell you which line and what's wrong. To fix it, open the "Files changed" tab on your pull request, click the three dots beside the file, then "Edit file". Save your fix and the checks run again.

Then your language's reviewer reads it. They'll either merge it or leave a comment asking for a change.

If you already use git, you don't need any of this: fork, edit, and open a pull request as you normally would.

### A few things to know while you type

- Only change the text between the quotes on the right. Leave the key on the left, the quotes, the colon and the comma at the end of the line exactly as they are.
- If your sentence needs a double quote, use your language's own quotation marks (like « » in French), or write `\"`.
- Not sure where a line appears on the site? Look it up in the matching file in the `en-GB` folder that ends in `.context.json` (so `en-GB/tournament.context.json` for `tournament.json`). It explains the lines that aren't obvious. For the rest, `index.json` is the list of places each line is used.
- Use your language's own punctuation and spacing. The English rules don't apply to you.
- Don't add web links or HTML of your own. Keep only what's already in the English.
- Small pull requests are easier to review than big ones. One file at a time is perfect.

## Things in curly braces

Some lines have parts in curly braces. The site fills these in when it shows the text, so they need a little care. There are three kinds.

**A name in braces.** The site swaps `{name}` for a real value, like a player's name.

English:

```
"Welcome back, {name}"
```

French:

```
"{name}, bon retour parmi nous"
```

Copy `{name}` exactly as it is (don't translate the word inside the braces), but move it wherever your sentence needs it.

**A plural.** This is how the site says "1 player" but "2 players".

English:

```
"{count, plural, one {# player left} other {# players left}}"
```

French:

```
"{count, plural, one {# joueur restant} other {# joueurs restants}}"
```

Keep `{count, plural,` and the words `one` and `other` as they are, and translate the text inside the inner braces. The `#` is where the number goes. Your language might need different forms from English: Polish adds `few` and `many`, for example, and Japanese only needs `other`. Use the ones your language needs, but always keep `other`.

**A choice.** The site picks one of several texts, depending on the situation.

English:

```
"{side, select, winners {Winners bracket} losers {Losers bracket} other {Bracket}}"
```

French:

```
"{side, select, winners {Tableau des gagnants} losers {Tableau des perdants} other {Tableau}}"
```

The words before each inner brace (`winners`, `losers`, `other`) are labels the site chooses between, so leave them in English. Translate only the text inside.

**Tags.** A few lines have little tags like `<b>`, `<link>` or `<code>` around some words, to make them bold or a link.

English:

```
"Read the <link>rules</link> before you enter"
```

French:

```
"Lis le <link>règlement</link> avant de t'inscrire"
```

Keep the tags around the matching words in your sentence.

So, the three rules:

1. Copy every `{name}` exactly. You can move it anywhere in the sentence.
2. In a plural, `other` must always be there. Which other forms you use is up to your language.
3. Keep tags in pairs: every `<b>` needs its `</b>`, every `<link>` its `</link>`, every `<code>` its `</code>`. Never write one on its own, like `<b/>`.

If something slips, the checks on your pull request will tell you which line and what went wrong.

## Agree the words first

Every language has a glossary: a short file that says which word your language uses for each thing on Dizzy, like community, tournament, set, seed and bracket. It lives in the `glossary` folder, one file per language. The English one, `glossary/en-GB.json`, explains what each thing means.

It matters because the same thing needs the same word everywhere. If one page says "communauté" and another says "scène", readers will think they're two different things.

- For a new language, the glossary is the first pull request, before any other translation. Open `glossary/en-GB.json`, copy everything in it, then go back to the `glossary` folder, click "Add file", then "Create new file". Name it after your language (`glossary/fr.json`, `glossary/de.json`), paste, and put your word in each `"use"`. Then carry on from step 6 above.
- The first entry is `register`: whether the site says the formal or informal "you" to the reader (tu or vous, du or Sie, você or tu). Dizzy talks to people casually, so we suggest the informal one. Your language can choose the formal one instead, but it chooses once, for the whole site.
- Your language's reviewer has the final say on the glossary. If you're the first person translating a language, you become its reviewer once your glossary is merged. Until then, @hyhydev reviews it.
- If you think a word in the glossary is wrong, open an issue and explain why. The reviewer decides. If the word changes, it changes everywhere at once, in one pull request that updates every line using it.

## When one English line needs two words in yours

Sometimes the site uses one English line in two places, and your language needs a different word in each (French might want "Valider" on one button and "S'inscrire" on another, where English says "Enter" for both). You can't split it yourself, so open a [This string is wrong in my language](https://github.com/hyhydev/dizzy-translations/issues/new/choose) issue, give the key and the two places it shows up, and tick the box that says it needs two words. We'll split it in two, and both new lines will turn up empty in your language's file, ready for you to fill in.

## After your change is merged

A merge here doesn't put your words on the site straight away. A bot copies merged translations across to the site, and when yours are live it comments on your pull request to say "This is on the site now." It isn't instant, so don't worry if it takes a little while.

## Licence

Everything here is under the MIT licence. By opening a pull request, you offer your contribution under it too.

## If your reviewer goes quiet

People get busy. If nobody has looked at your pull request after a couple of weeks, mention @hyhydev in a comment on it. @hyhydev runs Dizzy and is the backup reviewer for every language: they can merge your change once the checks pass and they've read it through, or, if nobody is looking after a language any more, take it out of the language menu at the bottom of the site until someone is.
