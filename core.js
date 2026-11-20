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

// ---------- API ----------
async function translate(text, tl) {
  const key = tl + "|" + text.toLowerCase();
  if (cache.has(key)) return cache.get(key);

  const url =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=" +
    encodeURIComponent(tl) +
    "&dt=t&dt=rm&q=" +
    encodeURIComponent(text);

  let data;
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Translate request failed (" + res.status + ")");
      data = await res.json();
      break;
    } catch (e) {
      if (attempt >= 2) throw e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }

  let t = "";
  let r = "";
  for (const seg of data[0] || []) {
    if (typeof seg[0] === "string") t += seg[0];
    else if (typeof seg[2] === "string") r += seg[2];
  }
  const cfg = LANGS[tl];
  if (!r && cfg.respell) r = cfg.respell(t);

  const out = { t: t.trim(), r: r.trim() };
  cache.set(key, out);
  return out;
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
