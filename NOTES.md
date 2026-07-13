# Async Apex Practice App — Build Notes

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

### ⬜ Option 2 — CRA Built-in Proxy (not yet done)

Create React App can proxy API requests automatically, eliminating the need for a separate terminal.

**Steps (preview):**
1. Add `"proxy": "http://localhost:3001"` to `package.json`
2. Change fetch URL in `App.js` to just `/api/chat` (no hostname needed)
3. CRA dev server forwards `/api/*` requests to your Express server automatically

**Key difference from Option 1:** Same Express server, but the React app routes through CRA's proxy so you don't need to hardcode `localhost:3001` in your fetch calls.

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
