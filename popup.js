const $ = (id) => document.getElementById(id);

// ---------- UI ----------
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function speak(text, lang) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    speechSynthesis.speak(u);
  } catch (e) {}
}

function setStatus(msg, isErr = false) {
  const s = $("status");
  s.textContent = msg;
  s.className = isErr ? "err" : "";
}

async function run() {
  const tl = $("lang").value;
  const cfg = LANGS[tl];
  const lines = $("input").value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = $("output");
  out.textContent = "";
  if (!lines.length) return setStatus("Please enter some English text.", true);

  $("go").disabled = true;
  setStatus("Translating…");
  const jobs = [];
  let failed = false;

  for (const line of lines) {
    const card = el("div", "line-card");
    card.appendChild(el("div", "line-en", line));

    const head = el("div", "line-head");
    const textBox = el("div");
    const tr = el("div", "line-tr" + (cfg.rtl ? " rtl" : ""), "…");
    const ro = el("div", "line-ro", "");
    textBox.append(tr, ro);
    const btn = el("button", "speak", "🔊");
    btn.title = "Listen";
    head.append(textBox, btn);
    card.appendChild(head);

    const words = el("div", "words");
    card.appendChild(words);
    out.appendChild(card);

    jobs.push(async () => {
      try {
        const r = await translate(line, tl);
        tr.textContent = r.t;
        ro.textContent = r.r;
        btn.onclick = () => speak(r.t, cfg.speech);
      } catch (e) { failed = true; tr.textContent = "Error: " + e.message; }
    });

    const tokens = line.match(/[A-Za-z0-9'’]+(?:-[A-Za-z0-9'’]+)*/g) || [];
    for (const w of tokens) {
      const chip = el("div", "chip loading");
      chip.appendChild(el("span", "en", w));
      const ctr = el("span", "tr" + (cfg.rtl ? " rtl" : ""), "…");
      const cro = el("span", "ro", "");
      chip.append(ctr, cro);
      chip.style.cursor = "pointer";
      words.appendChild(chip);

      jobs.push(async () => {
        try {
          const r = await translate(w, tl);
          ctr.textContent = r.t;
          cro.textContent = r.r;
          chip.classList.remove("loading");
          chip.onclick = () => speak(r.t, cfg.speech);
        } catch (e) { failed = true; ctr.textContent = "?"; }
      });
    }
  }

  await pool(jobs);
  $("go").disabled = false;
  setStatus(failed ? "Some items failed. Check your internet connection and try again." : "Done. Click any word or 🔊 to hear it.", failed);
}

async function grabSelection() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => String(window.getSelection()),
    });
    if (res && res.result && res.result.trim()) {
      $("input").value = res.result.trim();
      setStatus("Selected text loaded.");
    } else setStatus("No text is selected on the page.", true);
  } catch (e) {
    setStatus("Can't read this page (browser pages are protected).", true);
  }
}

$("go").addEventListener("click", run);
$("grab").addEventListener("click", grabSelection);
$("clear").addEventListener("click", () => { $("input").value = ""; $("output").textContent = ""; setStatus(""); });
$("showRoman").addEventListener("change", (e) => {
  document.body.classList.toggle("hide-roman", !e.target.checked);
  chrome.storage.local.set({ roman: e.target.checked });
});
$("input").addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) run(); });

// ---------- on-page translation settings (shared with content script) ----------
chrome.storage.local.get({ enabled: false, mode: "select", lang: "zh-CN", roman: true }, (v) => {
  $("enabled").checked = v.enabled;
  $("mode").value = v.mode;
  $("lang").value = v.lang;
  $("showRoman").checked = v.roman;
  document.body.classList.toggle("hide-roman", !v.roman);
});
$("enabled").addEventListener("change", (e) => chrome.storage.local.set({ enabled: e.target.checked }));
$("mode").addEventListener("change", (e) => chrome.storage.local.set({ mode: e.target.value }));
$("lang").addEventListener("change", (e) => chrome.storage.local.set({ lang: e.target.value }));
