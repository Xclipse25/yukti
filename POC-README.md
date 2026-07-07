# Yukti v3 POC — Run It in 10 Minutes

## What this POC proves
1. **One click, every prompt**: a ✨ pill sits on the chat input of ChatGPT, Claude,
   Gemini and 14+ tools. Click (or Ctrl+M) → the rough prompt is replaced in-place
   with an expert version. Undo toast shows the quality jump (e.g. "34 → 91").
2. **Follow-up aware**: Yukti reads the latest exchange on the page and preserves
   it, so enhancing "make it shorter" keeps everything from the previous prompt.
3. **Profile injection**: set who you are / your project / your tone once in the
   popup — every prompt is enhanced with that context.
4. **PII Shield**: emails, phones (incl. Indian +91 format), cards, and API keys
   are redacted locally before the prompt leaves the browser, and restored into
   the final result. Tested, roundtrip-safe.
5. **Playground**: a public demo page (great for pitching) at your Vercel URL.

## Deploy the backend (Vercel)
```bash
cd poc
npm i -g vercel          # if you don't have it
vercel login             # sign in with GitHub
vercel                   # accept defaults → gives you a preview URL
vercel env add GEMINI_API_KEY   # paste your NEW (rotated!) Gemini key, select all envs
vercel --prod            # deploy to production → e.g. https://yukti.vercel.app
```
Open the URL — the playground works immediately. Try:
`make me a workout plan im busy and skinny` → Enhance.

## Wire up the extension
1. Open `extension/background.js`, replace `YOUR-PROJECT.vercel.app` with your URL.
2. Copy your `logo1.png` into `extension/icons/` (delete the placeholder txt).
3. chrome://extensions → Developer mode → Load unpacked → select `extension/`.
4. Go to chatgpt.com or claude.ai, type something rough, click ✨.

## Demo script (for the pitch)
1. **Playground first** (no install needed): type a lazy prompt, hit Enhance,
   let the score bar animate 34 → 91. That animation IS the pitch.
2. Open the "context profile" section, add "3rd-year CS student, building a
   React app" → enhance the same prompt → show how it's now personal.
3. **Extension**: on ChatGPT, type `write code for a login page`, ✨, send.
   Then type `make it dark mode`, ✨ → show the follow-up preserved everything.
4. **PII Shield**: type `email priya@company.com that her card 4111 1111 1111 1111
   was charged` → ✨ → show the toast "2 sensitive items redacted locally", and
   the final prompt still contains the real data (restored client-side).

## POC limitations (say these honestly if asked)
- Rate limit is per-device, in-memory (resets on Vercel cold starts).
  Production: Upstash Redis + accounts (one file swap in api/enhance.js).
- No accounts/payments yet — v2's Firebase auth work maps over, or use Clerk.
- Conversation capture uses per-site selectors; the 4 big sites are tuned,
  others fall back gracefully (first-prompt mode).

## Production roadmap after POC
1. Auth + billing (Pro unlimited).
2. Team Profiles + org-level PII policies (the business product).
3. Merge v2 features as "power mode": prompt library, refine-with-questions.
4. Analytics dashboard ("your prompting skill over time") — already built in v2.

## Free-tier notes (everything above runs on ₹0)
- **Gemini**: get your key free at aistudio.google.com (no card). We use
  gemini-3.1-flash-lite — the most generous free model. The API has a built-in
  GLOBAL_DAILY_LIMIT (900) to stay under your project's daily quota, plus
  automatic retry on per-minute 429s. Check your live limits in AI Studio.
- **Privacy on free tier**: Google may use free-tier API data to improve its
  products — which is exactly why the PII Shield redacts sensitive data in the
  browser BEFORE it reaches Gemini. Lead with this in the pitch.
- **Vercel Hobby**: free, no card. Non-commercial use only — fine for the POC;
  when you start charging, port api/enhance.js to Cloudflare Workers (free tier
  allows commercial use) or upgrade Vercel.
- **Chrome Web Store**: publishing later costs a one-time $5 registration.
  Loading unpacked for development/demos is free forever.
- **EEA/UK note**: Gemini's terms require paid tier for API clients offered to
  EEA/UK/Swiss users — launch India/US-first while on the free key.

---

# v3.1 — The stickiness build

## New features
1. **🎤 Voice input** — click the mic, speak your rough thought (English, Hindi,
   Telugu, Tamil, Hinglish — set language in popup), Yukti transcribes it into
   the chat box and enhances it in one motion. First use asks for mic permission
   per site. Free (browser Web Speech API).
2. **🧠 Yukti Memory** — Yukti learns locally from every enhancement: your stack,
   your intent patterns, whether you write Hinglish, whether you trim its output.
   Learned preferences shape every future enhancement AND are shown transparently
   in the popup with × buttons — deleting one mutes that whole category forever.
3. **Feedback signals** — every enhancement's fate is tracked (sent as-is /
   edited / undone) and shown as "% sent without edits" in the popup. This is
   the data flywheel: day one of the moat.
4. **⇄ Continue in another AI** — one click builds a context-carrying prompt
   from the current conversation, copies it, and opens ChatGPT/Claude/Gemini.
   Your session becomes portable across vendors — nobody else does this.
5. **📖 Custom dictionary** — product names, project names, acronyms Yukti must
   never alter. Set once in the popup.
6. **Hinglish/multilingual** — rough prompts in Hindi/Hinglish/any language are
   understood and enhanced into clear English.

## Updated demo script (add to the pitch flow)
5. **Voice**: click 🎤, say "mujhe ek portfolio website banana hai react me" →
   watch it appear AND transform into a polished English prompt. Judges melt.
6. **Memory**: after a few enhancements, open the popup → "What Yukti has
   learned about you" shows real learned preferences with delete buttons.
   The line: "every day you use Yukti, it gets better *for you* — and none of
   that transfers to a competitor."
7. **Handoff**: mid-chat in ChatGPT, click ⇄ → Claude → paste. "Your AI
   conversation is now portable across vendors."

## Upgrade note
If you already deployed the POC: `git add -A && git commit -m "v3.1" && git push`
auto-redeploys the API on Vercel. Then reload the extension at chrome://extensions.
No new permissions, no config changes.
