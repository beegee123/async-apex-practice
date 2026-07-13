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

### ⬜ Option 3 — Vercel Serverless Functions (not yet done)

Deploy the app to Vercel and replace `server.js` with a serverless API route. No separate server process needed — Vercel handles it.

**Steps (preview):**
1. Create an `api/chat.js` file (Vercel treats files in `/api` as serverless functions)
2. Store `ANTHROPIC_API_KEY` as a Vercel environment variable in the dashboard
3. Deploy with `vercel --prod`
4. Update fetch URL in `App.js` to `/api/chat`

**Key difference:** No server to run or maintain. Scales automatically. This is the production-ready approach.

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

### Problem 3 — No memory across devices / users (not yet solved)
`localStorage` is browser-specific. For true persistence, chat history would need to be saved to a backend database.
