# Setup

Formwhisper was built with the official Firebase agent skills. They are installed in this repo:

```bash
npx skills add firebase/agent-skills --agent=cursor --skill "*"
```

That follows [Firebase agent skills](https://firebase.google.com/docs/ai-assistance/agent-skills). The skills that drove the Firebase work are `firebase-basics` (CLI, local environment, Cursor MCP) and `firebase-ai-logic-basics` (Gemini Developer API, hybrid on-device inference, structured output, App Check, limited-use tokens). The Firebase MCP server is declared in `.cursor/mcp.json`. Restart Cursor so it connects. This environment was not logged into Firebase, so project creation and `init ailogic` are left for you. Do not commit the results of those commands if they contain secrets.

Node.js 20 or newer is required (`node --version`). The Firebase JS SDK 13 packages also declare an engine of Node 24 for some of their own tooling. The extension bundle itself builds on Node 22. Use the CLI through `npx -y firebase-tools@latest`, not a globally installed `firebase` binary.

## 1. Firebase project (Spark, no billing)

```bash
npx -y firebase-tools@latest login
npx -y firebase-tools@latest projects:create YOUR_PROJECT_ID --display-name "Formwhisper"
npx -y firebase-tools@latest use YOUR_PROJECT_ID
npx -y firebase-tools@latest apps:create web formwhisper
npx -y firebase-tools@latest apps:sdkconfig WEB YOUR_APP_ID
```

`projects:create` needs a globally unique id, 6–30 characters, lowercase, digits and hyphens. If you already have a Spark project, skip `projects:create` and `use` that id. Copy `.firebaserc.example` to `.firebaserc` only on your machine if you want the id recorded locally. `.firebaserc` is not required for the extension.

Register the web app's config in a gitignored file:

```bash
cp config/firebase.config.example.json config/firebase.config.json
```

Paste `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, and `appId` from `apps:sdkconfig`. Leave `appCheck.mode` as `"debug"` until you are ready to think about a store release. `cloudModel` defaults to `gemini-4-hydrogen`.

## 2. Turn on Firebase AI Logic

From this directory (it already contains `firebase.json`):

```bash
npx -y firebase-tools@latest init ailogic
```

In the console: **AI Services → AI Logic → Get started**, and choose the **Gemini Developer API**. That is the free tier. Do not turn on billing for the Agent Platform Gemini API.

Confirm App Check is enforced for Firebase AI Logic: **Security → App Check → APIs**. If the Firebase AI Logic row says `Unenforced`, open it and enforce baseline protection. The getting-started flow does this for new projects. Replay protection needs limited-use tokens; the extension already passes `useLimitedUseAppCheckTokens: true`, so you can enable replay protection after a debug token works.

The extension will not call Gemini until this step has been done. A client config file alone returns `PERMISSION_DENIED`.

## 3. App Check

The skill's web sample uses reCAPTCHA Enterprise. `ReCaptchaEnterpriseProvider.initialize()` always inserts `https://www.google.com/recaptcha/enterprise.js`. Manifest V3 blocks that script (`script-src 'self'`), so debug mode does not construct it.

Debug mode sets `self.FIREBASE_APPCHECK_DEBUG_TOKEN` (a stored token, or `true` when none is stored) and passes a `CustomProvider` to `initializeAppCheck`. The SDK then prints the debug token. The enterprise provider is imported only when `appCheck.mode` is `recaptcha-enterprise`, which is for a normal https origin, not the side panel.

What works for the extension, and what the hackathon rules accept, is the **App Check debug provider**:

1. Build and load the extension (steps below) with `appCheck.mode` set to `"debug"`.
2. Open the side panel, then its DevTools console. With no token configured, the SDK prints `AppCheck debug token: "…"`.
3. Firebase console → **Security → App Check → Apps → Manage debug tokens**. Register that UUID.
4. To stop the token changing when storage is cleared, paste it into **Settings → App Check debug token** in the panel (stored in `chrome.storage.local`) or into gitignored `.env.local`:

   ```bash
   cp .env.example .env.local
   # VITE_APPCHECK_DEBUG_TOKEN=the-uuid-from-the-console
   ```

5. Reload the panel after saving. Rebuild the extension if you used `.env.local`, because Vite inlines that variable at build time. `dist/` is gitignored. Do not publish a build that contains a debug token.

The debug global is set only when `appCheck.mode` is `"debug"`. The skill's sample gates this on `import.meta.env.DEV`. An unpacked extension is a production Vite build, so the extension applies the token whenever the gitignored config asks for debug mode. The token is never written into source.

`appCheck.mode: "recaptcha-enterprise"` plus a real site key is the production path from the skill. It will run if these calls are ever hosted on a normal https origin. It will not succeed inside the side panel under Manifest V3, for the CSP reason above. There is no Chrome Web Store attestation provider in App Check today. A custom provider would need a backend that exchanges some other proof for an App Check token; that is not shipped, because it would put a secret on a server you would have to operate. For the hackathon, use the debug token.

## 4. Chrome, for on-device Gemini Nano

Desktop Chrome 139 or newer.

1. Open `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`
2. Set it to **Enabled**. This is the flag the hybrid docs require for JPEG input. Field explanations use the same on-device model.
3. Restart Chrome.
4. In the side panel, open **Model setup** and press **Download the on-device model**. The click is required: `initializeDeviceModel()` has to run from a user gesture. The first download can take several minutes.
5. Optional check, in any page's DevTools console:

   ```js
   await LanguageModel.availability()
   ```

   You want `available`. `downloadable` or `downloading` means the model is not ready yet. `unavailable` means this Chrome build cannot run it.

Until the model is available, Formwhisper asks before each cloud call. **Never use cloud** refuses that path and stays on `ONLY_ON_DEVICE`.

## 5. Build and load

```bash
npm install
npm run check
npm run build
```

`chrome://extensions` → Developer mode → **Load unpacked** → select the `dist/` directory. Pin Formwhisper and click the toolbar icon. The side panel opens.

Specimen forms, with the preview provider (no Firebase config required):

```bash
npm run dev
```

Open http://127.0.0.1:43123 and pick a form. The extension does not inject a content script into every tab. Opening the side panel injects one self-contained `content.js` into that tab's top frame. Pages with no fields get no listeners.

In the vault, **Load the Ellison specimen** fills a fictional profile so the demo video has something to place in the boxes. It is not loaded until you ask.

## 6. What you must do yourself

This repository was prepared without a Firebase login. On your machine:

1. Create or choose a Spark project and run the CLI commands in sections 1 and 2.
2. Copy the web config into `config/firebase.config.json`. Do not commit it.
3. Register an App Check debug token. Do not commit it. Do not ship `dist/` if the token was inlined from `.env.local`.
4. Enable the Chrome flag and download Gemini Nano if you want the on-device path on camera.
5. Restart Cursor once so `.cursor/mcp.json` connects the Firebase MCP server.

`npm run check` does not need any of that. It builds the extension and tests field extraction, vault matching, and JSON parsing against the preview provider.
