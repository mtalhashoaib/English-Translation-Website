// English Word-by-Word Translator
// Translation + transliteration come from Google's public translate endpoint (dt=t & dt=rm).
// French, German, Dutch, Swedish, Norwegian and Danish have no transliteration
// from the API, so a rule-based English-style respelling is generated locally (approximate).

const LANGS = {
  "zh-CN": { speech: "zh-CN", rtl: false },
  de: { speech: "de-DE", rtl: false, respell: respellGerman },
  fr: { speech: "fr-FR", rtl: false, respell: respellFrench },
  ru: { speech: "ru-RU", rtl: false },
  ar: { speech: "ar-SA", rtl: true },
  fa: { speech: "fa-IR", rtl: true },
  ur: { speech: "ur-PK", rtl: true },
  ja: { speech: "ja-JP", rtl: false },
  ko: { speech: "ko-KR", rtl: false },
  nl: { speech: "nl-NL", rtl: false, respell: respellDutch },
  sv: { speech: "sv-SE", rtl: false, respell: respellSwedish },
  no: { speech: "nb-NO", rtl: false, respell: respellNorwegian },
  da: { speech: "da-DK", rtl: false, respell: respellDanish },
};

const cache = new Map();
const inflight = new Map();

// ---------- persistent cache (survives service-worker restarts and browser restarts) ----------
let pstore = {}, pready = null, psaveTimer = null;
function pload() {
  if (!pready) {
    pready = new Promise((res) => {
      try { chrome.storage.local.get({ ewtCache: {} }, (v) => { pstore = (v && v.ewtCache) || {}; res(); }); }
      catch (e) { res(); }
    });
  }
  return pready;
}
function psave() {
  clearTimeout(psaveTimer);
  psaveTimer = setTimeout(() => {
    const keys = Object.keys(pstore);
    if (keys.length > 4000) for (const k of keys.slice(0, keys.length - 3000)) delete pstore[k];
    try { chrome.storage.local.set({ ewtCache: pstore }); } catch (e) {}
  }, 500);
}

// ---------- network helpers ----------
const GOOGLE_HOSTS = ["translate.googleapis.com", "translate.google.com"];
let blockedUntil = 0; // cooldown after Google rate-limits us

async function hasHostAccess() {
  try { return await chrome.permissions.contains({ origins: ["https://translate.googleapis.com/*"] }); }
  catch (e) { return true; }
}

// Global limit on simultaneous network requests (keeps us gentle on free endpoints)
let netActive = 0; const netWait = [];
async function slot(fn) {
  if (netActive >= 4) await new Promise((r) => netWait.push(r));
  netActive++;
  try { return await fn(); }
  finally { netActive--; const n = netWait.shift(); if (n) n(); }
}

async function fetchJson(url, ms = 6000, init) {
  return slot(() => fetchJsonRaw(url, ms, init));
}

async function fetchJsonRaw(url, ms, init) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    let res;
    try {
      res = await fetch(url, Object.assign({}, init || {}, { signal: ctrl.signal }));
    } catch (e) {
      let err;
      if (e && e.name === "AbortError") {
        err = new Error("Translate request timed out");
        err.timeout = true;
      } else {
        const granted = await hasHostAccess();
        err = new Error(granted
          ? "Request blocked (check VPN/firewall/ISP)"
          : "Site access is withheld. Open chrome://extensions > Details > Site access and choose \"On all sites\"");
        err.network = true;
      }
      throw err;
    }
    if (!res.ok) {
      const err = new Error("Translate request failed (" + res.status + ")");
      err.status = res.status;
      throw err;
    }
    const raw = await res.text();
    try { return JSON.parse(raw); }
    catch (pe) { throw new Error("Unexpected non-JSON reply: " + raw.slice(0, 80).replace(/\s+/g, " ")); }
  } finally {
    clearTimeout(timer);
  }
}

let googleDownUntil = 0; // set when Google is unreachable, so we go straight to the fallback
const hostBlocked = {};   // per-host cooldown (rate limits), so one good host keeps working
function resetGoogle() { googleDownUntil = 0; for (const h of GOOGLE_HOSTS) hostBlocked[h] = 0; }
try {
  if (chrome.permissions && chrome.permissions.onAdded) chrome.permissions.onAdded.addListener(resetGoogle);
} catch (e) {}

async function googleTranslate(text, tl) {
  if (Date.now() < googleDownUntil) throw new Error("Google unreachable (using fallback)");
  const now = Date.now();
  // Hosts that are not cooling down, in preferred order
  const hosts = GOOGLE_HOSTS.filter((h) => (hostBlocked[h] || 0) <= now);
  if (!hosts.length) {
    const wait = Math.ceil((Math.min(...GOOGLE_HOSTS.map((h) => hostBlocked[h] || 0)) - now) / 1000);
    throw new Error("Google rate limit, retrying in " + wait + "s");
  }
  let lastErr;
  for (const host of hosts) {
    const url =
      "https://" + host + "/translate_a/single?client=gtx&sl=en&tl=" +
      encodeURIComponent(tl) + "&dt=t&dt=rm&q=" + encodeURIComponent(text);
    try {
      const data = await fetchJson(url);
      let t = "", r = "";
      for (const seg of data[0] || []) {
        if (typeof seg[0] === "string") t += seg[0];
        else if (typeof seg[2] === "string") r += seg[2];
      }
      if (!t.trim()) throw new Error("Empty translation");
      googleDownUntil = 0;
      return { t: t.trim(), r: r.trim() };
    } catch (e) {
      lastErr = e;
      if (e && e.status === 429) hostBlocked[host] = Date.now() + 60000; // this host only
      else if (e && e.timeout) hostBlocked[host] = Date.now() + 30000;
      else if (e && e.network) hostBlocked[host] = Date.now() + 120000;
    }
  }
  // Every host failed: if it was a network/permission problem, skip Google for a while
  if (lastErr && lastErr.network) googleDownUntil = Date.now() + 300000;
  throw lastErr;
}

function chunkText(text, max = 450) {
  if (text.length <= max) return [text];
  const parts = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
  const out = [];
  let cur = "";
  for (let p of parts) {
    while (p.length > max) {
      let cut = p.lastIndexOf(" ", max);
      if (cut < 1) cut = max;
      if (cur) { out.push(cur); cur = ""; }
      out.push(p.slice(0, cut));
      p = p.slice(cut);
    }
    if ((cur + p).length > max) { out.push(cur); cur = p; } else cur += p;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

async function myMemoryOne(text, tl) {
  const url = "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text) + "&langpair=en|" + encodeURIComponent(tl);
  const data = await fetchJson(url, 8000);
  const t = data && data.responseData && data.responseData.translatedText;
  const status = Number(data && data.responseStatus);
  if (!t || status !== 200 || /MYMEMORY WARNING|INVALID|QUERY LENGTH|LIMIT EXCEEDED|PLEASE SELECT/i.test(t)) {
    throw new Error("Fallback translator unavailable" + (status && status !== 200 ? " (" + status + ")" : ""));
  }
  return String(t).trim();
}

// Fallback when Google is blocked/limited (no native romanization; local respelling where available)
async function fallbackTranslate(text, tl) {
  const pieces = [];
  for (const c of chunkText(text)) pieces.push(await myMemoryOne(c, tl));
  return { t: pieces.join(" "), r: "" };
}

// ---------- Google batching: many words in ONE request ----------
const batchQ = {};
const batchBad = {}; // language -> true if Google's reply could not be split back per word
function batchGoogle(text, tl) {
  return new Promise((resolve, reject) => {
    const q = batchQ[tl] || (batchQ[tl] = { items: [], timer: null });
    q.items.push({ text, resolve, reject });
    if (q.items.length >= 25) flushBatch(tl);
    else if (!q.timer) q.timer = setTimeout(() => flushBatch(tl), 60);
  });
}
async function flushBatch(tl) {
  const q = batchQ[tl];
  if (!q) return;
  clearTimeout(q.timer);
  delete batchQ[tl];
  const items = q.items;
  const single = () => items.forEach((it) => googleTranslate(it.text, tl).then(it.resolve, it.reject));
  if (items.length === 1 || batchBad[tl]) return single();
  try {
    const res = await googleBatch(items.map((i) => i.text), tl);
    items.forEach((it, i) => it.resolve(res[i]));
  } catch (e) {
    if (e && e.misaligned) batchBad[tl] = true;
    if (e && (e.network || e.status === 429 || e.timeout)) items.forEach((it) => it.reject(e));
    else single();
  }
}
async function googleBatch(texts, tl) {
  const now = Date.now();
  if (now < googleDownUntil) throw new Error("Google unreachable (using fallback)");
  const hosts = GOOGLE_HOSTS.filter((h) => (hostBlocked[h] || 0) <= now);
  if (!hosts.length) throw new Error("Google rate limit, using other translators");
  let lastErr;
  for (const host of hosts) {
    const url = "https://" + host + "/translate_a/single?client=gtx&sl=en&tl=" + encodeURIComponent(tl) +
      "&dt=t&dt=rm&q=" + encodeURIComponent(texts.join("\n"));
    try {
      const data = await fetchJson(url);
      const ts = [], rs = [];
      for (const seg of data[0] || []) {
        if (typeof seg[0] === "string") ts.push(seg[0].replace(/\n+$/, "").trim());
        else if (typeof seg[2] === "string") rs.push(seg[2]);
      }
      if (ts.length !== texts.length) { const e = new Error("Batch reply misaligned"); e.misaligned = true; throw e; }
      let rl = rs.join("\n").split(/\s*\n\s*/).map((x) => x.trim()).filter((x, i, a) => !(x === "" && i === a.length - 1));
      const needsRoman = rs.length > 0;
      if (needsRoman && rl.length !== texts.length) { const e = new Error("Batch romanization misaligned"); e.misaligned = true; throw e; }
      googleDownUntil = 0;
      return texts.map((_, i) => ({ t: ts[i] || "", r: needsRoman ? rl[i] || "" : "" })).map((o) => {
        if (!o.t) { const e = new Error("Empty translation"); throw e; }
        return o;
      });
    } catch (e) {
      lastErr = e;
      if (e && e.misaligned) throw e;
      if (e && e.status === 429) hostBlocked[host] = Date.now() + 60000;
      else if (e && e.timeout) hostBlocked[host] = Date.now() + 30000;
      else if (e && e.network) hostBlocked[host] = Date.now() + 120000;
    }
  }
  if (lastErr && lastErr.network) googleDownUntil = Date.now() + 300000;
  throw lastErr;
}

// ---------- Extra translators (unofficial, no API key) ----------
const MS_CODES = { "zh-CN": "zh-Hans", no: "nb" };
let msToken = null, msTokenAt = 0;
async function msTranslate(text, tl) {
  if (!msToken || Date.now() - msTokenAt > 8 * 60000) {
    const r = await slot(() => fetch("https://edge.microsoft.com/translate/auth"));
    if (!r.ok) { const e = new Error("Microsoft auth failed (" + r.status + ")"); e.status = r.status; throw e; }
    msToken = (await r.text()).trim();
    msTokenAt = Date.now();
  }
  const to = MS_CODES[tl] || tl;
  const url = "https://api-edge.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en&to=" + encodeURIComponent(to);
  let data;
  try {
    data = await fetchJson(url, 8000, {
      method: "POST",
      headers: { Authorization: "Bearer " + msToken, "Content-Type": "application/json" },
      body: JSON.stringify([{ Text: text }]),
    });
  } catch (e) { if (e && e.status === 401) msToken = null; throw e; }
  const t = data && data[0] && data[0].translations && data[0].translations[0] && data[0].translations[0].text;
  if (!t) throw new Error("Microsoft returned nothing");
  return { t: String(t).trim(), r: "" };
}

const LINGVA_HOSTS = ["lingva.ml", "lingva.thedaviddelta.com"];
async function lingvaTranslate(text, tl) {
  const to = tl === "zh-CN" ? "zh" : tl;
  let lastErr;
  for (const h of LINGVA_HOSTS) {
    try {
      const data = await fetchJson("https://" + h + "/api/v1/en/" + encodeURIComponent(to) + "/" + encodeURIComponent(text), 8000);
      if (data && typeof data.translation === "string" && data.translation.trim()) return { t: data.translation.trim(), r: "" };
      throw new Error("Lingva returned nothing");
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

// Order tried after Google. Each gets a cooldown after failing so a dead service is skipped quickly.
const PROVIDERS = [
  { name: "Microsoft", fn: msTranslate },
  { name: "Lingva", fn: lingvaTranslate },
  { name: "MyMemory", fn: fallbackTranslate },
];
const provBlocked = {};

// ---------- API ----------
async function translate(text, tl) {
  const key = tl + "|" + text.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  await pload();
  if (pstore[key]) { cache.set(key, pstore[key]); return pstore[key]; }
  if (inflight.has(key)) return inflight.get(key);

  const job = (async () => {
    const cfg = LANGS[tl];
    let out, viaGoogle = true;
    const isWord = !/\s/.test(text);
    try {
      out = isWord ? await batchGoogle(text, tl) : await googleTranslate(text, tl);
    } catch (gErr) {
      viaGoogle = false;
      const errs = [gErr.message];
      for (const p of PROVIDERS) {
        if ((provBlocked[p.name] || 0) > Date.now()) { errs.push(p.name + ": cooling down"); continue; }
        try { out = await p.fn(text, tl); break; }
        catch (e) {
          provBlocked[p.name] = Date.now() + (e && e.status === 429 ? 120000 : 60000);
          errs.push(p.name + ": " + e.message);
        }
      }
      if (!out) throw new Error(errs.join(" | "));
    }
    if (!out.r && cfg && cfg.respell) out.r = cfg.respell(out.t);
    cache.set(key, out);
    if (viaGoogle) { pstore[key] = out; psave(); }
    return out;
  })();
  inflight.set(key, job);
  try { return await job; } finally { inflight.delete(key); }
}

// Run async jobs with limited concurrency
async function pool(jobs, limit = 6) {
  let i = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (i < jobs.length) await jobs[i++]();
  });
  await Promise.all(workers);
}

// ---------- Pronunciation respelling (approximate) ----------
function replaceByMap(word, map) {
  const keys = Object.keys(map).sort((a, b) => b.length - a.length);
  const re = new RegExp(keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
  return word.replace(re, (m) => map[m]);
}

function respellFrench(text) {
  const map = {
    eau: "oh", aux: "oh", au: "oh", ou: "oo", oi: "wah", ai: "eh", ei: "eh",
    eu: "uh", "œu": "uh", "œ": "uh", ch: "sh", gn: "ny", qu: "k", ph: "f",
    tion: "syon", ill: "ee-y", ain: "an", ein: "an", an: "ahn", am: "ahn",
    en: "ahn", em: "ahn", in: "an", im: "an", on: "awn", om: "awn", un: "uhn",
    "ç": "s", "é": "ay", "è": "eh", "ê": "eh", "ë": "eh", "à": "ah", "â": "ah",
    "î": "ee", "ï": "ee", "ô": "oh", "û": "ew", "ù": "ew", "ü": "ew", u: "ew",
    ge: "zhuh", gi: "zhee", j: "zh", ci: "see", ce: "suh", c: "k", h: "", y: "ee",
    e: "uh", x: "ks", w: "v",
  };
  return text
    .toLowerCase()
    .split(/(\s+)/)
    .map((w) => {
      if (!w.trim()) return w;
      let core = w.replace(/[.,!?;:"()]/g, "");
      const punct = w.slice(core.length);
      // drop silent final letters
      core = core.replace(/(?<=[aeiouyéèêàâîôû])(s|t|d|x|z|p)$/, "").replace(/(?<=[^aeiou])e$/, "").replace(/es$/, "");
      return replaceByMap(core, map).replace(/-+/g, "-") + punct;
    })
    .join("");
}

function respellGerman(text) {
  const map = {
    tsch: "ch", sch: "sh", ch: "kh", ei: "eye", ey: "eye", ai: "eye", ie: "ee",
    eu: "oy", "äu": "oy", "ä": "eh", "ö": "er", "ü": "ew", ß: "ss", qu: "kv",
    th: "t", pf: "pf", z: "ts", v: "f", w: "v", j: "y", ck: "k", ng: "ng",
    "au": "ow", ig: "ikh", er: "er", u: "oo", a: "ah", i: "ih", e: "eh",
  };
  return text
    .toLowerCase()
    .split(/(\s+)/)
    .map((w) => {
      if (!w.trim()) return w;
      let core = w.replace(/[.,!?;:"()]/g, "");
      const punct = w.slice(core.length);
      core = core.replace(/^sp/, "SHP").replace(/^st/, "SHT").replace(/^s(?=[aeiouäöü])/, "Z");
      core = core.replace(/(?<=[^aeiouäöü])en$/, "UHN").replace(/(?<=[^aeiouäöü])er$/, "UH").replace(/(?<=[^aeiouäöü])e$/, "UH");
      return replaceByMap(core, map).toLowerCase() + punct;
    })
    .join("");
}

// Shared helper: respell each word, keeping spaces and punctuation
function respellEach(text, fn) {
  return text
    .toLowerCase()
    .split(/(\s+)/)
    .map((w) => {
      if (!w.trim()) return w;
      const core = w.replace(/[.,!?;:"()«»„“”]/g, "");
      const punct = w.slice(core.length);
      return fn(core) + punct;
    })
    .join("");
}

function respellDutch(text) {
  const map = {
    sch: "s-kh", ij: "ay", ei: "ay", ui: "ow", oe: "oo", eu: "er", ou: "ow", au: "ow",
    aa: "ah", ee: "ay", oo: "oh", uu: "ew", ch: "kh", g: "kh", sj: "sh", tj: "ch",
    j: "y", w: "v", v: "v", ck: "k", "é": "ay", "ë": "eh", "ï": "ee",
  };
  return respellEach(text, (core) => replaceByMap(core.replace(/en$/, "uh"), map));
}

function respellSwedish(text) {
  const map = {
    stj: "sh", skj: "sh", sj: "sh", tj: "ch", kj: "ch", ck: "k", j: "y",
    "å": "aw", "ä": "eh", "ö": "er", y: "ew", u: "oo", w: "v",
  };
  return respellEach(text, (core) => {
    core = core.replace(/sk(?=[eiyäö])/g, "sh").replace(/(?<!c)k(?=[eiyäö])/g, "ch").replace(/g(?=[eiyäö])/g, "y");
    return replaceByMap(core, map);
  });
}

function respellNorwegian(text) {
  const map = {
    skj: "sh", sj: "sh", kj: "ch", tj: "ch", hj: "y", gj: "y", hv: "v",
    "øy": "oy", ei: "ay", au: "ow", ck: "k", j: "y",
    "å": "aw", "æ": "eh", "ø": "er", y: "ew", w: "v",
  };
  return respellEach(text, (core) => {
    core = core.replace(/sk(?=[eiyøæ])/g, "sh").replace(/(?<!c)k(?=[iy])/g, "ch").replace(/g(?=[iyøæ])/g, "y");
    return replaceByMap(core, map);
  });
}

// Danish pronunciation is very irregular; this is only a rough guide.
function respellDanish(text) {
  const map = {
    sj: "sh", hv: "v", ej: "eye", ei: "eye", "øj": "oy", "øe": "oy", aa: "aw",
    "å": "aw", "æ": "eh", "ø": "er", y: "ew", u: "oo", j: "y", w: "v", ck: "k",
  };
  return respellEach(text, (core) => {
    core = core.replace(/(?<=[aeiouyæøå])d(?![a-zæøå])/g, "dh").replace(/(?<=[aeiouyæøå])g$/g, "");
    return replaceByMap(core, map);
  });
}
