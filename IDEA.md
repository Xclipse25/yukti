# Yukti v3 — Product Vision

## The one-line idea
You type a rough prompt anywhere. One click (or Ctrl+M) and it becomes the prompt
an expert would have written — using context the AI doesn't have: who you are,
what you're building, what happened earlier in the conversation, and your
company's standards.

## Why this survives even when AI models get smarter
Models will keep getting better at guessing intent from rough prompts. What they
will never have is what lives outside the chat window:

1. **Your profile** — role, project, preferred tone, tech stack. Yukti injects it
   into every prompt automatically. The AI stops asking "what framework?".
2. **Conversation memory across every tool** — Yukti sees the last exchange on the
   page and preserves it in follow-ups. Works identically on ChatGPT, Claude,
   Gemini, and 25+ tools. No model vendor can do this across competitors.
3. **Model-awareness** — the same intent is phrased differently for Claude
   (XML structure), GPT (role-first), and Midjourney (visual descriptors + params).
4. **Privacy layer (PII Shield)** — emails, phone numbers, card numbers, and API
   keys are redacted locally BEFORE the prompt leaves the browser, and restored
   after enhancement. Sensitive data never touches Yukti's servers.

Rewriting is the feature. Context is the product.

## The v3 user experience
- A small ✨ Yukti pill sits at the corner of the chat input on every supported site.
- User types roughly ("fix my resume for data jobs"), clicks ✨ (or Ctrl+M).
- The text in the box is replaced in-place with the enhanced version. An Undo
  toast shows the quality jump (e.g. "34 → 91 · added role, format, constraints").
- Works on EVERY message: Yukti reads the latest AI reply on the page, so
  follow-ups preserve everything and change only what the user asked to change.
- No panel, no choosing, no copy-paste. One click, every prompt, everywhere.

## For businesses (the revenue story)
| Feature | Why companies pay |
|---|---|
| **Team Profiles** | Company tone, product context, and standards injected into every employee's prompts → consistent, on-brand AI output across the org. |
| **PII Shield** | Client-side redaction = employees can use public AI tools without leaking customer data. Compliance teams love this. |
| **Prompt analytics** | Which teams use AI, on which tools, and whether prompt quality is improving. AI-adoption reporting for managers. |
| **Shared libraries** | Proven prompts distributed to the whole team (v2 already built this). |
| **API access** | Companies embed Yukti enhancement inside their own products. |

Pricing sketch: Free (30/day) → Pro $6/mo (unlimited, profiles) →
Team $12/user/mo (team profiles, shield policies, admin analytics).

## Architecture (v3 = Vercel, no Firebase)
```
Browser extension                    Vercel
┌──────────────────────┐            ┌─────────────────────────┐
│ content.js           │            │ /api/enhance            │
│  ✨ pill + Ctrl+M     │──POST────▶│  - device rate limit     │
│  conversation capture │            │  - model-aware Gemini   │
│  PII redact/restore  │◀──JSON────│    call (key in env)     │
│ popup: profile editor│            │ /  playground demo page  │
└──────────────────────┘            └─────────────────────────┘
```
- Gemini key lives only in Vercel env vars.
- POC rate-limits per device token in memory; production swaps in Upstash Redis
  (one file change) and adds auth (Clerk or Vercel-friendly auth) + Postgres/KV
  for accounts, team profiles, and analytics.

## What stays from v2 (merge later, not in POC)
Prompt library, refine-with-questions mode, the 5-option panel (as a "power mode"),
skill dashboard. The POC stays focused on the new core loop.
