// ─────────────────────────────────────────────────────────────────────────────
// PD1 Hub shared auth + navigation.
// The SAME file lives in every PD1 Hub app (pd1-hub, pd1-tracker-react,
// pd1-flashcards, async-apex-practice, study-tracker-app). Only the three
// ENV lines below differ (Vite uses import.meta.env.VITE_*, Create React App
// uses process.env.REACT_APP_*). If you change anything else, copy the change
// to the other apps.
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, createElement as h, useContext, useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

// ENV
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;
const HUB_DOMAIN = process.env.REACT_APP_PD1HUB_DOMAIN; // e.g. "example.com" — leave unset for localhost

// ── Apps ────────────────────────────────────────────────────────────────────
// sub = subdomain in production, devPort = port when running locally.
export const HUB = { key: "hub", name: "PD1 Hub", sub: "pd1-hub", devPort: 5173 };
export const APPS = [
  { key: "tracker", name: "PD1 Tracker", sub: "pd1-tracker", devPort: 3000, color: ["#B5563C", "#E0876A"],
    blurb: "Week-by-week PD1 topics, statuses and exam scores, with a study buddy." },
  { key: "flashcards", name: "Flashcards", sub: "pd1-flash", devPort: 3002, color: ["#1B9C93", "#4DD0C4"],
    blurb: "AI-generated exam-style flashcards for each study week." },
  { key: "apex", name: "Async Apex", sub: "async-apex-practice", devPort: 3003, color: ["#7A5FBF", "#AD93E8"],
    blurb: "Hands-on async Apex practice with checklists and a tutor chat." },
  { key: "study", name: "Study rail", sub: "studyrail", devPort: 5174, color: ["#2E6DA4", "#6FA8DC"],
    blurb: "The 13-week combined track: Python, JS, React, PD1 and AI." },
];

// ── Theme (Study rail palette) ──────────────────────────────────────────────
export const PALETTE = {
  light: {
    page: "#F1F3F4", card: "#FFFFFF", border: "#E1E4E6", borderStrong: "#C7CCD1",
    text: "#1C2226", textSecondary: "#6B7280", textMuted: "#9CA3AF",
    rowHover: "#F7F8F9", chipBg: "#F1F3F4", chipHover: "#E9ECEE",
    accentBg: "#1C2226", accentText: "#FFFFFF", danger: "#B5563C",
  },
  dark: {
    page: "#14171A", card: "#1C2024", border: "#2A2E33", borderStrong: "#3A3F45",
    text: "#ECEEF0", textSecondary: "#9AA1A9", textMuted: "#6B7280",
    rowHover: "#22262B", chipBg: "#22262B", chipHover: "#2A2E33",
    accentBg: "#ECEEF0", accentText: "#14171A", danger: "#E0876A",
  },
};
export const FONTS = {
  display: "'Space Grotesk', sans-serif",
  body: "'Inter', -apple-system, sans-serif",
  mono: "'JetBrains Mono', monospace",
};

// ── Environment helpers ─────────────────────────────────────────────────────
const isBrowser = typeof window !== "undefined";
export const isLocal = isBrowser && ["localhost", "127.0.0.1"].includes(window.location.hostname);
export const configError = !SUPABASE_URL || !SUPABASE_ANON_KEY
  ? "Supabase URL / anon key are not set."
  : !isLocal && !HUB_DOMAIN
    ? "PD1 Hub domain is not set (PD1HUB_DOMAIN environment variable)."
    : null;

// True when an app is opened outside your domain (e.g. its .vercel.app address),
// where the shared sign-in cookie can't work.
export const wrongHost = isBrowser && !isLocal && !!HUB_DOMAIN &&
  !(window.location.hostname === HUB_DOMAIN || window.location.hostname.endsWith("." + HUB_DOMAIN));

export function appUrl(app) {
  return isLocal ? `http://localhost:${app.devPort}` : `https://${app.sub}.${HUB_DOMAIN}`;
}
export const hubUrl = () => appUrl(HUB);

// Only allow redirects back to our own apps (prevents open-redirect abuse).
export function isSafeNext(next) {
  try {
    const u = new URL(next);
    if (isLocal) return u.hostname === "localhost" || u.hostname === "127.0.0.1";
    return u.protocol === "https:" && (u.hostname === HUB_DOMAIN || u.hostname.endsWith("." + HUB_DOMAIN));
  } catch {
    return false;
  }
}

// ── Supabase client with a session cookie shared across *.HUB_DOMAIN ───────
const cookieDomain = !isLocal && HUB_DOMAIN ? "." + HUB_DOMAIN : undefined;
export const supabase = configError
  ? null
  : createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookieOptions: cookieDomain ? { domain: cookieDomain, secure: true } : {},
    });

// Headers for calling an app's /api/chat (proves you're signed in).
export async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.assign(hubUrl());
}

// ── Shared theme (cookie on the parent domain, so every app agrees) ─────────
const THEME_COOKIE = "pd1hub-theme";
export function getTheme() {
  if (!isBrowser) return "light";
  const m = document.cookie.match(new RegExp("(?:^|; )" + THEME_COOKIE + "=(light|dark)"));
  if (m) return m[1];
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
export function setTheme(theme) {
  const parts = [`${THEME_COOKIE}=${theme}`, "path=/", "max-age=31536000", "samesite=lax"];
  if (cookieDomain) parts.push(`domain=${cookieDomain}`, "secure");
  document.cookie = parts.join("; ");
  window.dispatchEvent(new CustomEvent("pd1hub-theme", { detail: theme }));
}
export function useTheme() {
  const [theme, set] = useState(getTheme);
  useEffect(() => {
    const onChange = (e) => set(e.detail);
    window.addEventListener("pd1hub-theme", onChange);
    return () => window.removeEventListener("pd1hub-theme", onChange);
  }, []);
  return theme;
}

// Load the Study rail fonts once (no-op if the page already has them).
if (isBrowser && !document.getElementById("pd1hub-fonts")) {
  const link = document.createElement("link");
  link.id = "pd1hub-fonts";
  link.rel = "stylesheet";
  link.href = "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap";
  document.head.appendChild(link);
}

// ── Session context ─────────────────────────────────────────────────────────
const SessionContext = createContext(null);
export const useSession = () => useContext(SessionContext);

function useAuthSession() {
  const [session, setSession] = useState(undefined); // undefined = still checking
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}
export { useAuthSession };

function CenteredMessage({ children }) {
  const C = PALETTE[getTheme()];
  return h("div", {
    style: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: C.page, color: C.textSecondary, fontFamily: FONTS.body, fontSize: 14, padding: 16, textAlign: "center" },
  }, children);
}

// Wrap an app's root with this. Shows the app only when you're signed in;
// otherwise sends you to the hub to sign in and brings you back afterwards.
export function PD1HubGate({ app, children }) {
  const session = useAuthSession();

  useEffect(() => {
    if (session === null && !wrongHost) {
      window.location.replace(`${hubUrl()}/?next=${encodeURIComponent(window.location.href)}`);
    }
  }, [session]);

  if (configError) return h(CenteredMessage, null, `PD1 Hub isn't configured: ${configError}`);
  if (wrongHost) {
    const target = appUrl(APPS.find((a) => a.key === app) || HUB);
    return h(CenteredMessage, null,
      "This app has moved. Open it at ",
      h("a", { href: target, style: { color: "inherit", fontWeight: 600 } }, target.replace(/^https:\/\//, "")),
    );
  }
  if (!session) return h(CenteredMessage, null, "Checking sign-in…");

  return h(SessionContext.Provider, { value: session },
    h(HubBar, { current: app, email: session.user.email }),
    children,
  );
}

// ── The bar shown at the top of every app ───────────────────────────────────
export function HubBar({ current, email }) {
  const theme = useTheme();
  const C = PALETTE[theme];
  const dark = theme === "dark";

  const chip = (active, color) => ({
    display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 8,
    fontSize: 13, fontWeight: 500, textDecoration: "none", whiteSpace: "nowrap",
    color: active ? C.text : C.textSecondary,
    background: active ? C.chipBg : "transparent",
    border: `1px solid ${active ? C.border : "transparent"}`,
  });

  return h("nav", {
    style: { background: C.card, borderBottom: `1px solid ${C.border}`, fontFamily: FONTS.body,
      position: "relative", zIndex: 1000 },
  },
    h("style", null, `.pd1hub-chip:hover{background:${C.chipHover} !important}`),
    h("div", {
      style: { maxWidth: 1100, margin: "0 auto", padding: "8px 16px", display: "flex",
        alignItems: "center", gap: 12 },
    },
      h("a", {
        href: hubUrl(),
        style: { fontFamily: FONTS.display, fontWeight: 700, fontSize: 16, color: C.text,
          textDecoration: "none", letterSpacing: "-0.01em", whiteSpace: "nowrap" },
      }, "PD1 Hub"),
      h("div", { style: { display: "flex", gap: 4, overflowX: "auto", flex: 1, minWidth: 0 } },
        APPS.map((a) => h("a", {
          key: a.key, href: appUrl(a), className: "pd1hub-chip",
          "aria-current": a.key === current ? "page" : undefined,
          style: chip(a.key === current),
        },
          h("span", { style: { width: 7, height: 7, borderRadius: "50%", background: a.color[dark ? 1 : 0], flexShrink: 0 } }),
          a.name,
        )),
      ),
      h("button", {
        onClick: signOut, className: "pd1hub-chip", title: email ? `Signed in as ${email}` : undefined,
        style: { ...chip(false), cursor: "pointer", fontFamily: FONTS.body, border: `1px solid ${C.border}` },
      }, "Sign out"),
    ),
  );
}
