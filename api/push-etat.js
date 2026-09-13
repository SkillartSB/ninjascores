// État des notifications, sans aucune donnée personnelle (13/09/2026).
// GET /api/push-etat/ → nombre d'appareils par canal et par type de suivi,
// dernier passage du cron (api/push-goals.js) et 50 derniers événements notifiés.
async function supabase(query, table) {
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await fetch(process.env.SUPABASE_URL + '/rest/v1/' + table + query, { headers: { apikey: cle, Authorization: 'Bearer ' + cle } });
  if (!r.ok) throw new Error(table + ' HTTP ' + r.status);
  return r.json();
}
async function redis(cmds) {
  const r = await fetch(process.env.KV_REST_API_URL + '/pipeline', {
    method: 'POST', headers: { Authorization: 'Bearer ' + process.env.KV_REST_API_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  return r.ok ? (await r.json()).map((x) => x.result) : [];
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const bilan = (lignes) => {
    const l = lignes || [];
    const n = (f) => l.filter(f).length;
    return {
      appareils: l.length,
      avecMatchs: n((x) => (x.fixture_ids || []).length),
      avecEquipes: n((x) => x.cibles && ((x.cibles.equipes || []).length || (x.cibles.equipesNoms || []).length)),
      avecJoueurs: n((x) => x.cibles && (x.cibles.joueurs || []).length),
      comptes: n((x) => x.user_id),
      majDernieres24h: n((x) => x.updated_at && Date.now() - new Date(x.updated_at).getTime() < 86400000),
      migrationCibles: l.length ? Object.prototype.hasOwnProperty.call(l[0], 'cibles') : null,
    };
  };
  try {
    const [web, ios, rd] = await Promise.all([
      supabase('?select=*', 'push_subscriptions').catch((e) => ({ erreur: e.message })),
      supabase('?select=*', 'apns_subscriptions').catch((e) => ({ erreur: e.message })),
      redis([['GET', 'push:dernier'], ['LRANGE', 'push:historique', 0, 49], ['SCARD', 'push:encours']]),
    ]);
    let dernier = null; try { dernier = rd[0] ? JSON.parse(rd[0]) : null; } catch (e) {}
    res.status(200).json({
      web: Array.isArray(web) ? bilan(web) : web,
      ios: Array.isArray(ios) ? bilan(ios) : ios,
      matchsSuivisEnCours: rd[2] || 0,
      dernierPassage: dernier,
      historique: (rd[1] || []).map((x) => { try { return JSON.parse(x); } catch (e) { return x; } }),
    });
  } catch (e) {
    res.status(500).json({ erreur: e.message });
  }
}
