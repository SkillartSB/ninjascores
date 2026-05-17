// Vercel serverless function — proxie get_fixtures?match_key pour le détail d'un match
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const key = process.env.API_TENNIS_KEY;
  if (!key) { res.status(500).json({ error: 'API key not configured' }); return; }

  const matchKey = req.query.id;
  if (!matchKey) { res.status(400).json({ error: 'Missing ?id=' }); return; }

  try {
    const url = `https://api.api-tennis.com/tennis/?method=get_fixtures&APIkey=${key}&match_key=${encodeURIComponent(matchKey)}&date_start=2000-01-01&date_stop=2100-01-01&timezone=Europe/Paris`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`API HTTP ${r.status}`);
    const json = await r.json();
    res.status(200).json(json.success === 1 ? json.result : []);
  } catch (e) {
    console.error('[tennis-match]', e.message);
    res.status(502).json([]);
  }
}
