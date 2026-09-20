// Notification « prono validé » a la fin d'un gros match (20/09/2026).
//
// Declenchee a la main, match par match : ces notifications ne valent que
// pour les affiches que tout le monde regarde (Atletico - Real, OM - PSG…).
// Un envoi automatique a chaque prono gagnant noierait l'utilisateur.
//
//   /api/push-prono-gagne/?fixture=1570394&cle=<PUSH_ADMIN_SECRET>
//   ...&simulation=1   -> compte les destinataires et montre le texte, sans envoyer
//
// Le resultat est relu depuis l'API (jamais saisi a la main) et le pari est
// reverifie ici : on n'annonce jamais un prono gagnant sans l'avoir recalcule.
//
// AUCUN import depuis lib/*.mjs (voir project_quota_api) : tout est inline.
import { createHash } from 'node:crypto';
import webpush from 'web-push';
import { apnsConfigured, sendApnsBatch } from './_apns.js';

const SITE = 'https://ninjascores.com';
const URL_PRONOS = '/pronostics/';
const FINIS = new Set(['FT', 'AET', 'PEN']);

const TITRE = {
  fr: '✅ Prono validé',
  en: '✅ Tip won',
  es: '✅ Pronóstico acertado',
  pt: '✅ Palpite certo',
};

function requireEnv(keys) { for (const k of keys) if (!process.env[k]) throw new Error(k + ' absente'); }

async function supabase(table, { method = 'GET', query = '' } = {}) {
  const r = await fetch(process.env.SUPABASE_URL + '/rest/v1/' + table + query, {
    method,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
    },
  });
  if (!r.ok) throw new Error(table + ' ' + r.status);
  return method === 'DELETE' ? null : r.json();
}

async function redis(commandes) {
  const r = await fetch(process.env.KV_REST_API_URL + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.KV_REST_API_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(commandes),
  });
  if (!r.ok) throw new Error('redis ' + r.status);
  return (await r.json()).map((x) => x.result);
}

function age(dateNaissance, maintenant) {
  const d = new Date(dateNaissance);
  if (isNaN(d)) return null;
  let a = maintenant.getUTCFullYear() - d.getUTCFullYear();
  const m = maintenant.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && maintenant.getUTCDate() < d.getUTCDate())) a--;
  return a;
}

// Le pari est-il gagnant ? On ne traite que les marches que l'app publie, et
// on renvoie null des qu'un libelle sort de ce cadre : mieux vaut ne rien
// envoyer que d'annoncer un gain a tort.
function pariGagnant(pick, f) {
  const t = String(pick || '').toLowerCase();
  const dom = f.teams.home.name, ext = f.teams.away.name;
  const bh = f.goals.home, ba = f.goals.away;
  if (bh == null || ba == null) return null;

  const total = bh + ba;
  if (/les deux équipes marquent|both teams/.test(t)) return bh > 0 && ba > 0;
  const plus = t.match(/plus de (\d+([.,]\d+)?)\s*buts?/);
  if (plus) return total > parseFloat(plus[1].replace(',', '.'));
  const moins = t.match(/moins de (\d+([.,]\d+)?)\s*buts?/);
  if (moins) return total < parseFloat(moins[1].replace(',', '.'));

  // « <équipe> ou match nul » : double chance.
  const nul = t.match(/^(.+?)\s+ou match nul$/);
  if (nul) {
    const equipe = nul[1].trim();
    if (dom.toLowerCase().startsWith(equipe) || equipe.startsWith(dom.toLowerCase())) return bh >= ba;
    if (ext.toLowerCase().startsWith(equipe) || equipe.startsWith(ext.toLowerCase())) return ba >= bh;
    return null;
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || {};
  const simulation = String(q.simulation || '') === '1';
  const fixtureId = String(q.fixture || '').trim();
  const maintenant = new Date();
  const resume = { a: maintenant.toISOString(), simulation, fixture: fixtureId, abonnes: 0, vises: 0, dejaRecu: 0, prefCoupee: 0, mineurs: 0, envoyees: 0, nettoyes: 0, erreurs: [] };

  try {
    requireEnv(['PUSH_ADMIN_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']);
    if (String(q.cle || '') !== process.env.PUSH_ADMIN_SECRET) return res.status(401).json({ erreur: 'clé invalide' });
    if (!/^\d+$/.test(fixtureId)) return res.status(400).json({ erreur: 'paramètre fixture manquant' });

    // 1. Le match : termine ? quel score ?
    const rf = await fetch(SITE + '/api/foot/?path=fixtures&id=' + fixtureId, { signal: AbortSignal.timeout(20000) });
    const f = ((await rf.json()).response || [])[0];
    if (!f) return res.status(404).json({ erreur: 'match introuvable' });
    const statut = f.fixture.status.short;
    resume.match = f.teams.home.name + ' ' + f.goals.home + '-' + f.goals.away + ' ' + f.teams.away.name + ' (' + statut + ')';
    if (!FINIS.has(statut)) return res.status(409).json(Object.assign(resume, { erreur: 'match non terminé' }));

    // 2. Le prono publie sur ce match, et sa verification.
    const rp = await fetch(SITE + '/api/pronostics-jour/', { signal: AbortSignal.timeout(60000) });
    const jour = await rp.json();
    let pick = null;
    for (const l of (jour.foot || [])) for (const p of (l.picks || [])) if (String(p.fixtureId) === fixtureId) pick = p;
    // La liste du jour ne garde que les matchs a venir : une fois le coup de
    // sifflet final donne, le prono n'y est plus. On accepte alors de le
    // reprendre en parametre (?pick=…&cote=…) — il reste verifie contre le
    // score reel plus bas, donc aucun risque d'annoncer un gain a tort.
    if (!pick && q.pick) pick = { pick: String(q.pick), odds: String(q.cote || '').replace(',', '.') };
    if (!pick) return res.status(404).json(Object.assign(resume, { erreur: 'aucun prono publié sur ce match (passer ?pick=…&cote=… si le match est déjà fini)' }));
    resume.prono = pick.pick + ' @ ' + pick.odds;
    const gagne = pariGagnant(pick.pick, f);
    if (gagne !== true) return res.status(409).json(Object.assign(resume, { erreur: gagne === null ? 'marché non reconnu, envoi refusé' : 'prono perdu' }));

    // 3. Abonnes : ceux qui ont accepte les pronostics (meme préférence que
    //    le rappel de 9h), hors comptes mineurs.
    webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    const apnsActif = apnsConfigured();
    const [web, ios] = await Promise.all([
      supabase('push_subscriptions', { query: '?select=endpoint,p256dh,auth,prefs,user_id' }),
      apnsActif ? supabase('apns_subscriptions', { query: '?select=device_token,prefs,user_id' }) : Promise.resolve([]),
    ]);
    const abonnes = (web || []).map((l) => ({ canal: 'web', cle: l.endpoint, web: { endpoint: l.endpoint, keys: { p256dh: l.p256dh, auth: l.auth } }, prefs: l.prefs || {}, userId: l.user_id }))
      .concat((ios || []).map((l) => ({ canal: 'ios', cle: l.device_token, prefs: l.prefs || {}, userId: l.user_id })));
    resume.abonnes = abonnes.length;

    let vises = abonnes.filter((a) => { if (a.prefs.pronos === false) { resume.prefCoupee++; return false; } return true; });

    const ids = [...new Set(vises.map((a) => a.userId).filter(Boolean))];
    const mineurs = new Set();
    for (let i = 0; i < ids.length; i += 100) {
      const lot = ids.slice(i, i + 100);
      const lignes = await supabase('profiles', { query: '?select=id,date_of_birth&id=in.(' + lot.join(',') + ')' }).catch(() => []);
      (lignes || []).forEach((p) => { const x = p.date_of_birth ? age(p.date_of_birth, maintenant) : null; if (x !== null && x < 18) mineurs.add(p.id); });
    }
    vises = vises.filter((a) => { if (a.userId && mineurs.has(a.userId)) { resume.mineurs++; return false; } return true; });
    resume.vises = vises.length;

    // Un seul envoi par appareil et par match, meme si la route est rappelee.
    if (!simulation && vises.length) {
      const empreinte = (cle) => createHash('sha1').update(String(cle)).digest('hex').slice(0, 20);
      const cmds = vises.map((a) => ['SADD', 'push:prono-ok:' + fixtureId, empreinte(a.cle)]);
      cmds.push(['EXPIRE', 'push:prono-ok:' + fixtureId, 3 * 86400]);
      const r = await redis(cmds);
      vises = vises.filter((a, i) => { if (r[i] === 1) return true; resume.dejaRecu++; return false; });
    }

    // 4. Messages. Le corps porte le score et le pari : la notification doit
    //    se suffire a elle-meme, beaucoup ne l'ouvriront pas.
    const cote = String(pick.odds).replace('.', ',');
    const corps = f.teams.home.name + ' ' + f.goals.home + '-' + f.goals.away + ' ' + f.teams.away.name
      + ' · ' + pick.pick + ' (' + cote + ')';
    const web2 = [], iosParMessage = new Map();
    vises.forEach((a) => {
      const lang = ['en', 'es', 'pt'].includes(a.prefs.lang) ? a.prefs.lang : 'fr';
      const m = { title: TITRE[lang], body: corps, url: URL_PRONOS, tag: 'ns-prono-ok-' + fixtureId };
      if (a.canal === 'web') web2.push([a, m]);
      else {
        const k = m.title;
        if (!iosParMessage.has(k)) iosParMessage.set(k, { m, tokens: [] });
        iosParMessage.get(k).tokens.push(a.cle);
      }
    });
    resume.texte = { titre: TITRE.fr, corps };
    resume.parCanal = { web: web2.length, ios: [...iosParMessage.values()].reduce((s, x) => s + x.tokens.length, 0) };
    if (simulation) return res.status(200).json(resume);

    await Promise.all(web2.map(async ([a, m]) => {
      try { await webpush.sendNotification(a.web, JSON.stringify(m)); resume.envoyees++; }
      catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          await supabase('push_subscriptions', { method: 'DELETE', query: '?endpoint=eq.' + encodeURIComponent(a.cle) }).catch(() => {});
          resume.nettoyes++;
        } else resume.erreurs.push('web ' + (e.statusCode || '') + ' ' + String(e.message).slice(0, 60));
      }
    }));
    for (const { m, tokens } of iosParMessage.values()) {
      const r = await sendApnsBatch(tokens, m);
      resume.envoyees += r.filter((x) => x.ok).length;
      r.filter((x) => !x.ok && !x.invalid).forEach((x) => resume.erreurs.push('apns HTTP ' + x.status));
      for (const t of r.filter((x) => x.invalid).map((x) => x.deviceToken)) {
        await supabase('apns_subscriptions', { method: 'DELETE', query: '?device_token=eq.' + encodeURIComponent(t) }).catch(() => {});
        resume.nettoyes++;
      }
    }
    console.log('[push-prono-gagne] ' + JSON.stringify(resume));
    res.status(200).json(resume);
  } catch (e) {
    resume.erreurs.push(String(e.message).slice(0, 200));
    console.log('[push-prono-gagne] ' + JSON.stringify(resume));
    res.status(500).json(resume);
  }
}
