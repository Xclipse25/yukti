# v3.2 setup — premium site, login gate, tool picker

## What changed
- `poc/index.html` — premium landing page: live playground hero, "How it works",
  PII Shield explainer (the redaction demo), tools cloud, CTA to dashboard.
  Old playground kept at `poc/playground-old.html` (delete when happy).
- `poc/app.html` — the dashboard: Google sign-in → pick your AI tools →
  gated extension download → "Connect Yukti extension" (syncs choices instantly).
- Extension v3.2 — activates ONLY in the tools chosen on the dashboard, and the
  ⇄ handoff menu shows only those tools. Popup shows the connected account.

## One-time setup (all free, ~10 minutes)

### A. Firebase (Auth + settings storage — free Spark plan, no card)
1. console.firebase.google.com → your project `promptpilot-3a012`
2. **Authentication → Sign-in method → enable Google.**
3. **Authentication → Settings → Authorized domains → Add:** `yukti-psi.vercel.app`
4. **Project settings → Your apps →** if no web app exists, add one (</> icon).
   Copy the `appId` and paste it into `poc/app.html` where it says
   `PASTE_YOUR_APP_ID_HERE`.
5. **Firestore Database →** create database (production mode) →
   **Rules tab →** paste the contents of `firestore.rules` → Publish.
   (Rules via console are free — no CLI, no Blaze plan needed.)

### B. Extension ID
1. Load the extension unpacked once (chrome://extensions).
2. Copy its ID (the long letters under the name).
3. Paste it into `poc/app.html` where it says `PASTE_YOUR_EXTENSION_ID_HERE`.

### C. Ship it
```bash
git add -A && git commit -m "v3.2: premium site, login gate, tool picker" && git push
```
Vercel auto-deploys. Then reload the extension (chrome://extensions ↻).

## The flow your users now experience
1. Land on yukti-psi.vercel.app → try the live demo in the hero (no login).
2. Click "Sign in · Get the extension" → Google login (your registered-user metric!).
3. Pick their AI tools → Save.
4. Download + load the extension → click "Connect Yukti extension".
5. Yukti now runs only in their chosen tools; ⇄ handoff shows only those tools.

## Notes
- Download button points to your GitHub repo zip. If the repo is private, either
  make it public, or attach the extension folder as a zip under GitHub → Releases
  and update the link in app.html.
- The tool list saved in Firestore also syncs live to the extension on every
  "Save" if the extension is installed — no reconnect needed.
