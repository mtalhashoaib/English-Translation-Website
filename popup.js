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


// ---------- diagnostics ----------
const DIAG_HOSTS = ["<all_urls>", "https://translate.googleapis.com/*", "https://translate.google.com/*", "https://api.mymemory.translated.net/*"];

async function probe(label, url) {
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const body = (await res.text()).slice(0, 110).replace(/\s+/g, " ");
    return label + ": HTTP " + res.status + " (" + (Date.now() - t0) + " ms) " + body;
  } catch (e) {
    return label + ": FAILED  " + e.name + ": " + e.message;
  } finally { clearTimeout(timer); }
}

async function runDiag() {
  const box = $("diag");
  box.textContent = "Running…";
  const out = ["Version " + chrome.runtime.getManifest().version, "Online: " + navigator.onLine, ""];
  for (const h of DIAG_HOSTS) {
    try { out.push("Permission " + h + ": " + (await chrome.permissions.contains({ origins: [h] }))); }
    catch (e) { out.push("Permission " + h + ": error " + e.message); }
  }
  const denied = out.some((l) => /^Permission .*: false$/.test(l));
  if (denied) out.push("", "! Site access is withheld. Open chrome://extensions > this extension > Details > Site access > \"On all sites\", or click Grant access.");
  out.push("");
  out.push(await probe("Google (googleapis)", "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=de&dt=t&q=hello"));
  out.push(await probe("Google (translate.google.com)", "https://translate.google.com/translate_a/single?client=gtx&sl=en&tl=de&dt=t&q=hello"));
  out.push(await probe("Microsoft (auth)", "https://edge.microsoft.com/translate/auth"));
  out.push(await probe("Lingva", "https://lingva.ml/api/v1/en/de/hello"));
  out.push(await probe("MyMemory fallback", "https://api.mymemory.translated.net/get?q=hello&langpair=en|de"));
  box.textContent = out.join("\n");
}

$("diagRun").addEventListener("click", runDiag);
$("diagGrant").addEventListener("click", async () => {
  try {
    const ok = await chrome.permissions.request({ origins: DIAG_HOSTS });
    setStatus(ok ? "Access granted. Reload the page you are translating." : "Access was not granted.", !ok);
  } catch (e) { setStatus("Could not request access: " + e.message, true); }
  runDiag();
});
$("diagCopy").addEventListener("click", () => {
  navigator.clipboard.writeText($("diag").textContent).then(() => setStatus("Diagnostics copied."), () => setStatus("Select the text and copy it manually.", true));
});
