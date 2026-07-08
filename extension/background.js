/* global chrome */

/**
 * Yukti v3 background worker — thin proxy to the Vercel API.
 * No Firebase, no secrets. A random device id gives the POC rate limiting.
 * After `vercel deploy`, put your URL below.
 */

const YUKTI_API = "https://yukti-psi.vercel.app/api/enhance";

async function getDeviceId() {
  const { yuktiDeviceId } = await chrome.storage.local.get(["yuktiDeviceId"]);
  if (yuktiDeviceId) return yuktiDeviceId;
  const id = "ext-" + crypto.randomUUID();
  await chrome.storage.local.set({ yuktiDeviceId: id });
  return id;
}

// Session cache: same rough prompt + context → no duplicate billing
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "YUKTI_ENHANCE") return;

  (async () => {
    try {
      const key = JSON.stringify([message.body.prompt, message.body.targetModel, message.body.conversation]);
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < CACHE_TTL) {
        sendResponse(hit.data);
        return;
      }

      const deviceId = await getDeviceId();
      const res = await fetch(YUKTI_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...message.body, deviceId }),
      });
      const data = await res.json();

      if (data.success) {
        cache.set(key, { at: Date.now(), data });
        if (cache.size > 30) cache.delete(cache.keys().next().value);
      }
      sendResponse(data);
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
  })();

  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "enhance-inline") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "YUKTI_ENHANCE_INLINE" }).catch(() => {});
});
