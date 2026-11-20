# English Word-by-Word Translator (Chrome / Edge extension) v2

Translates English **on any web page** (Google, news sites, Wikipedia...) line by line and word by word
into one language at a time: Chinese (Pinyin), German, French, Russian, Arabic, Persian.
Every line and word shows a Roman pronunciation.

## Install / update
1. Unzip, open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**.
2. **Load unpacked** and choose the folder. (Already installed v1? Delete it first or press **Reload** on the card.)
3. Pin the extension.

## Use (no copy-paste)
Click the extension icon, tick **Translate on web pages**, choose a language and a mode:
- **Select text on a page → pop-up**: highlight any English (a word, a line, a paragraph) and a small
  panel appears with the line translation, Roman pronunciation and every word. Click 🔊 or a word to hear it. Esc closes it.
- **Whole page, word by word**: every English word on the page gets its translation and Roman text under it,
  and every line of text (heading, link, paragraph, list item) gets a full-sentence translation underneath, so word order and grammar are correct. It translates what you scroll to.
  Alt+click a word to hear it.
- Untick **Roman** to hide pronunciation. Untick **Translate on web pages** to restore the page.
- The popup's text box still works for typed text.

## Notes
- Needs internet (uses Google's public translate endpoint). Very long pages make many requests; results are cached.
- Doesn't work on Chrome's own pages (chrome://...), the Web Store, PDFs, or canvas-based apps such as Google Docs.
- Pages open before install need a refresh unless you installed/reloaded with them open (the extension injects itself).
- French and German pronunciation is an approximate English-style respelling; other languages come from the service.
- Word-by-word results are single-word translations, so they can differ from meaning in context.
