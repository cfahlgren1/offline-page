/** The first page a new visitor sees. It doubles as the instructions, so every claim in it matches what the models do. */
export const WELCOME_TITLE = "Welcome to offlinepage.app";

export const WELCOME_MARKDOWN = `# ${WELCOME_TITLE}

A place to write with two tiny models that run inside this tab. Nothing you type is sent anywhere, and once the page has loaded you can turn off Wi‑Fi and keep going.

**tinyfix** is the autocorrect. Try typing “I got a letter form the bank today” on a new line. A couple of words after the typo, “form” turns into “from”. Tap the purple word to see why, or press Backspace right after a fix to undo it.

**tinynext** suggests what comes next, in gray. Press Tab to take it. Try typing “Please accept my resignation. I will be o”.

## What to expect

- Misspellings like “recieve” are fixed as you finish the word, with a faint blue underline.
- Real words in the wrong place, like “form” for “from”, are fixed from context, with a purple underline. tinyfix catches about 4 in 10 of these, and when it does fix one it’s right about 94% of the time.
- tinynext reads the text around the cursor and only suggests when it’s at least 40% sure, so it stays quiet a lot. It learned from articles, chat and office email.
- Type / for headings, lists, quotes and code. Export and Copy give you Markdown.
`;
