importScripts("core.js");

// Limit parallel requests to the translate service
const queue = [];
let active = 0;
const MAX = 3; // gentle on the free endpoint

function run(job) {
  return new Promise((resolve, reject) => {
    queue.push({ job, resolve, reject });
    pump();
  });
}
function pump() {
  while (active < MAX && queue.length) {
    const q = queue.shift();
    active++;
    q.job().then(q.resolve, q.reject).finally(() => { active--; setTimeout(pump, 80); });
  }
}

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (msg && msg.type === "translate") {
    translate(msg.text, msg.tl)
      .then((r) => send({ ok: true, t: r.t, r: r.r }))
      .catch((e) => send({ ok: false, error: String(e) }));
    return true; // async response
  }
});

// Badge shows when on-page translation is enabled
function badge(on) {
  chrome.action.setBadgeText({ text: on ? "ON" : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#c96442" });
}
chrome.storage.local.get({ enabled: false }, (v) => badge(v.enabled));
chrome.storage.onChanged.addListener((ch, area) => {
  if (area === "local" && ch.enabled) badge(ch.enabled.newValue);
});

// Make it work on tabs that were already open when the extension was installed/reloaded
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  for (const tab of tabs) {
    try {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["content.css"] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    } catch (e) {}
  }
});
