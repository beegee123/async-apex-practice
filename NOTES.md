# Async Apex Practice App — Build Notes

## How to Create a React App from Scratch

### Step 1 — Scaffold the app
Run this from the folder where you want the project to live:
```
npx create-react-app my-app-name
cd my-app-name
```
This generates the full folder structure, `package.json`, and all scripts. The app name becomes the folder name — no spaces.

### Step 2 — Understand the structure
```
my-app-name/
├── src/
│   └── App.js       # your main component — edit this
├── public/
├── package.json     # dependencies and scripts
└── node_modules/    # auto-generated, never commit this
```

### Step 3 — Start the dev server
```
npm start
```
Opens the app at `http://localhost:3000`. Hot reloads on every save — no restart needed.

### Step 4 — Edit App.js
Replace the default content with your own component. In React, `App.js` contains everything: structure (JSX), styles (inline JS objects), and logic (useState, useEffect, handlers). This is intentional — React organizes code by **component**, not by file type.

### Step 5 — Install packages as needed
```
npm install <package-name>
```
This adds the package to `node_modules` and registers it in `package.json`. Always run this from inside the project folder.

### Step 6 — Add a .gitignore
Make sure `node_modules` and `.env` are listed. `node_modules` is never committed — anyone cloning the repo runs `npm install` to regenerate it.

### Step 7 — Swap window.storage for localStorage (if migrating from Cowork)
If your JSX was built as a Cowork artifact, it uses `window.storage` which is Cowork-specific and won't work in a standalone React app. Replace it with `localStorage`:

```js
// Load on mount — replace window.storage.get with:
const saved = localStorage.getItem('my-key');
if (saved) {
  const data = JSON.parse(saved);
  // set your state from data
}

// Save on change — replace window.storage.set with:
localStorage.setItem('my-key', JSON.stringify({ ...yourData }));
```

Watch for leftover `window.storage` lines after the swap — having two `const data` declarations in the same block will cause a compile error.

---

### Common mistakes
- Running `npm install` or `npm start` from the wrong folder — always `cd` into the project first
- Creating `server.js` or `.env` in the parent folder instead of the project folder
- Referencing theme variables as strings (`"theme.bg"`) instead of JS expressions (`{theme.bg}`)

---

## React App Basics

- A React app is bootstrapped with `create-react-app`, which generates the folder structure, `package.json`, and scripts
- `npm start` runs the app locally on port 3000 with hot reload (changes reflect instantly without restarting)
- `npm install <package>` adds a dependency and registers it in `package.json`
- All source code lives in `src/` — `App.js` is the main component
- `node_modules/` is generated from `package.json` and should never be committed to git

---

## Project Structure

```
async-apex-practice/
├── src/
│   └── App.js          # all React components
├── public/
├── server.js           # Express proxy (Option 1)
├── .env                # API keys — never commit this
├── .gitignore          # should include .env and node_modules
├── package.json        # dependencies and scripts
└── node_modules/
```

---

## Getting the AI Tutor to Work

### The Problem
The app calls the Anthropic API to power the AI Tutor. Browsers block direct calls to external APIs (CORS policy), and hardcoding API keys in frontend code is a security risk. A backend layer is needed.

### Three Options

---

### ✅ Option 1 — Local Express Proxy (completed)

Run a small Node.js server alongside the React app. It receives requests from the browser and forwards them to Anthropic with the API key attached server-side.

**Steps:**
1. `npm install express cors dotenv`
2. Create `server.js` in the project root with an `/api/chat` endpoint
3. Store the API key in `.env` as `ANTHROPIC_API_KEY=sk-ant-...`
4. Load it in `server.js` with `require('dotenv').config()`
5. Add `cors()` middleware so the browser allows cross-origin requests (port 3000 → 3001)
6. Update `App.js` fetch URL to `http://localhost:3001/api/chat`
7. Run `node server.js` in one terminal, `npm start` in another

**Key lessons:**
- Environment variables keep secrets out of code
- `.env` must be in `.gitignore`
- The server must be manually restarted after code changes (unlike React)
- CORS errors happen when browser origins don't match — `cors()` middleware fixes this

---

### ✅ Option 2 — CRA Built-in Proxy (completed)

Create React App can proxy API requests automatically, eliminating the need for CORS headers.

**Steps:**
1. Copy `server.js` and `.env` from Option 1 into the new project and `npm install express dotenv`
2. Add one line to `package.json`:
   ```json
   "proxy": "http://localhost:3001"
   ```
3. Remove `cors` from `server.js` — not needed since requests go through the same origin
4. Write fetch calls using a relative URL — no hostname required:
   ```js
   fetch('/api/chat', { ... })
   ```
5. Run `node server.js` in one terminal, `npm start` in another

**Key difference from Option 1:** The fetch URL is just `/api/chat` instead of `http://localhost:3001/api/chat`. CRA's dev server intercepts requests that start with `/api` and forwards them to port 3001. Since the browser only ever talks to port 3000, there's no cross-origin issue — no `cors()` middleware needed.

**How to verify it's working:** Open DevTools → Network tab, send a message, and confirm the request goes to `localhost:3000/api/chat` (not 3001). The proxy is invisible to the browser.

**Gotcha:** The `"proxy"` field in `package.json` only works in development (`npm start`). In production you need a real server or serverless functions — which is what Option 3 solves.

---

### ✅ Option 3 — Vercel Serverless Functions (completed)

Deploy the app to Vercel and replace `server.js` with a serverless API route. No Express, no CORS, no separate server process — Vercel handles everything.

**Steps:**
1. Create an `api/` folder in the project root with a `chat.js` file — Vercel automatically treats any file in `/api` as a serverless function
2. Write the handler using Vercel's function signature:
   ```js
   export default async function handler(req, res) {
     if (req.method !== 'POST') return res.status(405).end();
     const response = await fetch('https://api.anthropic.com/v1/messages', {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'x-api-key': process.env.ANTHROPIC_API_KEY,
         'anthropic-version': '2023-06-01',
       },
       body: JSON.stringify(req.body),
     });
     const data = await response.json();
     res.json(data);
   }
   ```
3. Push to GitHub
4. Go to vercel.com → Add New Project → import the GitHub repo
5. Add `ANTHROPIC_API_KEY` under Project Settings → Environment Variables
6. Vercel auto-deploys on every push to `main`

**Optional — local dev with `vercel dev`:** create a `.env` file with `ANTHROPIC_API_KEY=sk-ant-...` and run `vercel dev` instead of `npm start`. It runs both the React app and the `api/` functions together locally. Useful for testing serverless functions before pushing, but not required — you can just push and let Vercel deploy.

**Fetch URL in App.js:** just `/api/chat` — same as Option 2, no hostname needed.

**Key differences from Options 1 & 2:**
- No `server.js`, no `express`, no `cors`, no `dotenv` package
- No separate terminal to run — one command (`vercel dev`) runs everything
- Actually deploys to a public URL — this is the only option that works in production
- API key stored in Vercel dashboard, not just a local `.env` file

**Gotchas:**
- Always save your files before committing — an empty `api/chat.js` deploys as a broken function with no error until runtime
- Vercel redeploys automatically on every `git push` to `main`
- `vercel dev` requires a Vercel account login even for local testing

---

## PD1 Flashcard App — Design Decisions

### How to generate flashcards — 3 options considered

**Option 1 — AI on demand** ✅ (chosen)
User picks a topic, AI generates a fresh set of cards each time.
- Pros: different cards every session so you're not memorizing the same questions; more realistic use of AI; cards never go stale
- Why chosen: best for active recall — if you see the same cards every time you start pattern-matching the answers rather than actually learning the material

**Option 2 — Pre-built + AI**
A hardcoded set of cards per topic, plus a button to generate more with AI.
- Pros: cards available instantly without an API call; consistent baseline set of questions
- Cons: pre-built cards go stale and get memorized quickly; more maintenance to keep them updated

**Option 3 — Free-text input**
User types any Salesforce topic and AI generates cards for it.
- Pros: maximum flexibility; not limited to the 6 week plan
- Cons: more open-ended means less focused exam prep; user has to know what to ask for

---

## Markdown Rendering

By default React renders text as plain strings. To render AI responses with formatting:

1. `npm install react-markdown remark-gfm`
2. Import both in `App.js`
3. Replace `{m.content}` with `<ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>`
4. Add a `components` prop to style code blocks and tables

`remark-gfm` is required for tables — base `react-markdown` doesn't support them.

---

## Memory

### Problem 1 — Chat resets when switching topics
By default `messages` was local state inside `AITutor`, cleared on every topic switch.

**Fix:** Lift state up to the parent component as `chatHistory` — an object keyed by topic id (e.g. `chatHistory["future"]`). Each topic gets its own chat slot that persists while the app is open.

### Problem 2 — Chat lost on page refresh
React state lives in memory and disappears on reload.

**Fix:** 
- Initialize `chatHistory` from `localStorage` on mount
- Add a `useEffect` that writes to `localStorage` whenever `chatHistory` changes

```js
const [chatHistory, setChatHistory] = useState(() => {
  const saved = localStorage.getItem('apexChatHistory');
  return saved ? JSON.parse(saved) : {};
});

useEffect(() => {
  localStorage.setItem('apexChatHistory', JSON.stringify(chatHistory));
}, [chatHistory]);
```

### Problem 3 — No memory across devices / users

`localStorage` is browser and device specific. Data saved on one machine is invisible on another browser, phone, or computer. For true cross-device persistence, data needs to live in a server-side database.

**Database options (simplest to most complex):**

| Option | Notes |
|--------|-------|
| **Supabase** | Free hosted Postgres. Simple REST API, works great with React and Vercel. Best choice for hobby projects. |
| **Firebase** | Google's real-time database. Free tier, popular for hobby apps. |
| **SQLite + server** | File-based database on your own server (Railway, Render). More control but you manage the server. |
| **Salesforce custom object** | Store progress in your Salesforce dev org. Accessible anywhere you can log into Salesforce. Best post-PD1 project. |

**Fix — Supabase (completed in pd1-tracker-react):**

**Step 1 — Create Supabase project**
- Sign up at supabase.com → New Project
- Go to Table Editor → New Table, name it `progress`
- Add columns: `statuses` (jsonb), `scores` (jsonb), `dark_mode` (bool)
- Keep RLS enabled — add a policy instead of disabling it:
  ```sql
  CREATE POLICY "allow all" ON progress
  FOR ALL
  USING (true)
  WITH CHECK (true);
  ```
- Insert one empty row (id: 1) — this is the single row we always upsert to

**Step 2 — Get credentials**
- Project Settings → API → copy Project URL (base URL only, no `/rest/v1/`) and anon public key

**Step 3 — Install and initialize**
```
npm install @supabase/supabase-js
```
Add to `.env` (note `REACT_APP_` prefix required by CRA):
```
REACT_APP_SUPABASE_URL=https://xxxx.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-anon-key
```
Restart `npm start` after adding env vars — CRA only reads `.env` on startup.

Initialize client in `App.js`:
```js
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.REACT_APP_SUPABASE_ANON_KEY
);
```

**Step 4 — Replace localStorage with Supabase**

Load on mount:
```js
const { data } = await supabase.from('progress').select('*').single();
if (data) {
  setStatuses(data.statuses || {});
  setScores(data.scores || { exam1: "", exam2: "" });
}
```

Save on change (upsert always updates the same row):
```js
await supabase.from('progress')
  .upsert({ id: 1, statuses: nextStatuses, scores: nextScores, dark_mode: darkMode });
```

**Step 5 — Add env vars to Vercel**
- Project Settings → Environment Variables
- Add `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY`
- Redeploy

**Key lessons:**
- The Supabase URL must be the base URL only — the client adds `/rest/v1/` itself
- `upsert` with a fixed `id: 1` means one row gets overwritten on every save — no history, just current state
- RLS should stay enabled — add a permissive policy rather than disabling it entirely
- One Supabase project can serve multiple apps — just use separate tables

**Key difference from localStorage:** data lives in Postgres hosted by Supabase — accessible from any device, any browser, anywhere. Verified working across desktop and phone.

---

## Post-PD1 Project Ideas

### 1. Salesforce Integration for Study Apps
Connect the study apps to a Salesforce dev org via the REST API:
- Replace `localStorage` with a Salesforce custom object for cross-device persistence
- Authenticate with OAuth using Salesforce credentials
- The tracker could save progress to Salesforce records
- The flashcard app could pull topics from Salesforce data

This teaches how React apps communicate with Salesforce APIs — a real-world skill beyond the PD1 curriculum.

---

### 2. Org Health Dashboard
A custom React dashboard showing live metrics from your Salesforce org — more focused and developer-specific than Salesforce's built-in Optimizer/Health Check tools.

**What it would show:**
- Apex test coverage % (flags if below 75%)
- Scheduled and batch job statuses
- Governor limit proximity
- Recent debug logs
- Custom object and field counts

**Why it's different from native Salesforce tools:**
- You choose what metrics matter to you
- Real-time data, not a report you manually re-run
- AI layer (Claude) can interpret the metrics and flag issues — e.g. "your test coverage dropped this week, here's what to fix before your next deployment"

**Tech stack:** React + Salesforce REST API + OAuth + Claude (optional)

**Build order:**
1. Get Salesforce OAuth connection working
2. Display raw metrics in a dashboard
3. Add Claude as a "diagnose my org" button

---

### 3. Automation Toggle Tool (inspired by SF Switch)
A tool to turn validation rules, flows, and triggers on/off individually or in bulk — something the native Salesforce UI makes painfully slow.

**The problem it solves:**
Developers constantly need to disable automations during data migrations, deployments, or debugging. In Salesforce you have to open each one individually. A custom tool lets you do it in bulk with one click.

**Features:**
- List all validation rules, flows, and triggers in the org
- Toggle active/inactive individually or bulk select by type
- Filter by object, type, or name
- Claude could summarize what each automation does before you disable it — preventing accidental breakage

**Tech stack:** React + Salesforce Metadata API or Tooling API + OAuth + Claude (optional)

**Why it's valuable:** This is a tool a Salesforce developer would actually use on real client projects — and potentially sell as a managed package or AppExchange app.
