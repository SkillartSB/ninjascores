// Notification de fin de gros match (20/09/2026), en mode éditorial.
//
// Rien à voir avec les pronostics : on raconte le match. Le ton dépend du
// scénario — carton, exploit de l'outsider, festival de buts, favori accroché
// — deduit du score final et des cotes d'avant-match.
//
//   /api/push-fin-match/?fixture=1552773&cle=<PUSH_ADMIN_SECRET>&simulation=1
//
// Reservée aux affiches : declenchée à la main, match par match. Un envoi
// automatique à chaque fin de rencontre serait insupportable.
//
// Textes forcés si besoin : &titre=...&corps=... (les deux ensemble, français
// seulement — les autres langues gardent le texte calculé).
//
// AUCUN import depuis lib/*.mjs (voir project_quota_api).
import { SITE, FINIS, requireEnv, lireMatch, lireCotes1N2, destinataires, dedupe, envoyer, nomCourt } from './_push.js';

// Meme forme que push-goals : libelle + identifiant (l'URL canonique).
const slug = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const URL_MATCH = (f) => '/football/match/' + slug(f.teams.home.name) + '-' + slug(f.teams.away.name) + '-' + f.fixture.id + '/';

// Ratio à partir duquel une victoire de l'outsider devient « un exploit » :
// le favori devait être au moins 1,7 fois plus probable.
const SEUIL_EXPLOIT = 1.7;
// Cote en dessous de laquelle un favori qui concède le nul s'est « fait accrocher ».
const SEUIL_ACCROCHE = 1.45;

/** Scénario du match, à partir du score et des cotes d'avant-match. */
export function scenario(f, cotes) {
  const bh = f.goals.home, ba = f.goals.away;
  const ecart = Math.abs(bh - ba), total = bh + ba;
  const nul = bh === ba;
  const vainqueur = nul ? null : (bh > ba ? f.teams.home : f.teams.away);
  const perdant = nul ? null : (bh > ba ? f.teams.away : f.teams.home);

  let favori = null, coteFavori = null;
  if (cotes) {
    favori = cotes.dom < cotes.ext ? 'dom' : 'ext';
    coteFavori = Math.min(cotes.dom, cotes.ext);
  }
  const gagnantEstOutsider = !nul && favori && ((bh > ba && favori === 'ext') || (ba > bh && favori === 'dom'));
  const rapport = cotes ? Math.max(cotes.dom, cotes.ext) / Math.min(cotes.dom, cotes.ext) : 1;

  if (gagnantEstOutsider && rapport >= SEUIL_EXPLOIT) return { type: 'exploit', vainqueur, perdant, ecart, total };
  if (ecart >= 3) return { type: 'carton', vainqueur, perdant, ecart, total };
  if (nul && coteFavori && coteFavori <= SEUIL_ACCROCHE) {
    return { type: 'accroche', vainqueur: null, perdant: null, ecart, total, favori: favori === 'dom' ? f.teams.home : f.teams.away };
  }
  if (total >= 5) return { type: 'festival', vainqueur, perdant, ecart, total };
  if (nul) return { type: 'nul', vainqueur: null, perdant: null, ecart, total };
  return { type: 'victoire', vainqueur, perdant, ecart, total };
}

// Un titre par scénario et par langue. Le nom d'équipe est déjà porté par
// l'article défini français (« l'OM », « le PSG ») : les autres langues
// utilisent le nom brut.
const TITRES = {
  fr: {
    exploit: (s) => '🔥 ' + maj(nomCourt(s.vainqueur.name)) + ' crée l\'exploit !',
    carton: (s) => '💥 Carton ' + de(nomCourt(s.vainqueur.name)),
    accroche: (s) => '😮 ' + maj(nomCourt(s.favori.name)) + ' accroché',
    festival: (s) => '🎇 Quel match !',
    nul: () => '⚖️ Dos à dos',
    victoire: (s) => '🏁 ' + maj(nomCourt(s.vainqueur.name)) + ' s\'impose',
  },
  en: {
    exploit: (s) => '🔥 ' + s.vainqueur.name + ' pull off the upset!',
    carton: (s) => '💥 ' + s.vainqueur.name + ' run riot',
    accroche: (s) => '😮 ' + s.favori.name + ' held',
    festival: () => '🎇 What a game!',
    nul: () => '⚖️ Honours even',
    victoire: (s) => '🏁 ' + s.vainqueur.name + ' win it',
  },
  es: {
    exploit: (s) => '🔥 ¡' + s.vainqueur.name + ' da la sorpresa!',
    carton: (s) => '💥 Goleada ' + (s.vainqueur.name.startsWith('el ') ? '' : 'de ') + s.vainqueur.name,
    accroche: (s) => '😮 ' + s.favori.name + ' se atasca',
    festival: () => '🎇 ¡Vaya partido!',
    nul: () => '⚖️ Reparto de puntos',
    victoire: (s) => '🏁 Gana ' + s.vainqueur.name,
  },
  pt: {
    exploit: (s) => '🔥 ' + s.vainqueur.name + ' faz a proeza!',
    carton: (s) => '💥 Goleada ' + (s.vainqueur.name.startsWith('o ') ? '' : 'do ') + s.vainqueur.name,
    accroche: (s) => '😮 ' + s.favori.name + ' travado',
    festival: () => '🎇 Que jogo!',
    nul: () => '⚖️ Empate',
    victoire: (s) => '🏁 ' + s.vainqueur.name + ' vence',
  },
};

function maj(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
// « le PSG » -> « du PSG », « l'OM » -> « de l'OM ».
function de(s) {
  if (s.startsWith('le ')) return 'du ' + s.slice(3);
  if (s.startsWith('la ')) return 'de la ' + s.slice(3);
  if (s.startsWith('les ')) return 'des ' + s.slice(4);
  return 'de ' + s;
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

    const f = await lireMatch(fixtureId);
    if (!f) return res.status(404).json({ erreur: 'match introuvable' });
    const statut = f.fixture.status.short;
    resume.match = f.teams.home.name + ' ' + f.goals.home + '-' + f.goals.away + ' ' + f.teams.away.name + ' (' + statut + ')';
    if (!FINIS.has(statut)) return res.status(409).json(Object.assign(resume, { erreur: 'match non terminé' }));

    const cotes = await lireCotes1N2(fixtureId);
    const s = scenario(f, cotes);
    resume.scenario = s.type;
    resume.cotes = cotes || 'indisponibles';

    const score = f.teams.home.name + ' ' + f.goals.home + '-' + f.goals.away + ' ' + f.teams.away.name;
    const corps = score + (f.league && f.league.name ? ' · ' + f.league.name : '');
    const forceTitre = String(q.titre || '').trim();
    const forceCorps = String(q.corps || '').trim();

    const message = (lang) => ({
      title: (lang === 'fr' && forceTitre) ? forceTitre : TITRES[lang][s.type](s),
      body: (lang === 'fr' && forceCorps) ? forceCorps : corps,
      url: URL_MATCH(f),
      tag: 'ns-fin-' + fixtureId,
    });
    resume.texte = { fr: message('fr'), en: message('en'), es: message('es'), pt: message('pt') };

    let vises = await destinataires('fin', resume, maintenant);
    if (!simulation) vises = await dedupe('push:fin-match:' + fixtureId, vises, resume);
    if (simulation) return res.status(200).json(resume);

    await envoyer(vises, message, resume);
    console.log('[push-fin-match] ' + JSON.stringify(resume));
    res.status(200).json(resume);
  } catch (e) {
    resume.erreurs.push(String(e.message).slice(0, 200));
    console.log('[push-fin-match] ' + JSON.stringify(resume));
    res.status(500).json(resume);
  }
}
