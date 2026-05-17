// Vercel serverless function — proxie get_livescore vers api-tennis.com
// La clé API reste côté serveur, jamais exposée au client.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const key = process.env.API_TENNIS_KEY;
  if (!key) { res.status(500).json({ error: 'API key not configured' }); return; }

  try {
    const url = `https://api.api-tennis.com/tennis/?method=get_livescore&APIkey=${key}&timezone=Europe/Paris`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`API HTTP ${r.status}`);
    const json = await r.json();
    res.status(200).json(json.success === 1 ? json.result : []);
  } catch (e) {
    console.error('[tennis-livescore]', e.message);
    res.status(502).json([]);
  }
}
