// Génération quotidienne des articles de pronostics.
//
// Déclenché par le cron Vercel (voir vercel.json). Écrit dans Supabase :
// aucun déploiement nécessaire, les pages sont en ligne dès l'écriture.
//
// Le modèle est stocké en JSON, pas en HTML — la mise en forme peut évoluer
// sans regénérer quoi que ce soit.

import {
  matchsDuJour, forme, cotes, faceAFace, stade, compoProbable,
  pronostics, bilan, slug as faireSlug, LIGUES, langueDe,
} from '../lib/articles/moteur.mjs';
import { construireArticleLangue, langueDisponible } from '../lib/articles/redaction-i18n.mjs';

// Notifie Google qu'une URL vient d'etre publiee (Indexing API).
// Utilise les memes credentials OAuth que Google Search Console.
// Silencieux en cas d'echec : l'article est deja en base, le crawl viendra.
async function pingGoogle(articleUrl) {
  try {
    const cid = process.env.GSC_CLIENT_ID;
    const cs = process.env.GSC_CLIENT_SECRET;
    const rt = process.env.GSC_REFRESH_TOKEN;
    if (!cid || !cs || !rt) return;
    const tok = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `client_id=${cid}&client_secret=${cs}&refresh_token=${rt}&grant_type=refresh_token`,
    }).then(r => r.json());
    if (!tok.access_token) return;
    await fetch('https://indexing.googleapis.com/v3/urlNotifications:publish', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + tok.access_token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: articleUrl, type: 'URL_UPDATED' }),
    });
  } catch (e) {
    console.warn('[cron-articles] ping indexing echoue :', e.message);
  }
}

async function supabase(table, { method = 'GET', query = '', body, prefer } = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Variables Supabase absentes');
  const headers = {
    apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${url}/rest/v1/${table}${query}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`Supabase ${r.status} : ${(await r.text()).slice(0, 200)}`);
  // Un INSERT renvoie 201 SANS corps tant qu'on ne demande pas de
  // representation : appeler r.json() dessus jette « Unexpected end of JSON ».
  const brut = await r.text();
  return brut ? JSON.parse(brut) : null;
}

// Horodate un passage reussi. L'echec d'ecriture de la sentinelle ne doit
// jamais faire echouer la generation : on le signale et on continue.
async function battement(flux, lignes, detail) {
  try {
    await supabase('flux_sante', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=minimal',
      query: '?on_conflict=flux',
      body: [{ flux, dernier_ok: new Date().toISOString(), lignes, detail }],
    });
  } catch (err) {
    console.warn('[cron-articles] sentinelle non ecrite :', err.message);
  }
}

export default async function handler(req, res) {
  // Vercel signe ses appels de cron ; en manuel on exige le même secret.
  const attendu = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  if (attendu && auth !== `Bearer ${attendu}`) {
    res.status(401).json({ error: 'Non autorisé' });
    return;
  }

  const date = String(req.query.date || new Date().toISOString().slice(0, 10));
  const resume = { date, eligibles: 0, ecrits: 0, parLangue: {}, ignores: [], erreurs: [] };

  try {
    const matchs = await matchsDuJour(date);
    resume.eligibles = matchs.length;

    // En série plutôt qu'en parallèle : une fournée fait ~15 appels par match,
    // et saturer l'API ferait échouer toute la génération.
    for (const f of matchs) {
      const s = faireSlug(f);
      // Un match, une langue : celle de son pays. Tant qu'un jeu de phrases
      // n'existe pas, on n'ecrit PAS l'article plutot que de le rediger en
      // francais — un texte francais sur la Liga MX n'aurait aucun lecteur, et
      // il faudrait le regenerer ensuite.
      // Grands championnats etrangers : article EN FRANCAIS. L'audience de
      // NinjaScores est francophone et veut ses pronostics Premier League,
      // Liga, Serie A, Bundesliga ou Ligue des Champions — pas seulement la
      // Ligue 1. Jusqu'au 12/09 ces matchs prenaient la langue de leur pays,
      // donc tombaient sous la pause hors-fr ci-dessous : l'ecran Pronostics
      // n'affichait que Ligue 1 et Ligue 2 (demande utilisateur du 12/09).
      const MAJEURES_EN_FRANCAIS = new Set([2, 3, 848, 1, 4, 5, 39, 140, 135, 78, 88, 94, 144, 179, 40, 141, 136, 79, 253, 71, 128, 262]);
      const lg = MAJEURES_EN_FRANCAIS.has(f.league.id) ? 'fr' : langueDe(f.league.id);
      if (!langueDisponible(lg)) { resume.ignores.push(`${s} (langue ${lg} pas encore ecrite)`); continue; }
      // PAUSE (28/08/2026, demande utilisateur) : publication suspendue hors
      // francais le temps de resorber la crise de quota API — chaque article
      // coute ~15 appels (voir plus haut), et le francais est l'audience
      // historique. Le test est place AVANT les appels reseau, c'est tout son
      // interet. Retirer cette garde (ou basculer la constante) pour reprendre.
      const UNIQUEMENT_FR = true;
      if (UNIQUEMENT_FR && lg !== 'fr') { resume.ignores.push(`${s} (pause hors-fr)`); continue; }
      try {
        const [A, B, ct, h2h, lieu] = await Promise.all([
          forme(f.teams.home.id), forme(f.teams.away.id),
          cotes(f.fixture.id), faceAFace(f.teams.home.id, f.teams.away.id),
          stade(f.teams.home.id).catch(() => null),
        ]);
        // Sans forme ni cotes l'article serait creux : on ne le publie pas.
        if (!A.length || !B.length || !ct) { resume.ignores.push(`${s} (données insuffisantes)`); continue; }

        const pronos = pronostics(A, B, ct, f.teams.home.name, f.teams.away.name);
        if (!pronos.length) { resume.ignores.push(`${s} (aucun marché exploitable)`); continue; }

        const compos = await Promise.all([
          compoProbable(f.teams.home.id).catch(() => null),
          compoProbable(f.teams.away.id).catch(() => null),
        ]);

        const article = construireArticleLangue({
          f, competition: LIGUES[f.league.id], bA: bilan(A), bB: bilan(B),
          ct, pronos, h2h, lieu, compos, slug: s,
        }, lg);

        // La colonne `langue` arrive avec la migration 007. Si celle-ci n'a pas
        // encore ete passee, PostgREST refuse l'insertion en bloc (400) et la
        // journee entiere serait perdue. On retente donc sans la colonne : mieux
        // vaut des articles francais non etiquetes que pas d'articles du tout.
        const ecrire = async (avecLangue) => supabase('articles', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=minimal',
          body: [{
            slug: s,
            ...(avecLangue ? { langue: lg } : {}),
            fixture_id: f.fixture.id,
            coup_envoi: f.fixture.date,
            competition: LIGUES[f.league.id],
            titre: article.meta.titre,
            payload: article,
            maj_le: new Date().toISOString(),
          }],
        });

        try {
          await ecrire(true);
        } catch (err) {
          if (!/langue/i.test(err.message)) throw err;
          console.warn('[cron-articles] colonne langue absente — migration 007 non passee');
          resume.migrationManquante = true;
          await ecrire(false);
        }
        resume.ecrits++;
        resume.parLangue[lg] = (resume.parLangue[lg] || 0) + 1;
        await pingGoogle(`https://ninjascores.com/football/pronostic/${s}/`);
      } catch (err) {
        resume.erreurs.push(`${s} : ${err.message}`);
      }
    }

    // ── Sentinelle ───────────────────────────────────────────────────────
    // Ecrite a CHAQUE passage, y compris quand la fournee est vide. C'est ce
    // qui distingue « le cron a tourne et n'avait rien a ecrire » de « le cron
    // n'a pas tourne » — deux situations qu'on ne savait pas separer, et qui
    // ont coute plusieurs jours de production silencieusement perdus quand les
    // chemins de cron renvoyaient une 308.
    await battement('articles', resume.ecrits, `${matchs.length} eligibles`);

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(resume);
  } catch (err) {
    console.error('[cron-articles]', err.message);
    res.status(500).json({ ...resume, fatal: err.message });
  }
}
