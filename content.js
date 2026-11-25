// On-page translation: selection pop-up + whole-page word-by-word mode.
(() => {
  try { if (window.__ewtLoaded && chrome.runtime && chrome.runtime.id) return; } catch (e) {}
  window.__ewtLoaded = true;

  const DEFAULTS = { enabled: false, mode: "select", lang: "zh-CN", roman: true };
  const SPEECH = { "zh-CN": "zh-CN", de: "de-DE", fr: "fr-FR", ru: "ru-RU", ar: "ar-SA", fa: "fa-IR", ur: "ur-PK", ja: "ja-JP", ko: "ko-KR", nl: "nl-NL", sv: "sv-SE", no: "nb-NO", da: "da-DK" };
  const NAMES = { "zh-CN": "Chinese", de: "German", fr: "French", ru: "Russian", ar: "Arabic", fa: "Persian", ur: "Urdu", ja: "Japanese", ko: "Korean", nl: "Dutch", sv: "Swedish", no: "Norwegian", da: "Danish" };
  const RTL = { ar: true, fa: true, ur: true };
  const SKIP_SEL = 'script,style,noscript,textarea,input,select,option,code,pre,svg,canvas,iframe,kbd,[contenteditable=""],[contenteditable="true"],.ewt-wrap,.ewt-line,[data-ewt-host]';
  const WORD_RE = /[A-Za-z][A-Za-z'’]*(?:-[A-Za-z][A-Za-z'’]*)*/g;

  let st = Object.assign({}, DEFAULTS);

  function alive() { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } }

  // ---------- translation via background worker ----------
  const cache = new Map();
  function tr(text, tl) {
    const key = tl + "|" + text.toLowerCase();
    if (cache.has(key)) return cache.get(key);
    const p = new Promise((resolve) => {
      if (!alive()) return resolve({ t: "?", r: "", err: "Extension was reloaded, refresh this page" });
      let done = false;
      const finish = (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
      const timer = setTimeout(() => finish({ t: "?", r: "", err: "Timed out waiting for translator" }), 60000);
      try {
        chrome.runtime.sendMessage({ type: "translate", text, tl }, (res) => {
          const le = chrome.runtime.lastError;
          if (res && res.ok) finish(res);
          else finish({ t: "?", r: "", err: (res && res.error) || (le && le.message) || "No response from background" });
        });
      } catch (e) { finish({ t: "?", r: "", err: String(e) }); }
    });
    p.then((r) => { if (r.t === "?") cache.delete(key); });
    cache.set(key, p);
    return p;
  }

  // Fill a node with a translation; on failure show the reason on hover and retry automatically
  function fill(text, tl, apply, tries = 0) {
    tr(text, tl).then((res) => {
      apply(res);
      if (res.t === "?" && tries < 3 && alive()) {
        setTimeout(() => fill(text, tl, apply, tries + 1), 5000 * (tries + 1));
      }
    });
  }

  function speak(text, tl) {
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = SPEECH[tl] || "en-US";
      speechSynthesis.speak(u);
    } catch (e) {}
  }

  function mk(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  // ---------- whole-page mode ----------
  let io = null, mo = null, moTimer = null, seen = new WeakSet(), lined = new WeakSet(), records = [], lineEls = [], appliedKey = "";

  function insideOurs(node) {
    const el = node && node.nodeType === 1 ? node : node && node.parentElement;
    return !el || !!el.closest(".ewt-wrap,.ewt-line,[data-ewt-host]");
  }

  function wordEl(word, tl) {
    const w = mk("span", "ewt-w");
    const en = mk("span", "ewt-en", word);
    const t = mk("span", "ewt-tr", "…");
    if (RTL[tl]) t.setAttribute("dir", "rtl");
    const r = mk("span", "ewt-ro", "");
    w.append(en, t, r);
    fill(word, tl, (res) => { t.textContent = res.t; r.textContent = res.r; t.title = res.err || ""; });
    return w;
  }

  const BLOCKISH = new Set(["block", "list-item", "table-cell", "flow-root", "table-caption"]);
  function disp(el) { try { return getComputedStyle(el).display; } catch (e) { return "block"; } }

  // Nearest ancestor-or-self that lays out as a block: the "line" a sentence belongs to
  function lineHost(el) {
    for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (BLOCKISH.has(disp(n))) return n;
    }
    return null;
  }

  // Original text of a block (own text + inline children), ignoring our own annotations
  function lineText(el) {
    let s = "";
    for (const n of el.childNodes) {
      if (n.nodeType === 3) { s += n.data; continue; }
      if (n.nodeType !== 1) continue;
      if (n.classList.contains("ewt-line")) continue;
      if (n.classList.contains("ewt-wrap")) {
        for (const c of n.childNodes) {
          if (c.nodeType === 3) s += c.data;
          else if (c.classList && c.classList.contains("ewt-w")) s += c.firstChild.textContent;
        }
        continue;
      }
      if (n.tagName === "BR") { s += " "; continue; }
      if (n.matches(SKIP_SEL)) continue;
      const d = disp(n);
      if (d === "none" || BLOCKISH.has(d)) continue; // block children get their own line
      s += lineText(n);
    }
    return s;
  }

  function annotate(el) {
    const tl = st.lang;
    const nodes = Array.from(el.childNodes).filter((n) => n.nodeType === 3 && /[A-Za-z]/.test(n.data));
    if (!nodes.length) return;
    for (const n of nodes) {
      const s = n.data;
      const wrap = mk("span", "ewt-wrap");
      let last = 0;
      for (const m of s.matchAll(WORD_RE)) {
        if (m.index > last) wrap.appendChild(document.createTextNode(s.slice(last, m.index)));
        wrap.appendChild(wordEl(m[0], tl));
        last = m.index + m[0].length;
      }
      if (last < s.length) wrap.appendChild(document.createTextNode(s.slice(last)));
      n.replaceWith(wrap);
      records.push({ wrap, orig: n });
    }
    const host = lineHost(el);
    if (host && !lined.has(host)) {
      lined.add(host);
      const text = lineText(host).replace(/\s+/g, " ").trim();
      const wc = (text.match(WORD_RE) || []).length;
      if (wc >= 2 && text.length <= 600) {
        const line = mk("div", "ewt-line");
        line.setAttribute("dir", "auto");
        const t = mk("div", "ewt-line-tr", "…");
        const r = mk("div", "ewt-line-ro", "");
        line.append(t, r);
        let ref = null;
        for (const ch of host.children) {
          if (!ch.classList.contains("ewt-line") && BLOCKISH.has(disp(ch))) { ref = ch; break; }
        }
        host.insertBefore(line, ref);
        lineEls.push(line);
        fill(text, tl, (res) => { t.textContent = res.t; r.textContent = res.r; t.title = res.err || ""; });
      }
    }
  }

  function collect() {
    if (!document.body || !io) return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const els = new Set();
    let n;
    while ((n = walker.nextNode())) {
      if (!/[A-Za-z]{2,}/.test(n.data)) continue;
      const el = n.parentElement;
      if (!el || seen.has(el) || el.closest(SKIP_SEL)) continue;
      els.add(el);
    }
    els.forEach((el) => { seen.add(el); io.observe(el); });
  }

  function startPage() {
    io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { io.unobserve(e.target); annotate(e.target); }
      }
    }, { rootMargin: "300px" });
    collect();
    mo = new MutationObserver((muts) => {
      if (muts.every((m) => insideOurs(m.target))) return;
      clearTimeout(moTimer);
      moTimer = setTimeout(collect, 800);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  function clearPage() {
    if (io) { io.disconnect(); io = null; }
    if (mo) { mo.disconnect(); mo = null; }
    clearTimeout(moTimer);
    for (const { wrap, orig } of records) { if (wrap.isConnected) wrap.replaceWith(orig); }
    records = [];
    lineEls.forEach((l) => l.remove());
    lineEls = [];
    seen = new WeakSet();
    lined = new WeakSet();
    appliedKey = "";
  }

  // Alt+click on an annotated word to hear it
  document.addEventListener("click", (ev) => {
    if (!ev.altKey || !st.enabled) return;
    const w = ev.target && ev.target.closest && ev.target.closest(".ewt-w");
    if (!w) return;
    ev.preventDefault();
    ev.stopPropagation();
    const t = w.querySelector(".ewt-tr");
    if (t) speak(t.textContent, st.lang);
  }, true);

  // ---------- selection pop-up ----------
  let host = null, selTimer = null;

  function closePanel() { if (host) { host.remove(); host = null; } }

  const PANEL_CSS = `
    :host { all: initial; }
    .panel { width: 380px; max-width: calc(100vw - 16px); overflow-y: auto; box-sizing: border-box;
      background: #fff; color: #1c1c1e; border: 1px solid #d6d6da; border-radius: 12px; padding: 10px 12px;
      box-shadow: 0 8px 28px rgba(0,0,0,.22); font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
    .top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; font-size: 12px; color: #6b6b70; font-weight: 600; }
    .x { border: 0; background: none; font-size: 18px; cursor: pointer; color: #6b6b70; line-height: 1; }
    .card { border-top: 1px solid #ececef; padding: 8px 0; }
    .card:first-of-type { border-top: 0; }
    .en { font-size: 12px; color: #6b6b70; margin-bottom: 4px; }
    .head { display: flex; gap: 8px; align-items: flex-start; }
    .head > div { flex: 1; }
    .tr { font-size: 19px; font-weight: 600; }
    .ro { font-size: 13px; color: #c96442; font-style: italic; margin: 2px 0 6px; }
    .spk { border: 1px solid #cfcfd4; background: #fff; border-radius: 8px; cursor: pointer; padding: 2px 8px; font-size: 14px; }
    .words { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 4px; }
    .chip { display: flex; flex-direction: column; align-items: center; min-width: 48px; background: #f5f4f0; border-radius: 8px;
      padding: 4px 7px; text-align: center; cursor: pointer; }
    .chip .e { font-size: 10px; color: #6b6b70; }
    .chip .t { font-size: 15px; font-weight: 600; }
    .chip .r { font-size: 11px; color: #c96442; font-style: italic; }
    .rtl { direction: rtl; text-align: right; }
    .hide-roman .ro, .hide-roman .r { display: none; }
  `;

  function showSelection() {
    if (!alive() || !st.enabled || st.mode !== "select") return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const text = String(sel).trim();
    if (!text || !/[A-Za-z]/.test(text) || text.length > 1500) return;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const tl = st.lang;
    const rtl = !!RTL[tl];

    closePanel();
    host = document.createElement("div");
    host.setAttribute("data-ewt-host", "1");
    host.style.cssText = "all:initial;position:fixed;z-index:2147483647;";
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 392));
    host.style.left = left + "px";
    let maxH;
    if (rect.bottom < window.innerHeight * 0.55) {
      host.style.top = rect.bottom + 8 + "px";
      maxH = window.innerHeight - rect.bottom - 24;
    } else {
      host.style.bottom = window.innerHeight - rect.top + 8 + "px";
      maxH = rect.top - 24;
    }
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = PANEL_CSS;
    const panel = mk("div", "panel" + (st.roman ? "" : " hide-roman"));
    panel.style.maxHeight = Math.max(160, maxH) + "px";

    const top = mk("div", "top");
    top.appendChild(mk("span", "", "English → " + (NAMES[tl] || tl)));
    const x = mk("button", "x", "×");
    x.onclick = closePanel;
    top.appendChild(x);
    panel.appendChild(top);

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 10);
    for (const line of lines) {
      const card = mk("div", "card");
      card.appendChild(mk("div", "en", line));
      const head = mk("div", "head");
      const box = mk("div");
      const t = mk("div", "tr" + (rtl ? " rtl" : ""), "…");
      const r = mk("div", "ro", "");
      box.append(t, r);
      const spk = mk("button", "spk", "🔊");
      head.append(box, spk);
      card.appendChild(head);
      fill(line, tl, (res) => { t.textContent = res.t; r.textContent = res.r; t.title = res.err || ""; spk.onclick = () => speak(res.t, tl); });

      const words = mk("div", "words");
      const uniq = [];
      const seenW = new Set();
      for (const w of line.match(WORD_RE) || []) {
        const k = w.toLowerCase();
        if (!seenW.has(k)) { seenW.add(k); uniq.push(w); }
      }
      for (const w of uniq.slice(0, 60)) {
        const chip = mk("div", "chip");
        const ct = mk("span", "t" + (rtl ? " rtl" : ""), "…");
        const cr = mk("span", "r", "");
        chip.append(mk("span", "e", w), ct, cr);
        words.appendChild(chip);
        fill(w, tl, (res) => { ct.textContent = res.t; cr.textContent = res.r; ct.title = res.err || ""; chip.onclick = () => speak(res.t, tl); });
      }
      card.appendChild(words);
      panel.appendChild(card);
    }
    shadow.append(style, panel);
    document.documentElement.appendChild(host);
  }

  document.addEventListener("mouseup", (e) => {
    if (!st.enabled) return;
    if (host && e.composedPath().includes(host)) return;
    clearTimeout(selTimer);
    selTimer = setTimeout(showSelection, 250);
  });
  document.addEventListener("mousedown", (e) => {
    if (host && !e.composedPath().includes(host)) closePanel();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePanel(); });

  // ---------- state ----------
  function apply() {
    document.documentElement.classList.toggle("ewt-hide-roman", !st.roman);
    const wantPage = st.enabled && st.mode === "page";
    if (!wantPage) clearPage();
    else if (appliedKey !== st.lang) { clearPage(); startPage(); appliedKey = st.lang; }
    if (!st.enabled || st.mode !== "select") closePanel();
  }

  if (alive()) {
    chrome.storage.local.get(DEFAULTS, (v) => { st = Object.assign({}, DEFAULTS, v); apply(); });
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area !== "local" || !alive()) return;
      let touched = false;
      for (const k in ch) if (k in DEFAULTS) { st[k] = ch[k].newValue; touched = true; }
      if (touched) apply();
    });
  }
})();
