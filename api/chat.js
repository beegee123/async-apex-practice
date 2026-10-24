// Vercel serverless function: forwards chat requests to Anthropic.
// Only answers requests from someone signed in to PD1 Hub, so nobody else
// can spend your Anthropic credits through this URL.
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;

async function isSignedIn(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ') || !SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: auth },
    });
    return r.ok;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!(await isSignedIn(req))) return res.status(401).json({ error: 'Sign in to PD1 Hub first.' });

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
  res.status(response.status).json(data);
}
