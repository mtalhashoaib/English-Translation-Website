# English Word-by-Word Translator (Chrome / Edge extension) v2.3

Translates English **on any web page** (Google, news sites, Wikipedia...) line by line and word by word
into one language at a time. Supported languages:

| Language | Roman pronunciation |
|---|---|
| Chinese (Pinyin) | from the translate service |
| Japanese (Rōmaji) | from the translate service |
| Korean (Romanization) | from the translate service |
| Russian, Arabic, Persian, Urdu | from the translate service |
| German, French | approximate English-style respelling (generated locally) |
| Dutch, Swedish, Norwegian, Danish | approximate English-style respelling (generated locally) |

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
- French, German, Dutch, Swedish, Norwegian and Danish pronunciation is an approximate English-style respelling; other languages come from the service. Danish in particular is very irregular, so treat its respelling as a rough guide and use 🔊 for the real sound.
- Norwegian is translated to Bokmål.
- Word-by-word results are single-word translations, so they can differ from meaning in context.

## Privacy
**Short version:** the extension has no server, no account, no ads and no analytics. The only thing that
leaves your browser is the English text you ask it to translate, and it goes to Google's translate service.

**What is sent, and when**
- Nothing is sent while **Translate on web pages** is switched off.
- In **Select text** mode, only the text you highlight (and the individual words in it) is sent.
- In **Whole page** mode, the English text of the page you are on is sent in pieces as you scroll, so don't
  use this mode on pages that show private information (email, banking, medical or work documents).
  Text inside input boxes and text areas is skipped, but other text on the page is not.
- In the popup, only what you type or paste, or the selection you load with **Use selected text**, is sent.
- Text is sent to `translate.googleapis.com` over HTTPS. Google receives the text, your IP address and
  standard request data, and handles them under [Google's Privacy Policy](https://policies.google.com/privacy).
  The extension author does not receive or see any of it.

**What is stored**
- Four settings are saved locally in your browser: on/off, mode, language and the Roman on/off choice.
- Translated words and lines are cached locally in the browser (up to a few thousand entries) so repeat
  requests are avoided. This stores English snippets you translated, nothing about the pages you visit.
- Nothing is stored about the pages you visit, and no page text is kept after translation.

**Permissions, and why**
- `<all_urls>` / content script on http(s) pages: needed so translation can work on any site you choose.
  The script does nothing until you turn translation on.
- `activeTab` and `scripting`: used only to read your selected text when you press **Use selected text**,
  and to load the extension into tabs that were already open when it was installed.
- `storage`: used only for the four settings above.

The extension runs no remote code, and does not use cookies, trackers or fingerprinting.
If you need translation fully offline or want to avoid sending text to Google, don't use this extension.
