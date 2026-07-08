/* global chrome */

const DEFAULTS = {
  enabled: true,
  piiShield: true,
  profileAbout: "",
  profileProject: "",
  profileTone: "",
  dictionary: "",
  voiceLang: "en-IN",
};

// Must mirror content.js — used to render learned strings in the popup.
function learnedStrings(memory) {
  const learned = [];
  const total = memory.totalEnhancements || 1;

  const topStacks = Object.entries(memory.stacks || {})
    .filter(([, c]) => c >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => t);
  if (topStacks.length) learned.push(`Frequently works with: ${topStacks.join(", ")}`);

  const topIntent = Object.entries(memory.intents || {}).sort((a, b) => b[1] - a[1])[0];
  if (topIntent && topIntent[1] >= 5) learned.push(`Most prompts are ${topIntent[0]}-related`);

  if ((memory.hinglishCount || 0) / total > 0.3) {
    learned.push("Often writes rough prompts in Hinglish; wants polished English output");
  }
  if ((memory.edited || 0) / total > 0.4 && total >= 5) {
    learned.push("Often trims enhanced prompts — keep enhancements tight and short");
  }
  const catOf = (s) => (s.includes(":") ? s.slice(0, s.indexOf(":")) : s);
  return learned.filter((s) => !(memory.muted || []).some((mu) => catOf(mu) === catOf(s)));
}

function renderMemory() {
  chrome.storage.local.get(["yuktiMemory"], ({ yuktiMemory }) => {
    const memory = yuktiMemory || {};
    const list = document.getElementById("memoryList");
    const stats = document.getElementById("stats");

    const total = memory.totalEnhancements || 0;
    if (total > 0) {
      const sent = memory.sentAsIs || 0;
      const rate = Math.round((sent / Math.max(1, sent + (memory.edited || 0) + (memory.undone || 0))) * 100);
      stats.textContent = `${total} prompts enhanced · ${isNaN(rate) ? 0 : rate}% sent without edits`;
    } else {
      stats.textContent = "Free & private — Yukti learns on your device.";
    }

    const learned = learnedStrings(memory);
    list.textContent = "";
    if (!learned.length) {
      const p = document.createElement("p");
      p.className = "hint";
      p.textContent = "Nothing yet — Yukti learns as you enhance.";
      list.appendChild(p);
      return;
    }
    for (const item of learned) {
      const row = document.createElement("div");
      row.className = "memory-item";
      const span = document.createElement("span");
      span.textContent = item;
      const del = document.createElement("button");
      del.textContent = "×";
      del.className = "memory-del";
      del.title = "Forget this — Yukti won't re-learn it";
      del.onclick = () => {
        memory.muted = [...(memory.muted || []), item];
        chrome.storage.local.set({ yuktiMemory: memory }, renderMemory);
      };
      row.append(span, del);
      list.appendChild(row);
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const ids = Object.keys(DEFAULTS);
  const els = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
  const status = document.getElementById("status");

  chrome.storage.sync.get(DEFAULTS, (s) => {
    els.enabled.checked = s.enabled;
    els.piiShield.checked = s.piiShield;
    els.profileAbout.value = s.profileAbout;
    els.profileProject.value = s.profileProject;
    els.profileTone.value = s.profileTone;
    els.dictionary.value = s.dictionary;
    els.voiceLang.value = s.voiceLang;
  });

  renderMemory();

<<<<<<< HEAD
  // v3.2: show dashboard-synced account + tools
  chrome.storage.sync.get({ yuktiTools: [], yuktiAccount: null }, (r) => {
    const stats = document.getElementById("stats");
    if (r.yuktiAccount?.email) {
      stats.textContent += (stats.textContent ? "  ·  " : "") +
        r.yuktiAccount.email + " · " + (r.yuktiTools.length || "all") + " tools";
    }
  });

=======
>>>>>>> 17b8447ecb7535ff20e1dd5bc66fb4cbed3956f6
  document.getElementById("saveBtn").addEventListener("click", () => {
    chrome.storage.sync.set(
      {
        enabled: els.enabled.checked,
        piiShield: els.piiShield.checked,
        profileAbout: els.profileAbout.value.trim(),
        profileProject: els.profileProject.value.trim(),
        profileTone: els.profileTone.value.trim(),
        dictionary: els.dictionary.value.trim(),
        voiceLang: els.voiceLang.value,
      },
      () => {
        status.textContent = "Saved ✅";
        setTimeout(() => (status.textContent = ""), 1600);
      }
    );
  });
});
