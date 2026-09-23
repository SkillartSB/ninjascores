// Vercel serverless function — proxie get_odds vers api-tennis.com
// La clé API reste côté serveur, jamais exposée au client.
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const key = process.env.API_TENNIS_KEY;
  if (!key) { res.status(500).json({ error: 'API key not configured' }); return; }

  // ?id=<match_key>  ou  ?date=YYYY-MM-DD  (défaut: aujourd'hui)
  const matchKey = req.query.id;
  const date = (req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date))
    ? req.query.date
    : new Date().toISOString().slice(0, 10);

  const cible = matchKey
    ? `&match_key=${encodeURIComponent(matchKey)}`
    : `&date_start=${date}&date_stop=${date}`;

  try {
    const url = `https://api.api-tennis.com/tennis/?method=get_odds&APIkey=${key}${cible}&timezone=Europe/Paris`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`API HTTP ${r.status}`);
    const json = await r.json();
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.status(200).json(json.success === 1 ? json.result : {});
  } catch (e) {
    console.error('[tennis-odds]', e.message);
    res.status(502).json({});
  }
}
