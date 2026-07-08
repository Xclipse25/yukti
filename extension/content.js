/* global chrome, webkitSpeechRecognition */

/**
 * Yukti v3.1 content script — the "never want to stop using it" build.
 *
 * Core loop (v3): ✨ pill on every chat input → one click / Ctrl+M →
 * prompt transformed in place, undo toast with score jump.
 *
 * New in v3.1 — the moat features:
 *  1. FEEDBACK SIGNALS: every enhancement's fate is tracked — sent as-is,
 *     edited first, or undone. This is the raw data Yukti learns from.
 *  2. YUKTI MEMORY: local heuristics turn signals into learned preferences
 *     ("often works with React", "writes Hinglish") that shape every future
 *     enhancement. Stored locally, visible & deletable in the popup.
 *  3. VOICE INPUT (🎤): speak your rough thought; Yukti transcribes it into
 *     the chat box and enhances it in one motion. Web Speech API — free.
 *  4. HANDOFF (⇄): continue this conversation in a different AI tool —
 *     Yukti builds a context-carrying prompt, copies it, opens the tool.
 */

console.log("Yukti v3.1 loaded:", location.hostname);

// ---------------------------------------------------------------------------
// Site adapters
// ---------------------------------------------------------------------------

const GENERIC_INPUTS = [
  "div[role='textbox'][contenteditable='true']",
  "textarea[placeholder*='essage' i]",
  "textarea[aria-label*='essage' i]",
  "textarea[placeholder*='ask' i]",
  "[contenteditable='true']",
  "textarea",
];

const SITE_ADAPTERS = [
  { name: "ChatGPT", hosts: ["chatgpt.com"], targetModel: "chatgpt",
    inputs: ["#prompt-textarea", "div.ProseMirror[contenteditable='true']", ...GENERIC_INPUTS],
    userMsgs: "[data-message-author-role='user']",
    aiMsgs: "[data-message-author-role='assistant']" },
  { name: "Claude", hosts: ["claude.ai"], targetModel: "claude",
    inputs: ["div.ProseMirror[contenteditable='true']", ...GENERIC_INPUTS],
    userMsgs: "[data-testid='user-message']",
    aiMsgs: "[data-testid='assistant-message'], .font-claude-message" },
  { name: "Gemini", hosts: ["gemini.google.com"], targetModel: "gemini",
    inputs: ["rich-textarea div[contenteditable='true']", ...GENERIC_INPUTS],
    userMsgs: "user-query", aiMsgs: "message-content, model-response" },
  { name: "Copilot", hosts: ["copilot.microsoft.com"], targetModel: "copilot",
    inputs: ["textarea#userInput", ...GENERIC_INPUTS],
    userMsgs: "[data-content='user-message']", aiMsgs: "[data-content='ai-message']" },
  { name: "Perplexity", hosts: ["perplexity.ai"], targetModel: "chatgpt", inputs: GENERIC_INPUTS },
  { name: "DeepSeek", hosts: ["chat.deepseek.com"], targetModel: "chatgpt", inputs: GENERIC_INPUTS },
  { name: "Mistral", hosts: ["chat.mistral.ai"], targetModel: "chatgpt", inputs: GENERIC_INPUTS },
  { name: "Grok", hosts: ["grok.com", "x.com"], targetModel: "chatgpt", inputs: GENERIC_INPUTS, pathHint: "grok" },
  { name: "Poe", hosts: ["poe.com"], targetModel: "generic", inputs: GENERIC_INPUTS },
  { name: "Meta AI", hosts: ["meta.ai"], targetModel: "generic", inputs: GENERIC_INPUTS },
  { name: "HuggingChat", hosts: ["huggingface.co"], targetModel: "generic", inputs: GENERIC_INPUTS, pathHint: "/chat" },
  { name: "Midjourney", hosts: ["midjourney.com"], targetModel: "midjourney", inputs: GENERIC_INPUTS },
  { name: "Leonardo", hosts: ["leonardo.ai"], targetModel: "image", inputs: GENERIC_INPUTS },
  { name: "Ideogram", hosts: ["ideogram.ai"], targetModel: "image", inputs: GENERIC_INPUTS },
  { name: "Krea", hosts: ["krea.ai"], targetModel: "image", inputs: GENERIC_INPUTS },
];

const HANDOFF_TARGETS = [
  { name: "ChatGPT", url: "https://chatgpt.com/" },
  { name: "Claude", url: "https://claude.ai/new" },
  { name: "Gemini", url: "https://gemini.google.com/app" },
];

function getAdapter() {
  const host = location.hostname.toLowerCase();
  for (const a of SITE_ADAPTERS) {
    if (!a.hosts.some((h) => host === h || host.endsWith("." + h))) continue;
    if (a.pathHint && !location.href.toLowerCase().includes(a.pathHint)) continue;
    return a;
  }
  return null;
}

const adapter = getAdapter();

// ---------------------------------------------------------------------------
// Input helpers
// ---------------------------------------------------------------------------

function visible(el) {
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  return r.width > 80 && r.height > 18 && s.visibility !== "hidden" && s.display !== "none";
}

function findPromptInput() {
  if (!adapter) return null;
  for (const sel of adapter.inputs) {
    try {
      const found = Array.from(document.querySelectorAll(sel)).filter(visible);
      if (found.length) return found[found.length - 1];
    } catch { /* skip invalid selector */ }
  }
  return null;
}

function getInputText(input = findPromptInput()) {
  if (!input) return "";
  return (input.value ?? input.innerText ?? "").trim();
}

function setInputText(text) {
  const input = findPromptInput();
  if (!input) return false;
  input.focus();

  if ("value" in input && input.tagName !== "DIV") {
    const proto = input.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(input, text); else input.value = text;
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  if (input.isContentEditable) {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(input);
    sel.removeAllRanges();
    sel.addRange(range);
    if (!document.execCommand("insertText", false, text)) {
      input.innerHTML = "";
      input.textContent = text;
      input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Conversation capture
// ---------------------------------------------------------------------------

function lastText(selector) {
  if (!selector) return null;
  try {
    const nodes = Array.from(document.querySelectorAll(selector)).filter(visible);
    if (!nodes.length) return null;
    const text = (nodes[nodes.length - 1].innerText || "").trim();
    return text.length > 5 ? text : null;
  } catch { return null; }
}

function captureConversation() {
  const convo = [];
  const user = lastText(adapter?.userMsgs);
  const ai = lastText(adapter?.aiMsgs);
  if (user) convo.push({ role: "user", text: user.slice(0, 900) });
  if (ai) convo.push({ role: "assistant", text: ai.slice(0, 900) });
  return convo;
}

// ---------------------------------------------------------------------------
// PII Shield
// ---------------------------------------------------------------------------

const PII_PATTERNS = [
  { tag: "EMAIL", re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { tag: "PHONE", re: /(?:\+?\d{1,3}[-.\s]?)?(?:\d{5}[-.\s]?\d{5}|\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})\b/g },
  { tag: "CARD",  re: /\b(?:\d[ -]?){13,19}\b/g },
  { tag: "APIKEY", re: /\b(?:sk|pk|AIza|ghp|gho|xox[baprs]|AKIA)[A-Za-z0-9_\-.]{10,}\b/g },
];

function redactPII(text) {
  const map = new Map();
  let out = text;
  for (const { tag, re } of PII_PATTERNS) {
    let i = 0;
    out = out.replace(re, (m) => { const p = `[${tag}_${++i}]`; map.set(p, m); return p; });
  }
  return { redacted: out, map };
}

function restorePII(text, map) {
  let out = text;
  for (const [p, o] of map) out = out.split(p).join(o);
  return out;
}

// ---------------------------------------------------------------------------
// 1. FEEDBACK SIGNALS + 2. YUKTI MEMORY — the learning loop
// ---------------------------------------------------------------------------

const STACK_TERMS = [
  "react", "python", "javascript", "typescript", "node", "django", "flask",
  "flutter", "java", "kotlin", "swift", "c++", "firebase", "sql", "mongodb",
  "tailwind", "next.js", "nextjs", "vue", "angular", "excel", "figma",
  "photoshop", "unity", "aws", "docker",
];

const HINGLISH_WORDS = [
  "hai", "karo", "banao", "chahiye", "mujhe", "kaise", "krna", "karna",
  "bhai", "yaar", "nahi", "acha", "accha", "kya", "mera", "meri", "wala",
];

const EMPTY_MEMORY = {
  totalEnhancements: 0,
  sentAsIs: 0,
  edited: 0,
  undone: 0,
  stacks: {},       // term -> count
  intents: {},      // intent -> count
  hinglishCount: 0,
  scoreSum: 0,      // sum of original scores, for average
  muted: [],        // learned strings the user deleted — never re-suggest
};

async function getMemory() {
  const { yuktiMemory } = await chrome.storage.local.get(["yuktiMemory"]);
  return { ...EMPTY_MEMORY, ...(yuktiMemory || {}) };
}

async function saveMemory(memory) {
  await chrome.storage.local.set({ yuktiMemory: memory });
}

const INTENT_RULES = [
  ["coding", ["code", "bug", "error", "fix", "react", "python", "javascript", "html", "css", "app", "function", "api"]],
  ["writing", ["email", "message", "rewrite", "caption", "essay", "letter", "post", "blog"]],
  ["image", ["image", "photo", "picture", "logo", "art", "draw", "design"]],
  ["business", ["business", "startup", "market", "pitch", "customer", "revenue"]],
  ["learning", ["explain", "learn", "teach", "roadmap", "interview", "difference"]],
];

function detectIntent(prompt) {
  const p = prompt.toLowerCase();
  for (const [intent, words] of INTENT_RULES) {
    if (words.some((w) => p.includes(w))) return intent;
  }
  return "general";
}

function detectHinglish(prompt) {
  if (/[\u0900-\u097F]/.test(prompt)) return true; // Devanagari script
  const words = prompt.toLowerCase().split(/\s+/);
  const hits = words.filter((w) => HINGLISH_WORDS.includes(w)).length;
  return hits >= 2;
}

/** Called on every enhancement: update what Yukti knows about this user. */
async function learnFromPrompt(prompt, originalScore) {
  const memory = await getMemory();
  memory.totalEnhancements += 1;
  if (originalScore) memory.scoreSum += originalScore;

  const p = prompt.toLowerCase();
  for (const term of STACK_TERMS) {
    if (p.includes(term)) memory.stacks[term] = (memory.stacks[term] || 0) + 1;
  }
  const intent = detectIntent(prompt);
  memory.intents[intent] = (memory.intents[intent] || 0) + 1;
  if (detectHinglish(prompt)) memory.hinglishCount += 1;

  await saveMemory(memory);
  return memory;
}

/** Called when we know an enhancement's fate. */
async function recordOutcome(outcome) {
  const memory = await getMemory();
  if (outcome === "sent") memory.sentAsIs += 1;
  if (outcome === "edited") memory.edited += 1;
  if (outcome === "undone") memory.undone += 1;
  await saveMemory(memory);
}

/** Turn raw memory into human-readable learned preferences. */
function learnedStrings(memory) {
  const learned = [];
  const total = memory.totalEnhancements || 1;

  const topStacks = Object.entries(memory.stacks)
    .filter(([, c]) => c >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t]) => t);
  if (topStacks.length) learned.push(`Frequently works with: ${topStacks.join(", ")}`);

  const topIntent = Object.entries(memory.intents).sort((a, b) => b[1] - a[1])[0];
  if (topIntent && topIntent[1] >= 5) learned.push(`Most prompts are ${topIntent[0]}-related`);

  if (memory.hinglishCount / total > 0.3) {
    learned.push("Often writes rough prompts in Hinglish; wants polished English output");
  }
  if (memory.edited / total > 0.4 && total >= 5) {
    learned.push("Often trims enhanced prompts — keep enhancements tight and short");
  }

  // Mute by CATEGORY (text before ":"), so "Frequently works with: react"
  // stays muted even when it later evolves to "react, firebase".
  const catOf = (s) => (s.includes(":") ? s.slice(0, s.indexOf(":")) : s);
  return learned.filter((s) => !memory.muted.some((mu) => catOf(mu) === catOf(s)));
}

// --- Outcome watcher: after an enhancement, learn its fate -------------------
let pendingOutcome = null; // { enhancedText, edited }

function armOutcomeWatcher(enhancedText) {
  pendingOutcome = { enhancedText, edited: false };
}

function checkOutcome() {
  if (!pendingOutcome) return;
  const current = getInputText();

  if (current === "") {
    // Input emptied → the message was sent
    recordOutcome(pendingOutcome.edited ? "edited" : "sent");
    pendingOutcome = null;
    return;
  }
  if (current !== pendingOutcome.enhancedText) {
    pendingOutcome.edited = true; // user is modifying before sending
  }
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

let toastTimer = null;
function toast(message, kind = "info", actionLabel = null, onAction = null) {
  document.getElementById("yukti-toast")?.remove();
  clearTimeout(toastTimer);
  const el = document.createElement("div");
  el.id = "yukti-toast";
  el.className = `yukti-toast yukti-toast-${kind}`;
  const span = document.createElement("span");
  span.textContent = message;
  el.appendChild(span);
  if (actionLabel && onAction) {
    const btn = document.createElement("button");
    btn.textContent = actionLabel;
    btn.className = "yukti-toast-action";
    btn.onclick = () => { onAction(); el.remove(); };
    el.appendChild(btn);
  }
  document.body.appendChild(el);
  toastTimer = setTimeout(() => el.remove(), 7000);
}

// ---------------------------------------------------------------------------
// Core: one-click enhance (now memory- and dictionary-aware)
// ---------------------------------------------------------------------------

let busy = false;

async function enhanceNow() {
  if (busy || !adapter) return;
  const rough = getInputText();
  if (!rough || rough.length < 3) {
    toast("Type or speak your rough prompt first, then ✨ (or Ctrl+M).");
    return;
  }

  busy = true;
  document.getElementById("yukti-btn-enhance")?.classList.add("yukti-busy");

  const settings = await chrome.storage.sync.get({
    enabled: true, piiShield: true,
    profileAbout: "", profileProject: "", profileTone: "",
    dictionary: "",
  });

  const { redacted, map } = settings.piiShield ? redactPII(rough) : { redacted: rough, map: new Map() };
  if (map.size) toast(`PII Shield: ${map.size} sensitive item(s) redacted locally.`, "info");

  try {
    const memory = await learnFromPrompt(rough, null);

    const response = await chrome.runtime.sendMessage({
      type: "YUKTI_ENHANCE",
      body: {
        prompt: redacted,
        targetModel: adapter.targetModel,
        conversation: captureConversation(),
        profile: {
          about: settings.profileAbout,
          project: settings.profileProject,
          tone: settings.profileTone,
        },
        memory: learnedStrings(memory),
        dictionary: settings.dictionary
          .split(",").map((t) => t.trim()).filter(Boolean).slice(0, 30),
      },
    });

    if (!response?.success) {
      throw Object.assign(new Error(response?.message || response?.error || "Failed"), { code: response?.error });
    }

    const finalPrompt = restorePII(response.prompt, map);

    if (setInputText(finalPrompt)) {
      // Update memory with the real score now that we have it
      if (response.originalScore != null) {
        const m = await getMemory();
        m.scoreSum += response.originalScore;
        await saveMemory(m);
      }
      armOutcomeWatcher(finalPrompt);

      const scoreMsg =
        response.originalScore != null
          ? `${response.originalScore} → ${response.score}${response.reason ? " · " + response.reason : ""}`
          : "Prompt enhanced.";
      const remainingMsg = response.remaining != null ? `  (${response.remaining} left today)` : "";
      toast(scoreMsg + remainingMsg, "success", "Undo", () => {
        setInputText(rough);
        recordOutcome("undone");
        pendingOutcome = null;
      });
    }
  } catch (err) {
    if (err.code === "RATE_LIMITED") toast("Daily free limit reached — resets at midnight UTC.", "error");
    else toast("Yukti couldn't enhance right now. Try again.", "error");
    console.warn("Yukti enhance error:", err);
  } finally {
    busy = false;
    document.getElementById("yukti-btn-enhance")?.classList.remove("yukti-busy");
  }
}

// ---------------------------------------------------------------------------
// 3. VOICE INPUT — speak rough, get expert
// ---------------------------------------------------------------------------

let recognition = null;
let listening = false;

function voiceSupported() {
  return typeof webkitSpeechRecognition !== "undefined" || typeof SpeechRecognition !== "undefined";
}

async function toggleVoice() {
  const micBtn = document.getElementById("yukti-btn-voice");

  if (listening) {
    recognition?.stop();
    return;
  }
  if (!voiceSupported()) {
    toast("Voice input isn't supported in this browser.", "error");
    return;
  }

  const { voiceLang } = await chrome.storage.sync.get({ voiceLang: "en-IN" });
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new Rec();
  recognition.lang = voiceLang;
  recognition.continuous = true;
  recognition.interimResults = true;

  let finalTranscript = "";

  recognition.onstart = () => {
    listening = true;
    micBtn?.classList.add("yukti-listening");
    toast("Listening… speak your rough prompt, click 🎤 again to finish.");
  };

  recognition.onresult = (event) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += t + " ";
      else interim += t;
    }
    setInputText((finalTranscript + interim).trim());
  };

  recognition.onerror = (event) => {
    listening = false;
    micBtn?.classList.remove("yukti-listening");
    if (event.error === "not-allowed") {
      toast("Microphone blocked. Allow mic access for this site and try again.", "error");
    } else if (event.error !== "aborted") {
      toast("Voice input error: " + event.error, "error");
    }
  };

  recognition.onend = () => {
    listening = false;
    micBtn?.classList.remove("yukti-listening");
    const spoken = getInputText();
    if (spoken && spoken.length >= 3) {
      enhanceNow(); // speak → enhance, one motion
    }
  };

  try { recognition.start(); } catch { /* already started */ }
}

// ---------------------------------------------------------------------------
// 4. HANDOFF — continue this conversation in another AI
// ---------------------------------------------------------------------------

function buildHandoffPrompt() {
  const convo = captureConversation();
  const draft = getInputText();
  const parts = [
    `I'm continuing a conversation that started in ${adapter?.name || "another AI tool"}. Here is the context so far:`,
  ];
  for (const m of convo) {
    parts.push(`\n${m.role === "assistant" ? "Previous AI response" : "My previous message"}:\n"""${m.text}"""`);
  }
  parts.push(
    draft
      ? `\nNow continue from there. My next request:\n${draft}`
      : `\nPlease confirm you understand the context, then continue helping me from exactly where this left off.`
  );
  return parts.join("\n");
}

async function toggleHandoffMenu() {
  const existing = document.getElementById("yukti-handoff-menu");
  if (existing) { existing.remove(); return; }

  const cluster = document.getElementById("yukti-cluster");
  if (!cluster) return;

  // Filter targets by the user's dashboard tool choices (if any were saved)
  const { yuktiTools } = await chrome.storage.sync.get({ yuktiTools: [] });
  const targets = HANDOFF_TARGETS.filter((t) => {
    if (adapter?.name === t.name) return false;
    if (Array.isArray(yuktiTools) && yuktiTools.length > 0) return yuktiTools.includes(t.name);
    return true;
  });
  if (!targets.length) {
    toast("Enable more AI tools in your Yukti dashboard to hand off between them.");
    return;
  }

  const menu = document.createElement("div");
  menu.id = "yukti-handoff-menu";

  const label = document.createElement("span");
  label.className = "yukti-menu-label";
  label.textContent = "Continue in…";
  menu.appendChild(label);

  for (const target of targets) {
    const btn = document.createElement("button");
    btn.textContent = target.name;
    btn.onclick = async () => {
      const handoff = buildHandoffPrompt();
      try {
        await navigator.clipboard.writeText(handoff);
        toast(`Context copied ✓ — paste it into ${target.name} to continue this chat.`, "success");
        window.open(target.url, "_blank");
      } catch {
        toast("Could not copy — click the page once and try again.", "error");
      }
      menu.remove();
    };
    menu.appendChild(btn);
  }

  const rect = cluster.getBoundingClientRect();
  menu.style.top = rect.top - 8 + "px";
  menu.style.left = rect.left + "px";
  document.body.appendChild(menu);
}

// ---------------------------------------------------------------------------
// The button cluster: [🎤] [✨] [⇄]
// ---------------------------------------------------------------------------

let rafPending = false;

function positionCluster() {
  const cluster = document.getElementById("yukti-cluster");
  const input = findPromptInput();
  if (!cluster) return;
  if (!input) { cluster.style.display = "none"; return; }

  const r = input.getBoundingClientRect();
  cluster.style.display = "flex";
  cluster.style.top = Math.max(8, r.top - 18) + "px";
  cluster.style.left = Math.min(window.innerWidth - 120, r.right - 112) + "px";
}

function scheduleReposition() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    positionCluster();
    checkOutcome(); // piggyback: watch enhancement outcomes on the same cheap tick
  });
}

// Brand mark — a "Y": two arms converging into one stem.
const YUKTI_MARK_SVG = `<svg viewBox="0 0 32 32" width="15" height="15" fill="none" aria-hidden="true">
  <path d="M8 8 L16 17 L24 8" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M16 17 L16 25" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>
  <circle cx="16" cy="17" r="2.9" fill="#fff"/>
</svg>`;

function makeBtn(id, content, title, onClick, isHTML) {
  const b = document.createElement("button");
  b.id = id;
  b.type = "button";
  b.className = "yukti-btn";
  b.title = title;
  if (isHTML) b.innerHTML = content; else b.textContent = content;
  b.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
  b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
  return b;
}

function createCluster() {
  if (document.getElementById("yukti-cluster") || !document.body) return;
  const cluster = document.createElement("div");
  cluster.id = "yukti-cluster";

  cluster.appendChild(makeBtn("yukti-btn-voice", "🎤", "Speak your rough prompt — Yukti enhances it", toggleVoice));
  cluster.appendChild(makeBtn("yukti-btn-enhance", YUKTI_MARK_SVG, "Enhance this prompt (Ctrl+M)", enhanceNow, true));
  cluster.appendChild(makeBtn("yukti-btn-handoff", "⇄", "Continue this conversation in another AI", toggleHandoffMenu));

  document.body.appendChild(cluster);
  positionCluster();
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

async function init() {
  if (!adapter) return;
  const { enabled, yuktiTools } = await chrome.storage.sync.get({ enabled: true, yuktiTools: [] });
  if (!enabled) return;
  // Dashboard tool picker: if the user chose tools, respect the list strictly.
  if (Array.isArray(yuktiTools) && yuktiTools.length > 0 && !yuktiTools.includes(adapter.name)) {
    console.log("Yukti: disabled on", adapter.name, "by dashboard settings");
    return;
  }

  createCluster();

  const observer = new MutationObserver(() => {
    if (!document.getElementById("yukti-cluster")) createCluster();
    scheduleReposition();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("resize", scheduleReposition, { passive: true });
  window.addEventListener("scroll", scheduleReposition, { passive: true, capture: true });
  document.addEventListener("input", scheduleReposition, { passive: true, capture: true });

  console.log("Yukti v3.1 active on", adapter.name, "→", adapter.targetModel);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "YUKTI_ENHANCE_INLINE") enhanceNow();
});

init();
