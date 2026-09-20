// Briques communes aux notifications declenchees a la main
// (push-prono-gagne, push-fin-match) : acces Supabase, Redis, selection des
// destinataires et envoi web + APNs.
//
// Prefixe par « _ » : Vercel n'en fait pas une route.
// AUCUN import depuis lib/*.mjs (voir project_quota_api) : tout est inline.
import { createHash } from 'node:crypto';
import webpush from 'web-push';
import { apnsConfigured, sendApnsBatch } from './_apns.js';

export const SITE = 'https://ninjascores.com';
export const FINIS = new Set(['FT', 'AET', 'PEN']);
export const LANGUES = ['fr', 'en', 'es', 'pt'];

export function requireEnv(keys) { for (const k of keys) if (!process.env[k]) throw new Error(k + ' absente'); }

export async function supabase(table, { method = 'GET', query = '' } = {}) {
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

export async function redis(commandes) {
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

/** Le match, tel que l'API le donne (jamais de score saisi a la main). */
export async function lireMatch(fixtureId) {
  const r = await fetch(SITE + '/api/foot/?path=fixtures&id=' + fixtureId, { signal: AbortSignal.timeout(20000) });
  return ((await r.json()).response || [])[0] || null;
}

/** Cotes 1N2 d'avant-match : elles restent servies apres le coup de sifflet. */
export async function lireCotes1N2(fixtureId) {
  try {
    const r = await fetch(SITE + '/api/foot/?path=odds&fixture=' + fixtureId + '&bet=1', { signal: AbortSignal.timeout(20000) });
    const bk = (((await r.json()).response || [])[0] || {}).bookmakers || [];
    const vals = ((bk[0] || {}).bets || [])[0];
    if (!vals) return null;
    const c = {};
    for (const v of vals.values) c[v.value] = parseFloat(v.odd);
    return (c.Home && c.Away) ? { dom: c.Home, nul: c.Draw, ext: c.Away } : null;
  } catch { return null; }
}

/**
 * Destinataires d'une notification manuelle : abonnes web + iOS qui n'ont pas
 * coupe la preference demandee, comptes mineurs exclus (rien de lie aux paris
 * ne part vers un mineur, cf. ce qui a ete declare a Apple).
 */
export async function destinataires(pref, resume, maintenant) {
  const apnsActif = apnsConfigured();
  const [web, ios] = await Promise.all([
    supabase('push_subscriptions', { query: '?select=endpoint,p256dh,auth,prefs,user_id' }),
    apnsActif ? supabase('apns_subscriptions', { query: '?select=device_token,prefs,user_id' }) : Promise.resolve([]),
  ]);
  const abonnes = (web || []).map((l) => ({ canal: 'web', cle: l.endpoint, web: { endpoint: l.endpoint, keys: { p256dh: l.p256dh, auth: l.auth } }, prefs: l.prefs || {}, userId: l.user_id }))
    .concat((ios || []).map((l) => ({ canal: 'ios', cle: l.device_token, prefs: l.prefs || {}, userId: l.user_id })));
  resume.abonnes = abonnes.length;

  let vises = abonnes.filter((a) => { if (a.prefs[pref] === false) { resume.prefCoupee++; return false; } return true; });

  const ids = [...new Set(vises.map((a) => a.userId).filter(Boolean))];
  const mineurs = new Set();
  for (let i = 0; i < ids.length; i += 100) {
    const lot = ids.slice(i, i + 100);
    const lignes = await supabase('profiles', { query: '?select=id,date_of_birth&id=in.(' + lot.join(',') + ')' }).catch(() => []);
    (lignes || []).forEach((p) => { const x = p.date_of_birth ? age(p.date_of_birth, maintenant) : null; if (x !== null && x < 18) mineurs.add(p.id); });
  }
  vises = vises.filter((a) => { if (a.userId && mineurs.has(a.userId)) { resume.mineurs++; return false; } return true; });
  resume.vises = vises.length;
  return vises;
}

/** Un seul envoi par appareil et par cle, meme si la route est rappelee. */
export async function dedupe(cleRedis, vises, resume) {
  if (!vises.length) return vises;
  const empreinte = (c) => createHash('sha1').update(String(c)).digest('hex').slice(0, 20);
  const cmds = vises.map((a) => ['SADD', cleRedis, empreinte(a.cle)]);
  cmds.push(['EXPIRE', cleRedis, 3 * 86400]);
  const r = await redis(cmds);
  return vises.filter((a, i) => { if (r[i] === 1) return true; resume.dejaRecu++; return false; });
}

/**
 * Envoi. `message(lang)` rend { title, body, url, tag } : les iPhone sont
 * regroupes par texte identique, un appel APNs par variante.
 */
export async function envoyer(vises, message, resume) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const web2 = [], iosParMessage = new Map();
  vises.forEach((a) => {
    const lang = LANGUES.includes(a.prefs.lang) ? a.prefs.lang : 'fr';
    const m = message(lang);
    if (a.canal === 'web') web2.push([a, m]);
    else {
      const k = m.title + '|' + m.body;
      if (!iosParMessage.has(k)) iosParMessage.set(k, { m, tokens: [] });
      iosParMessage.get(k).tokens.push(a.cle);
    }
  });
  resume.parCanal = { web: web2.length, ios: [...iosParMessage.values()].reduce((s, x) => s + x.tokens.length, 0) };

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
}

// Noms courts pour les notifications : « Paris Saint Germain » tient mal dans
// un titre d'ecran verrouille, et personne n'ecrit ca comme ca.
const COURTS = {
  'Paris Saint Germain': 'le PSG', Marseille: "l'OM", 'Olympique Lyonnais': "l'OL", Lyon: "l'OL",
  'Saint Etienne': "l'ASSE", 'AS Saint-Étienne': "l'ASSE", Lille: 'le LOSC', 'Atletico Madrid': "l'Atlético",
  'Real Madrid': 'le Real', 'FC Barcelona': 'le Barça', Barcelona: 'le Barça', 'Manchester United': 'Manchester United',
  'Manchester City': 'Manchester City', 'Bayern Munich': 'le Bayern', 'Borussia Dortmund': 'Dortmund',
  Juventus: 'la Juve', 'Inter': "l'Inter", 'AC Milan': 'le Milan', 'FC Porto': 'Porto', Benfica: 'Benfica',
};
export function nomCourt(nom) { return COURTS[nom] || nom; }
