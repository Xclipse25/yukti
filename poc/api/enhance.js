/**
 * Yukti v3 — /api/enhance (Vercel serverless function)
 *
 * POST { prompt, targetModel, conversation, profile, deviceId }
 *  →   { success, prompt, originalScore, score, reason, remaining }
 *
 * - Gemini key lives ONLY in Vercel env: process.env.GEMINI_API_KEY
 * - POC rate limit: in-memory per deviceId (resets on cold start).
 *   Production: swap `checkLimit` for Upstash Redis (@upstash/ratelimit).
 */

const GEMINI_MODEL = "gemini-3.1-flash-lite";
const DAILY_LIMIT = 30;

// Protect the shared Gemini FREE-tier quota (~1,000-1,500 req/day project-wide,
// check your live limit in AI Studio). Keep this below your project's RPD.
const GLOBAL_DAILY_LIMIT = 900;

// ---- POC rate limiter (per warm instance) ----------------------------------
const usage = new Map(); // deviceId -> { day, count }
let globalUsage = { day: "", count: 0 };

function checkGlobalLimit() {
  const day = new Date().toISOString().slice(0, 10);
  if (globalUsage.day !== day) globalUsage = { day, count: 0 };
  if (globalUsage.count >= GLOBAL_DAILY_LIMIT) return false;
  globalUsage.count += 1;
  return true;
}

function checkLimit(deviceId) {
  const day = new Date().toISOString().slice(0, 10);
  const entry = usage.get(deviceId) || { day, count: 0 };
  if (entry.day !== day) {
    entry.day = day;
    entry.count = 0;
  }
  if (entry.count >= DAILY_LIMIT) return { allowed: false, remaining: 0 };
  entry.count += 1;
  usage.set(deviceId, entry);
  return { allowed: true, remaining: DAILY_LIMIT - entry.count };
}

// ---- Model-aware guidance ---------------------------------------------------
const MODEL_GUIDANCE = {
  claude: `Target model: Claude (Anthropic).
- Use XML-style tags to structure distinct parts: <context>, <task>, <requirements>, <output_format>.
- Long context goes BEFORE the instruction. Prefer positive instructions.`,
  chatgpt: `Target model: ChatGPT / GPT (OpenAI).
- Lead with a clear role and the goal in the first sentence.
- Use numbered requirements and explicitly state output format and length.`,
  gemini: `Target model: Gemini (Google).
- Task first, then context, then constraints. Be explicit about format; short direct sentences.`,
  copilot: `Target model: Microsoft Copilot.
- Compact, goal-first, single clear objective; mention document/workplace context if relevant.`,
  image: `Target: an IMAGE generation model (Midjourney / Leonardo / Ideogram / Krea).
- Structure: subject → setting → style → lighting → camera/composition → quality keywords.
- Comma-separated visual descriptors, never "Act as...". For Midjourney include useful params (--ar, --v, --style raw) when relevant.`,
  generic: `Target: a general-purpose AI assistant. Include role, context, task, constraints, and output format.`,
};

function guidanceFor(targetModel = "generic") {
  const key = String(targetModel).toLowerCase();
  if (MODEL_GUIDANCE[key]) return MODEL_GUIDANCE[key];
  if (["midjourney", "leonardo", "ideogram", "krea", "runway"].includes(key)) return MODEL_GUIDANCE.image;
  return MODEL_GUIDANCE.generic;
}

// ---- Prompt builder ---------------------------------------------------------
function buildSystemPrompt({ prompt, targetModel, conversation, profile, memory, dictionary }) {
  const profileBlock =
    profile && (profile.about || profile.project || profile.tone)
      ? `USER PROFILE (weave relevant details in naturally — never quote this block verbatim):
- About the user: ${profile.about || "not provided"}
- Current project/context: ${profile.project || "not provided"}
- Preferred tone/style: ${profile.tone || "not provided"}`
      : "No user profile provided.";

  const memoryBlock =
    Array.isArray(memory) && memory.length
      ? `LEARNED PREFERENCES (Yukti has observed these from this user's history — apply them silently):
${memory.map((m) => `- ${m}`).join("\n")}`
      : "";

  const dictionaryBlock =
    Array.isArray(dictionary) && dictionary.length
      ? `USER'S CUSTOM TERMS (preserve these EXACTLY as written — they are product names, project names, or acronyms the user cares about; never "correct" or expand them differently):
${dictionary.join(", ")}`
      : "";

  const convoBlock =
    Array.isArray(conversation) && conversation.length
      ? `CONVERSATION SO FAR (this is a FOLLOW-UP — preserve everything established here unless the new prompt changes it; for images keep composition/lighting/style/subject, for code keep stack/files/goal, for writing keep purpose/audience/meaning):
${conversation
  .map((m) => `${m.role === "assistant" ? "AI" : "USER"}: ${String(m.text || "").slice(0, 900)}`)
  .join("\n")}`
      : "This is the FIRST prompt of a new conversation.";

  return `You are Yukti, an invisible expert prompt engineer.
Your job is NOT to answer the user's request. Rewrite their rough prompt into ONE excellent, ready-to-send prompt.
Never mention Yukti. Never address Yukti. Write the prompt FOR the target AI.
The user will not choose between options — your single rewrite must be the best possible one.
Do not pad: every sentence must earn its place.
LANGUAGE: If the rough prompt is written in Hindi, Hinglish, or any other language, understand it fully and produce the enhanced prompt in clear, natural English while preserving the exact intent — unless the learned preferences say otherwise.
Placeholders like [EMAIL_1] or [PHONE_2] are redacted sensitive data — keep them EXACTLY as-is, character for character.

${guidanceFor(targetModel)}

${profileBlock}

${memoryBlock}

${dictionaryBlock}

${convoBlock}

USER'S ROUGH PROMPT:
"""${prompt}"""

Score the rough prompt 0-100 on prompt quality, then produce your rewrite and score it too.

Return ONLY valid JSON, no markdown:
{
  "originalScore": <int>,
  "prompt": "<the single enhanced prompt>",
  "score": <int>,
  "reason": "<max 12 words: the biggest improvement made>"
}`;
}

// ---- Gemini call ------------------------------------------------------------
async function callGemini(systemPrompt, isRetry = false) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt }] }],
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 1400,
          responseMimeType: "application/json",
        },
      }),
    }
  );

  // Free tier is ~15-30 requests/min: on a 429 from Gemini, wait once and retry.
  if (response.status === 429 && !isRetry) {
    await new Promise((r) => setTimeout(r, 4500));
    return callGemini(systemPrompt, true);
  }

  const data = await response.json();
  if (data.error) {
    const err = new Error(data.error.message || "Gemini API error");
    if (data.error.code === 429) err.busy = true;
    throw err;
  }

  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const cleaned = raw.replace(/```json/g, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  return JSON.parse(start !== -1 && end > start ? cleaned.slice(start, end + 1) : cleaned);
}

// ---- Handler ----------------------------------------------------------------
export default async function handler(req, res) {
  // CORS: extension service workers + the playground page
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "POST only" });
  }
  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ success: false, error: "GEMINI_API_KEY not configured in Vercel env" });
  }

  try {
    const { prompt, targetModel = "generic", conversation = [], profile = null, deviceId = "anon",
            memory = [], dictionary = [] } = req.body || {};

    if (!prompt || typeof prompt !== "string" || prompt.trim().length < 3) {
      return res.status(400).json({ success: false, error: "Prompt is required" });
    }
    if (prompt.length > 4000) {
      return res.status(400).json({ success: false, error: "Prompt too long (max 4000 chars)" });
    }

    if (!checkGlobalLimit()) {
      return res.status(429).json({
        success: false,
        error: "RATE_LIMITED",
        message: "Yukti is very popular today! Free capacity resets at midnight UTC.",
      });
    }

    const limit = checkLimit(String(deviceId).slice(0, 64));
    if (!limit.allowed) {
      return res.status(429).json({
        success: false,
        error: "RATE_LIMITED",
        message: `Daily free limit of ${DAILY_LIMIT} reached. Resets at midnight UTC.`,
      });
    }

    const result = await callGemini(
      buildSystemPrompt({
        prompt,
        targetModel,
        conversation: conversation.slice(-4),
        profile,
        memory: memory.slice(0, 8),
        dictionary: dictionary.slice(0, 30),
      })
    );

    if (!result.prompt) throw new Error("Empty enhancement");

    return res.status(200).json({
      success: true,
      prompt: result.prompt,
      originalScore: result.originalScore ?? null,
      score: result.score ?? null,
      reason: result.reason || "",
      remaining: limit.remaining,
    });
  } catch (err) {
    console.error("enhance error:", err);
    return res.status(500).json({ success: false, error: err.message || "Server error" });
  }
}
