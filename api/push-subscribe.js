// Enregistre / met à jour / supprime un abonnement push (notifications de
// buts sur les matchs favoris). Appelé côté client depuis index.html quand
// l'utilisateur active/désactive le toggle, ou quand ses favoris changent.

function supabaseUrl() {
  const u = process.env.SUPABASE_URL;
  if (!u) throw new Error('SUPABASE_URL absente');
  return u;
}

async function supabase(table, { method = 'GET', query = '', body, prefer } = {}) {
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!cle) throw new Error('SUPABASE_SERVICE_ROLE_KEY absente');
  const headers = { apikey: cle, Authorization: 'Bearer ' + cle, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(supabaseUrl() + '/rest/v1/' + table + query, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const texte = await r.text().catch(() => '');
    throw new Error('Supabase ' + method + ' ' + table + ' HTTP ' + r.status + ' ' + texte.slice(0, 300));
  }
  const ct = r.headers.get('content-type') || '';
  return ct.includes('application/json') ? r.json() : null;
}


// ── Cibles et préférences (13/09/2026) ─────────────────────────────────────
// Colonnes ajoutées par scripts/sql/010_push_cibles.sql. Tant que la migration
// n'est pas passée, Supabase refuse ces champs : on réessaie alors sans eux,
// pour ne jamais casser l'inscription aux notifications de matchs.
function nettoyerFixtures(a) {
  return (Array.isArray(a) ? a : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 300);
}
function nettoyerCibles(c) {
  c = c && typeof c === 'object' ? c : {};
  const nums = (a) => (Array.isArray(a) ? a : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 200);
  const txt = (a) => (Array.isArray(a) ? a : []).map((x) => String(x || '').trim().slice(0, 80)).filter(Boolean).slice(0, 200);
  const joueurs = (Array.isArray(c.joueurs) ? c.joueurs : [])
    .map((j) => ({ nom: String((j && j.nom) || '').trim().slice(0, 80), equipe: String((j && j.equipe) || '').trim().slice(0, 80) }))
    .filter((j) => j.nom).slice(0, 100);
  return { equipes: nums(c.equipes), equipesNoms: txt(c.equipesNoms), joueurs };
}
function nettoyerPrefs(p) {
  p = p && typeof p === 'object' ? p : {};
  return { buts: p.buts !== false, mi_temps: p.mi_temps !== false, fin: p.fin !== false };
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function colonneInconnue(e) { return /PGRST204|column|colonne|schema cache/i.test(String(e && e.message)); }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'DELETE') {
    try {
      const { endpoint } = req.body || {};
      if (!endpoint) return res.status(400).json({ error: 'endpoint manquant' });
      await supabase('push_subscriptions', {
        method: 'DELETE', query: '?endpoint=eq.' + encodeURIComponent(endpoint),
      });
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'méthode non supportée' });

  try {
    const { endpoint, keys, fixtureIds, cibles, prefs, userId } = req.body || {};
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ error: 'abonnement push invalide' });
    }
    const base = {
      endpoint, p256dh: keys.p256dh, auth: keys.auth,
      fixture_ids: nettoyerFixtures(fixtureIds),
      updated_at: new Date().toISOString(),
    };
    const complet = Object.assign({}, base, {
      cibles: nettoyerCibles(cibles), prefs: nettoyerPrefs(prefs),
      user_id: UUID.test(String(userId || '')) ? userId : null,
    });
    const ecrire = (ligne) => supabase('push_subscriptions', {
      method: 'POST', query: '?on_conflict=endpoint', body: [ligne],
      prefer: 'resolution=merge-duplicates,return=minimal',
    });
    let migre = true;
    try { await ecrire(complet); } catch (e) { if (!colonneInconnue(e)) throw e; migre = false; await ecrire(base); }
    res.status(200).json({ ok: true, cibles: migre });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
