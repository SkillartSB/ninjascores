// Notifications en direct : buts, mi-temps, fin de match (refonte du 13/09/2026).
//
// Déclenché par Vercel Cron chaque minute (vercel.json) ; la fonction boucle en
// interne toutes les 15 s pendant ~50 s. Qui est notifié, pour quoi :
//   • but        → abonnés qui suivent le MATCH, l'une des deux ÉQUIPES, ou le BUTEUR
//   • mi-temps   → abonnés qui suivent le match ou l'une des deux équipes
//   • fin        → idem
// Chaque abonné choisit ses types (prefs : buts, mi_temps, fin).
//
// Coût API-Football : le flux direct est lu dans le cache Redis déjà rempli par le
// site (/api/foot, TTL 20 s) ou dans notre propre cache 15 s ; un seul appel amont
// quand les deux sont vides. Avant la refonte : un appel toutes les 5 s, même sans
// match suivi en cours (5 471 appels le 13/09 à midi).
//
// État par match dans Redis : push:etat:<fixture> = "h-a|statut" (6 h) et l'ensemble
// push:encours des matchs vus en direct, pour détecter la fin quand un match sort
// du flux direct. Aucune notification au premier passage sur un match (on prend la
// photo), donc pas de rafale de vieux buts quand le cron redémarre.

import webpush from 'web-push';
import { gunzipSync } from 'node:zlib';
import { apnsConfigured, sendApnsBatch } from './_apns.js';

// Compteur d'appels amont (footamont:{jour}:direct-*), lisible via
// /api/foot/?path=compteurs. INLINE ET NON IMPORTE : dans ce projet, un
// api/*.js qui importe depuis lib/*.mjs plante au chargement
// (FUNCTION_INVOCATION_FAILED) — meme incident que seo.js/moteur.mjs en
// aout 2026. Ne pas "factoriser" cette fonction.
function compterAppelDirect(source) {
  try {
    const url = process.env.KV_REST_API_URL, token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) return;
    const jour = new Date().toISOString().slice(0, 10);
    const cle = 'footamont:' + jour + ':direct-' + source;
    fetch(url + '/pipeline', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', cle], ['EXPIRE', cle, 604800]]),
      signal: AbortSignal.timeout(1500),
    }).catch(() => {});
  } catch (e) {}
}

const API_BASE = 'https://v3.football.api-sports.io';
const TICK_MS = 15000;
const RUN_BUDGET_MS = 50000;
const RAFRAICHIR_ABONNES_MS = 30000;
const ETAT_TTL_S = 6 * 3600;
const CLES_LIVE_SITE = ['foot:fixtures?live=all&timezone=Europe%2FParis', 'foot:fixtures?live=all'];
const CLE_LIVE_PUSH = 'push:live';
const GZ_PREFIXE = 'gz1:';
const FINIS = new Set(['FT', 'AET', 'PEN']);
const ABANDONNES = new Set(['PST', 'CANC', 'ABD', 'AWD', 'WO', 'SUSP', 'INT', 'NS', 'TBD']);

function requireEnv(keys) { for (const k of keys) if (!process.env[k]) throw new Error(k + ' absente'); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function apiFootball(chemin, source) {
  compterAppelDirect(source);
  const r = await fetch(API_BASE + '/' + chemin, { headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('API-Football HTTP ' + r.status);
  const j = await r.json();
  return j.response || [];
}

async function supabase(table, { method = 'GET', query = '' } = {}) {
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const r = await fetch(process.env.SUPABASE_URL + '/rest/v1/' + table + query, {
    method, headers: { apikey: cle, Authorization: 'Bearer ' + cle, 'Content-Type': 'application/json' },
  });
  if (!r.ok) throw new Error('Supabase ' + method + ' ' + table + ' HTTP ' + r.status + ' ' + (await r.text().catch(() => '')).slice(0, 200));
  const ct = r.headers.get('content-type') || '';
  return ct.includes('application/json') ? r.json() : null;
}

async function redis(commandes) {
  const r = await fetch(process.env.KV_REST_API_URL + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.KV_REST_API_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(commandes), signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error('Redis HTTP ' + r.status);
  const j = await r.json();
  const err = j.find((x) => x && x.error);
  if (err) throw new Error('Redis ' + err.error);
  return j.map((x) => x.result);
}

// ── Normalisation des noms (équipes et joueurs) ────────────────────────────
function norm(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\b(fc|cf|sc|ac|as|afc|ssc|club|de|la|le|the)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}
function memeEquipe(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const court = x.length < y.length ? x : y, long = x.length < y.length ? y : x;
  // Inclusion seulement pour un nom d'au moins deux mots (« Manchester » seul ne doit
  // pas designer Manchester City ET Manchester United).
  return court.split(' ').length >= 2 && court.length >= 6 && (' ' + long + ' ').includes(' ' + court + ' ');
}
// « K. Mbappé » (API-Football) contre « Kylian Mbappé » (nos favoris, ids Transfermarkt).
function memeJoueur(nomApi, fav, equipeApi) {
  const a = norm(nomApi).split(' ').filter(Boolean), b = norm(fav.nom).split(' ').filter(Boolean);
  if (!a.length || !b.length) return false;
  if (a[a.length - 1] !== b[b.length - 1]) return false;
  if (a.length === 1 || b.length === 1) return memeEquipe(equipeApi, fav.equipe);
  return a[0][0] === b[0][0] || memeEquipe(equipeApi, fav.equipe);
}
function slug(s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

// ── Abonnés ────────────────────────────────────────────────────────────────
async function chargerAbonnes(apnsActif) {
  const [web, ios] = await Promise.all([
    supabase('push_subscriptions', { query: '?select=*' }),
    apnsActif ? supabase('apns_subscriptions', { query: '?select=*' }) : Promise.resolve([]),
  ]);
  const construire = (ligne, canal) => {
    const c = ligne.cibles || {};
    const p = ligne.prefs || {};
    return {
      canal,
      cle: canal === 'web' ? ligne.endpoint : ligne.device_token,
      web: canal === 'web' ? { endpoint: ligne.endpoint, keys: { p256dh: ligne.p256dh, auth: ligne.auth } } : null,
      fixtures: new Set((ligne.fixture_ids || []).map(Number)),
      equipes: new Set((c.equipes || []).map(Number)),
      equipesNoms: (c.equipesNoms || []).filter(Boolean),
      joueurs: (c.joueurs || []).filter((j) => j && j.nom),
      prefs: { buts: p.buts !== false, mi_temps: p.mi_temps !== false, fin: p.fin !== false },
    };
  };
  return (web || []).map((l) => construire(l, 'web')).concat((ios || []).map((l) => construire(l, 'ios')));
}

function suitEquipe(ab, id, nom) {
  return ab.equipes.has(Number(id)) || ab.equipesNoms.some((n) => memeEquipe(n, nom));
}
function concerne(ab, f) {
  if (ab.fixtures.has(f.id)) return true;
  if (suitEquipe(ab, f.dom.id, f.dom.nom) || suitEquipe(ab, f.ext.id, f.ext.nom)) return true;
  return ab.joueurs.some((j) => j.equipe && (memeEquipe(j.equipe, f.dom.nom) || memeEquipe(j.equipe, f.ext.nom)));
}

// ── Flux direct ────────────────────────────────────────────────────────────
function compacter(response) {
  return (response || []).map((f) => ({
    id: f.fixture.id, st: (f.fixture.status && f.fixture.status.short) || '', min: (f.fixture.status && f.fixture.status.elapsed) || null,
    h: Number(f.goals && f.goals.home) || 0, a: Number(f.goals && f.goals.away) || 0,
    dom: { id: f.teams.home.id, nom: f.teams.home.name }, ext: { id: f.teams.away.id, nom: f.teams.away.name },
  }));
}
function decompresser(v) {
  if (typeof v !== 'string') return null;
  if (!v.startsWith(GZ_PREFIXE)) return v;
  try { return gunzipSync(Buffer.from(v.slice(GZ_PREFIXE.length), 'base64')).toString('utf8'); } catch (e) { return null; }
}
async function lireLive(resume) {
  const lu = await redis([['GET', CLE_LIVE_PUSH], ...CLES_LIVE_SITE.map((k) => ['GET', k])]);
  if (lu[0]) { try { resume.source = 'push'; return JSON.parse(lu[0]); } catch (e) {} }
  for (let i = 1; i < lu.length; i++) {
    const brut = decompresser(lu[i]);
    if (!brut) continue;
    try { const j = JSON.parse(brut); if (j && Array.isArray(j.response)) { resume.source = 'site'; return compacter(j.response); } } catch (e) {}
  }
  const live = compacter(await apiFootball('fixtures?live=all', 'push-live'));
  resume.appelsLive++;
  resume.source = 'amont';
  await redis([['SET', CLE_LIVE_PUSH, JSON.stringify(live), 'EX', 15]]).catch(() => {});
  return live;
}

// Buts du match (événements), pour le nom et l'équipe du buteur.
async function butsDuMatch(fid, resume) {
  try {
    resume.appelsEvenements++;
    const ev = await apiFootball('fixtures/events?fixture=' + fid, 'push-events');
    return ev.filter((e) => String(e.type || '').toLowerCase() === 'goal' && !String(e.detail || '').toLowerCase().includes('missed'))
      .map((e) => ({
        joueur: (e.player && e.player.name) || null,
        equipeId: e.team && e.team.id, equipe: e.team && e.team.name,
        minute: e.time ? (e.time.elapsed || 0) + (e.time.extra ? '+' + e.time.extra : '') : null,
        detail: String(e.detail || '').toLowerCase(),
      }));
  } catch (e) { return []; }
}

// ── Messages ───────────────────────────────────────────────────────────────
function score(f) { return f.dom.nom + ' ' + f.h + ' - ' + f.a + ' ' + f.ext.nom; }
function urlMatch(f) { return '/football/match/' + slug(f.dom.nom) + '-' + slug(f.ext.nom) + '-' + f.id + '/'; }
function messagePour(ab, ev) {
  const f = ev.f;
  const suitMatch = ab.fixtures.has(f.id);
  const suitDom = suitEquipe(ab, f.dom.id, f.dom.nom), suitExt = suitEquipe(ab, f.ext.id, f.ext.nom);
  const base = { fixtureId: f.id, url: urlMatch(f) };
  if (ev.type === 'but') {
    if (!ab.prefs.buts) return null;
    const b = ev.but || {};
    const marqueDom = ev.cote === 'dom';
    const equipe = marqueDom ? f.dom : f.ext;
    const favori = b.joueur ? ab.joueurs.find((j) => memeJoueur(b.joueur, j, b.equipe || equipe.nom)) : null;
    const suitButeur = !!favori;
    const suitMarqueur = marqueDom ? suitDom : suitExt;
    if (!(suitMatch || suitDom || suitExt || suitButeur)) return null;
    const precision = b.detail && b.detail.includes('own') ? ' (csc)' : b.detail && b.detail.includes('penalty') ? ' (pen.)' : '';
    const buteur = b.joueur ? ' · ' + b.joueur + precision + (b.minute ? ' ' + b.minute + '\'' : '') : '';
    const titre = suitButeur ? '⚽ ' + favori.nom + ' marque !' : suitMarqueur ? '⚽ But pour ' + equipe.nom + ' !' : '⚽ But ' + equipe.nom + ' !';
    return Object.assign(base, { title: titre, body: score(f) + buteur, tag: 'ns-but-' + f.id + '-' + f.h + '-' + f.a });
  }
  if (!(suitMatch || suitDom || suitExt)) return null;
  if (ev.type === 'mt') {
    if (!ab.prefs.mi_temps) return null;
    return Object.assign(base, { title: '⏸ Mi-temps', body: score(f), tag: 'ns-mt-' + f.id });
  }
  if (ev.type === 'fin') {
    if (!ab.prefs.fin) return null;
    return Object.assign(base, { title: '🏁 Terminé', body: score(f), tag: 'ns-fin-' + f.id });
  }
  return null;
}

async function envoyer(abonnes, ev, resume) {
  const web = [], iosParMessage = new Map();
  abonnes.forEach((ab) => {
    const m = messagePour(ab, ev);
    if (!m) return;
    if (ab.canal === 'web') web.push([ab, m]);
    else {
      const k = m.title + '|' + m.body;
      if (!iosParMessage.has(k)) iosParMessage.set(k, { m, tokens: [] });
      iosParMessage.get(k).tokens.push(ab.cle);
    }
  });
  await Promise.all(web.map(async ([ab, m]) => {
    try { await webpush.sendNotification(ab.web, JSON.stringify(m)); resume.envoyees++; }
    catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        await supabase('push_subscriptions', { method: 'DELETE', query: '?endpoint=eq.' + encodeURIComponent(ab.cle) }).catch(() => {});
        resume.nettoyes++;
      } else resume.erreurs.push('web ' + (e.statusCode || '') + ' ' + String(e.message).slice(0, 60));
    }
  }));
  for (const { m, tokens } of iosParMessage.values()) {
    const res = await sendApnsBatch(tokens, m);
    resume.envoyees += res.filter((r) => r.ok).length;
    const morts = res.filter((r) => r.invalid).map((r) => r.deviceToken);
    res.filter((r) => !r.ok && !r.invalid).forEach((r) => resume.erreurs.push('apns HTTP ' + r.status));
    for (const t of morts) { await supabase('apns_subscriptions', { method: 'DELETE', query: '?device_token=eq.' + encodeURIComponent(t) }).catch(() => {}); resume.nettoyes++; }
  }
}

// ── Un passage ─────────────────────────────────────────────────────────────
async function unTick(abonnes, resume) {
  if (!abonnes.length) return;
  const live = await lireLive(resume);
  const parId = new Map(live.map((f) => [f.id, f]));
  const suivis = live.filter((f) => abonnes.some((ab) => concerne(ab, f)));
  const encours = (await redis([['SMEMBERS', 'push:encours']]))[0] || [];
  const disparus = encours.map(Number).filter((id) => !parId.has(id));
  const ids = [...new Set(suivis.map((f) => f.id).concat(disparus))];
  resume.suivisEnDirect = Math.max(resume.suivisEnDirect, suivis.length);
  if (!ids.length) return;

  const etats = await redis(ids.map((id) => ['GET', 'push:etat:' + id]));
  const avant = {};
  ids.forEach((id, i) => {
    const v = etats[i];
    if (!v) return;
    const [sc, st, noms] = String(v).split('|');
    const [h, a] = sc.split('-').map(Number);
    avant[id] = { h, a, st, noms };
  });

  const ecritures = [], evenements = [];
  for (const f of suivis) {
    const p = avant[f.id];
    const valeur = f.h + '-' + f.a + '|' + f.st + '|' + encodeURIComponent(f.dom.id + ':' + f.dom.nom + '~' + f.ext.id + ':' + f.ext.nom);
    if (!p) { ecritures.push(['SET', 'push:etat:' + f.id, valeur, 'EX', ETAT_TTL_S], ['SADD', 'push:encours', String(f.id)]); continue; }
    const nouveaux = (f.h + f.a) - ((p.h || 0) + (p.a || 0));
    if (nouveaux > 0) {
      const buts = await butsDuMatch(f.id, resume);
      const recents = buts.slice(-nouveaux);
      // Un but par notification ; si les événements ne sont pas encore à jour, on
      // annonce le but sans buteur plutôt que d'attendre.
      let h = p.h || 0, a = p.a || 0;
      for (let i = 0; i < nouveaux; i++) {
        const b = recents[i] || null;
        let cote = b && b.equipeId === f.dom.id ? 'dom' : b && b.equipeId === f.ext.id ? 'ext' : null;
        if (!cote) cote = f.h > h ? 'dom' : 'ext';
        if (cote === 'dom') h++; else a++;
        evenements.push({ type: 'but', cote, but: b, f: Object.assign({}, f, { h: Math.min(h, f.h), a: Math.min(a, f.a) }) });
      }
    }
    if (f.st === 'HT' && p.st !== 'HT') evenements.push({ type: 'mt', f });
    if (FINIS.has(f.st) && !FINIS.has(p.st)) evenements.push({ type: 'fin', f });
    if (p.h !== f.h || p.a !== f.a || p.st !== f.st) ecritures.push(['SET', 'push:etat:' + f.id, valeur, 'EX', ETAT_TTL_S]);
  }

  // Matchs sortis du flux direct : on vérifie leur statut (par lots de 20) pour annoncer la fin.
  const aVerifier = disparus.filter((id) => avant[id] && !FINIS.has(avant[id].st));
  const aOublier = disparus.filter((id) => !avant[id] || FINIS.has(avant[id].st));
  for (let i = 0; i < aVerifier.length; i += 20) {
    const lot = aVerifier.slice(i, i + 20);
    resume.appelsFin++;
    const rep = compacter(await apiFootball('fixtures?ids=' + lot.join('-'), 'push-fin').catch(() => []));
    for (const f of rep) {
      if (FINIS.has(f.st)) { evenements.push({ type: 'fin', f }); aOublier.push(f.id); }
      else if (ABANDONNES.has(f.st)) aOublier.push(f.id);
    }
  }
  aOublier.forEach((id) => ecritures.push(['SREM', 'push:encours', String(id)], ['DEL', 'push:etat:' + id]));

  // L'état est écrit AVANT l'envoi : si l'envoi plante, on perd une notification
  // plutôt que d'en répéter une à chaque minute.
  if (ecritures.length) await redis(ecritures);
  for (const ev of evenements) {
    resume.evenements.push(ev.type + ' ' + ev.f.id + ' ' + ev.f.h + '-' + ev.f.a);
    await envoyer(abonnes, ev, resume);
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const t0 = Date.now();
  const resume = { ticks: 0, abonnes: 0, suivisEnDirect: 0, source: null, appelsLive: 0, appelsEvenements: 0, appelsFin: 0, evenements: [], envoyees: 0, nettoyes: 0, erreurs: [] };
  try {
    requireEnv(['API_FOOTBALL_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'KV_REST_API_URL', 'KV_REST_API_TOKEN', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']);
    webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    const apnsActif = apnsConfigured();
    let abonnes = [], chargesA = 0;
    while (Date.now() - t0 < RUN_BUDGET_MS) {
      const debut = Date.now();
      resume.ticks++;
      try {
        if (Date.now() - chargesA > RAFRAICHIR_ABONNES_MS) { abonnes = await chargerAbonnes(apnsActif); chargesA = Date.now(); resume.abonnes = abonnes.length; }
        await unTick(abonnes, resume);
      } catch (e) { resume.erreurs.push(String(e.message).slice(0, 160)); }
      if (!abonnes.length) break;                 // personne d'inscrit : inutile de boucler
      const ecoule = Date.now() - debut;
      if (Date.now() - t0 + TICK_MS > RUN_BUDGET_MS) break;
      if (ecoule < TICK_MS) await sleep(TICK_MS - ecoule);
    }
    resume.dureeMs = Date.now() - t0;
    resume.a = new Date().toISOString();
    if (resume.evenements.length || resume.erreurs.length) console.log('[push] ' + JSON.stringify(resume));
    await redis([['SET', 'push:dernier', JSON.stringify(resume), 'EX', 3600]]).catch(() => {});
    if (resume.evenements.length) await redis([['LPUSH', 'push:historique', JSON.stringify({ a: resume.a, evenements: resume.evenements, envoyees: resume.envoyees })], ['LTRIM', 'push:historique', 0, 49]]).catch(() => {});
    res.status(200).json(resume);
  } catch (e) {
    resume.erreurs.push(e.message);
    console.log('[push] ' + JSON.stringify(resume));
    res.status(500).json(resume);
  }
}
