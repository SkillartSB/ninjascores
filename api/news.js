// Vercel serverless — proxy Google News RSS (gratuit, sans clé).
// Cote serveur : evite le CORS et cache le resultat sur le CDN.
// Usage : /api/news?q=Erling%20Haaland

const clean = (s) => (s || '')
  .replace(/<!\[CDATA\[|\]\]>/g, '')
  .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .trim();

const tag = (block, t) => {
  const m = block.match(new RegExp('<' + t + '[^>]*>([\\s\\S]*?)<\\/' + t + '>'));
  return m ? m[1] : '';
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const q = (req.query && req.query.q ? String(req.query.q) : '').trim();
  if (!q) { res.status(200).json({ articles: [] }); return; }
  // Par defaut on cible le football ; ?sport=tennis cherche tel quel (« tennis »).
  const sport = req.query && req.query.sport === 'tennis' ? 'tennis' : 'football';
  const url = 'https://news.google.com/rss/search?q=' +
    encodeURIComponent(sport === 'tennis' ? q : q + ' football') + '&hl=fr-FR&gl=FR&ceid=FR:fr';
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NinjaScores/1.0)' } });
    const xml = await r.text();
    const items = [];
    const re = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = re.exec(xml)) && items.length < 15) {
      const b = m[1];
      let title = clean(tag(b, 'title'));
      const source = clean(tag(b, 'source'));
      if (source && title.endsWith(' - ' + source)) title = title.slice(0, -(source.length + 3));
      items.push({
        title: title,
        link: clean(tag(b, 'link')),
        source: source,
        date: clean(tag(b, 'pubDate')),
      });
    }
    res.setHeader('Cache-Control', 'public, s-maxage=1800, max-age=900');
    res.status(200).json({ articles: items });
  } catch (e) {
    res.status(200).json({ articles: [] });
  }
}
