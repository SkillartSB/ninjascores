// Rendu serveur des pages indexables — /football/**
//
// L'application est un React monopage sans routing : le crawler ne recevait
// qu'un <div id="root"> vide et 2 133 caracteres de libelles de menu. Cette
// fonction sert le VRAI contenu en HTML des la premiere reponse, sans aucune
// execution de JavaScript.
//
// Trois niveaux, du plus general au plus precis :
//   /football/                        pays couverts
//   /football/{pays}/                 championnats du pays
//   /football/{pays}/{competition}/   classement complet
//
// Les donnees viennent des fichiers statiques data/standings/, pas de l'API :
// lecture disque, zero quota consomme, reponse instantanee.

import fs from 'fs';
import path from 'path';

// Competitions suivies editorialement : si une ligue merite un article, ses
// matchs meritent le sitemap. Sinon non.
//
// Volontairement recopie de LIGUES (lib/articles/moteur.mjs) plutot
// qu'importe : Vercel transpile cette fonction d'ESM vers CommonJS, et
// l'import d'un .mjs y provoque un FUNCTION_INVOCATION_FAILED — toutes les
// pages SSR sont tombees en 500 le 15/08/2026 pour cette raison.
// A tenir synchronise si LIGUES evolue.
const LIGUES_SITEMAP = new Set([2,3,39,40,41,42,61,62,71,72,78,79,88,89,94,95,
  128,135,136,140,141,144,179,207,208,218,239,242,253,262,265,268,281,848]);

const SITE = 'https://ninjascores.com';
// Canari CLS : types de page sur lesquels le correctif "#root masque jusqu'au
// retrait de #ns-seo" est actif. Etendre progressivement une fois verifie
// (voir HIDE_ROOT_TYPES plus bas dans page()).
const HIDE_ROOT_TYPES = new Set(['competition', 'joueur', 'match']); // match : un seul appel reseau (fixtures&id=), pas de cascade — donnees live, pas de preload (fraicheur)
const DIR = path.join(process.cwd(), 'data', 'standings');

// ── utilitaires ────────────────────────────────────────────────────────────
const slug = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

let _man = null;
function manifeste() {
  if (!_man) _man = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8')).pays;
  return _man;
}
function paysParSlug(s) {
  const m = manifeste();
  for (const cle of Object.keys(m)) if (slug(m[cle].nom) === s) return { cle, ...m[cle] };
  return null;
}
// L'API-Football renvoie les pays en anglais (« Brazil »). Le manifeste porte
// deja leur nom francais : on s'en sert plutot que d'afficher l'anglais brut
// sur un site francophone.
function paysFr(nomApi) {
  if (!nomApi) return '';
  const m = manifeste();
  if (m[nomApi] && m[nomApi].nom) return m[nomApi].nom;
  const cible = String(nomApi).toLowerCase();
  for (const cle of Object.keys(m)) if (cle.toLowerCase() === cible) return m[cle].nom;
  return nomApi;
}
function lirePays(cle) {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, cle + '.json'), 'utf8')); }
  catch (e) { return null; }
}
// derniere saison reellement disputee : une saison a zero match donnerait un
// tableau alphabetique a zero point, sans interet et penalisant pour le SEO
function saisonUtile(saisons) {
  const jouees = Object.keys(saisons || {})
    .filter((s) => (saisons[s] || []).some((r) => (r.played || 0) > 0));
  return jouees.sort().pop() || null;
}

// ── gabarit commun ─────────────────────────────────────────────────────────
// `canon` : URL canonique differente de l'URL servie. Sert aux onglets
// secondaires d'un match, qui doivent exister et etre navigables sans creer
// pour autant une page concurrente de la fiche principale.
// `robots` : surcharge pour les onglets sans contenu (volume, statistiques
// absentes) — un canonical sur une page vide reste une page vide a crawler.
// La page servie doit etre L'APPLICATION, pas un document a part : un
// visiteur venu de Google atterrissait sur une page nue, sans navigation ni
// scores en direct. On repart donc de index.html — meme coquille, memes
// scripts, meme design — dans laquelle on injecte le contenu indexable et les
// metadonnees de la page. React demarre ensuite, ouvre le bon ecran et retire
// le bloc SEO. Un seul rendu, donc aucune derive possible entre les deux.
let _shell = null;
function coquille() {
  if (_shell) return _shell;
  _shell = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  return _shell;
}

// Le contenu injecte vit dans #ns-seo : toutes les regles y sont confinees
// pour ne pas deteindre sur l'application, qui a ses propres <table>, <header>
// et <nav> globaux.
const CSS_SEO = `
#ns-seo{--v:#6133E0;--t:#14121c;--s:#5b5870;--b:#e8e5f0;--bg:#faf9fd;
 background:var(--bg);color:var(--t);min-height:100vh;
 font:15px/1.55 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
#ns-seo *{box-sizing:border-box}
#ns-seo .hd{background:linear-gradient(135deg,#1a103a,#6133E0);padding:18px 20px}
#ns-seo .hd a{color:#fff;text-decoration:none;font-weight:800;letter-spacing:.5px}
#ns-seo main{max-width:860px;margin:0 auto;padding:20px 16px 56px;display:block}
#ns-seo nav.fil{font-size:13px;color:var(--s);margin-bottom:18px}
#ns-seo nav.fil a{color:var(--v);text-decoration:none}
#ns-seo nav.fil .sep{margin:0 7px;opacity:.5}
#ns-seo h1{font-size:26px;line-height:1.2;margin:0 0 6px;color:var(--t)}
#ns-seo .sous{color:var(--s);margin:0 0 22px}
#ns-seo .sous a{color:var(--v);text-decoration:none;font-weight:600}
#ns-seo h2{font-size:18px;margin:30px 0 12px;color:var(--t)}
#ns-seo table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--b);
 border-radius:10px;overflow:hidden;margin:0}
#ns-seo th,#ns-seo td{padding:9px 10px;text-align:center;border-bottom:1px solid var(--b);font-size:14px}
#ns-seo th{background:#f3f1f9;font-size:12px;color:var(--s);text-transform:uppercase;letter-spacing:.4px}
#ns-seo td.eq,#ns-seo th.eq{text-align:left}
#ns-seo td.eq a{color:var(--t);text-decoration:none;font-weight:600}
#ns-seo tr:last-child td{border-bottom:none}
#ns-seo .pts{font-weight:800;color:var(--v)}
#ns-seo ul.liens{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:8px}
#ns-seo ul.liens a{display:inline-block;padding:7px 12px;background:#fff;border:1px solid var(--b);
 border-radius:8px;color:var(--v);text-decoration:none;font-weight:600;font-size:14px}
#ns-seo nav.ong{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 24px;padding-bottom:12px;
 border-bottom:1px solid var(--b)}
#ns-seo nav.ong a,#ns-seo nav.ong .on{padding:7px 13px;border-radius:999px;font-size:14px;
 font-weight:600;text-decoration:none;white-space:nowrap}
#ns-seo nav.ong a{color:var(--s);background:#fff;border:1px solid var(--b)}
#ns-seo nav.ong .on{background:var(--v);color:#fff;border:1px solid var(--v)}
#ns-seo .pied{border-top:1px solid var(--b);margin-top:36px;padding-top:16px;font-size:13px;color:var(--s)}
#ns-seo .pied a{color:var(--v)}
/* Une fois deplace en pied de l'application, le bloc n'est plus sous #ns-seo :
   il doit donc porter son propre style, et surtout s'accorder au theme clair
   comme au theme sombre. D'ou la couleur heritee du conteneur plutot qu'une
   valeur en dur, et des bordures semi-transparentes. */
#ns-apropos{padding:26px 16px 40px;max-width:860px;margin:0 auto;
 border-top:1px solid rgba(128,128,128,.22);color:inherit;
 font:14px/1.65 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
#ns-apropos h2{font-size:16px;font-weight:800;margin:0 0 10px;color:inherit}
#ns-apropos p{margin:0 0 12px;color:inherit;opacity:.9}
#ns-apropos p.sous{font-size:13px;opacity:.7}
#ns-apropos a{color:#7C5CF0;text-decoration:none;font-weight:600}
#ns-apropos a:hover{text-decoration:underline}
#ns-seo #ns-apropos{border-top:1px solid var(--b);padding:0;margin:0;max-width:none}
#ns-seo #ns-apropos h2{font-size:18px;margin:30px 0 12px}
`;

function remplacerBalise(html, motif, remplacement) {
  return motif.test(html) ? html.replace(motif, remplacement) : html;
}

// `cible` decrit a l'application quel ecran rouvrir. On l'emet depuis le
// serveur, qui connait deja les identifiants exacts : le client n'a pas a
// rededuire un pays ou un championnat a partir d'un slug d'URL.
// Article de pronostic associe a un match, s'il a ete genere par le cron.
// Sans ce lien, les articles n'etaient atteignables que par le sitemap.
// Racine de l'article selon sa langue. Elle etait codee en dur en francais :
// depuis le passage au multilingue, un match argentin ou anglais aurait pointe
// vers /football/pronostic/…, une URL qui n'existe pas pour ces articles.
const RACINE_LG = { fr: '/football/pronostic/', en: '/en/football/prediction/',
  es: '/es/futbol/pronostico/', pt: '/pt/futebol/prognostico/',
  br: '/br/futebol/palpite/', nl: '/nl/voetbal/voorspelling/',
  de: '/de/fussball/prognose/', it: '/it/calcio/pronostico/' };

async function lienPronostic(fixtureId) {
  const u = process.env.SUPABASE_URL, k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!u || !k) return null;
  try {
    const r = await fetch(
      `${u}/rest/v1/articles?fixture_id=eq.${fixtureId}&select=slug,titre,langue&limit=1`,
      { headers: { apikey: k, Authorization: 'Bearer ' + k } });
    if (!r.ok) return null;
    const j = await r.json();
    const a = j?.[0];
    return a ? { ...a, racine: RACINE_LG[a.langue] || RACINE_LG.fr } : null;
  } catch (e) { return null; }
}

function page({ url, titre, desc, h1, fil, corps, jsonld, canon, robots, cible, preload }) {
  const canonique = SITE + (canon || url);
  const filHtml = fil.map((f) => (f.url
    ? `<a href="${esc(f.url)}">${esc(f.nom)}</a>`
    : `<span aria-current="page">${esc(f.nom)}</span>`)).join('<span class="sep">›</span>');
  const ld = [{
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: fil.map((f, i) => ({
      '@type': 'ListItem', position: i + 1, name: f.nom,
      item: f.url ? SITE + f.url : canonique,
    })),
  }].concat(jsonld || []);
  const rb = robots || 'index, follow, max-image-preview:large, max-snippet:-1';

  let h = coquille();
  h = remplacerBalise(h, /<title>[\s\S]*?<\/title>/, '<title>' + esc(titre) + '</title>');
  h = remplacerBalise(h, /<link rel="canonical"[^>]*>/, '<link rel="canonical" href="' + esc(canonique) + '"/>');
  h = remplacerBalise(h, /<meta name="description"[^>]*>/, '<meta name="description" content="' + esc(desc) + '"/>');
  h = remplacerBalise(h, /<meta name="robots"[^>]*>/, '<meta name="robots" content="' + esc(rb) + '"/>');
  h = remplacerBalise(h, /<meta property="og:url"[^>]*>/, '<meta property="og:url" content="' + esc(canonique) + '"/>');
  h = remplacerBalise(h, /<meta property="og:title"[^>]*>/, '<meta property="og:title" content="' + esc(titre) + '"/>');
  h = remplacerBalise(h, /<meta property="og:description"[^>]*>/, '<meta property="og:description" content="' + esc(desc) + '"/>');
  h = remplacerBalise(h, /<meta name="twitter:title"[^>]*>/, '<meta name="twitter:title" content="' + esc(titre) + '"/>');
  h = remplacerBalise(h, /<meta name="twitter:description"[^>]*>/, '<meta name="twitter:description" content="' + esc(desc) + '"/>');

  // CANARY (types dans HIDE_ROOT_TYPES uniquement) : #root demarre invisible
  // et hors mise en page tant que #ns-seo n'a pas ete retire cote client.
  // Sans ca, les deux blocs coexistent le temps que React resolve ses
  // donnees, la page double de hauteur, puis s'effondre d'un coup au retrait
  // de #ns-seo — c'est exactement ce shift que confirme Lighthouse (CLS
  // ~1.0 sur une page competition testee). A generaliser a tous les types
  // une fois verifie sur ce premier lot.
  const styleRacine = HIDE_ROOT_TYPES.has((cible || {}).type)
    ? '<style>#root{display:none}</style>\n' : '';
  h = h.replace('</head>', styleRacine + '<style>' + CSS_SEO + '</style>\n'
    + '<script type="application/ld+json">' + JSON.stringify(ld) + '</script>\n</head>');

  const bloc = '<div id="ns-seo">'
    + '<div class="hd"><a href="/">NINJA<span style="opacity:.75">SCORES</span></a></div>'
    + '<main>'
    + '<nav class="fil" aria-label="Fil d\'ariane">' + filHtml + '</nav>'
    + '<h1>' + esc(h1) + '</h1>'
    + corps
    + '<p class="pied">Données mises à jour régulièrement · '
    + '<a href="/">Voir les scores en direct sur NinjaScores</a></p>'
    + '</main></div>'
    + '<script>window.NS_SEO_CIBLE=' + JSON.stringify(cible || null) + ';</script>'
    + (preload ? '<script>window.__NS_PRELOAD_STANDINGS=' + JSON.stringify(preload) + ';</script>' : '');

  // Le bloc SEO est injecte juste apres <body>, AVANT les modales/widgets
  // statiques de l'appli (pronostics, connexion, parrainage — ~16 Ko de HTML
  // identiques sur les 12 000+ pages). Sans ca, un crawler qui pese la
  // prominence du contenu par ordre d'apparition dans le source voit d'abord
  // ce bloc generique, puis seulement le contenu unique de la page — nefaste
  // pour un domaine jeune qui doit etablir sa pertinence thematique.
  return h.replace('<body>', '<body>\n' + bloc);
}

// ── /football/ ─────────────────────────────────────────────────────────────
async function pageRacine() {
  const m = manifeste();
  const pays = Object.keys(m)
    .map((cle) => ({ cle, nom: m[cle].nom, n: (m[cle].ordre || []).length }))
    .filter((p) => p.n > 0)
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const liens = pays.map((p) =>
    `<li><a href="/football/${slug(p.nom)}/">${esc(p.nom)}</a></li>`).join('');

  // Pronostics recents : maillage interne vers les articles, sans lequel
  // Google ne les decouvre jamais (« Aucune page d'origine detectee »).
  let blocPronos = '';
  try {
    const u = process.env.SUPABASE_URL, k = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (u && k) {
      const depuis = new Date(Date.now() - 3 * 86400 * 1000).toISOString();
      const r = await fetch(
        `${u}/rest/v1/articles?langue=eq.fr&coup_envoi=gte.${depuis}&select=slug,competition,payload&order=coup_envoi.desc&limit=20`,
        { headers: { apikey: k, Authorization: 'Bearer ' + k } });
      if (r.ok) {
        const arts = await r.json();
        const items = arts.map((a) => {
          const dom = a.payload?.entete?.domicile?.nom || '';
          const ext = a.payload?.entete?.exterieur?.nom || '';
          if (!dom || !ext) return '';
          return `<li><a href="/football/pronostic/${esc(a.slug)}/">${esc(dom)} – ${esc(ext)}</a>`
            + (a.competition ? ` <small style="color:#6B7280">(${esc(a.competition)})</small>` : '')
            + '</li>';
        }).filter(Boolean).join('');
        if (items) {
          blocPronos = '<h2>Pronostics récents</h2><ul class="liens">' + items + '</ul>'
            + '<p><a href="/pronostics/">Tous les pronostics du jour →</a></p>';
        }
      }
    }
  } catch (e) { /* pas de pronostics, pas grave */ }

  return page({
    cible: { type: 'racine' },
    url: '/football/',
    titre: 'Football — classements et résultats de ' + pays.length + ' pays | NinjaScores',
    desc: 'Classements, résultats et calendriers de ' + pays.length + ' pays : Ligue 1, '
        + 'Premier League, Liga, Serie A, Bundesliga et des centaines de championnats.',
    h1: 'Football — ' + pays.length + ' pays couverts',
    fil: [{ nom: 'Accueil', url: '/' }, { nom: 'Football' }],
    corps: `<p class="sous">Choisissez un pays pour accéder à ses championnats, classements et résultats.</p>
${blocPronos}
<h2>Tous les pays</h2><ul class="liens">${liens}</ul>`,
  });
}

// ── /football/{pays}/ ──────────────────────────────────────────────────────
function pagePays(p) {
  const ordre = p.ordre || [];
  const liens = ordre.map((lg) =>
    `<li><a href="/football/${slug(p.nom)}/${slug(lg)}/">${esc(lg)}</a></li>`).join('');
  return page({
    cible: { type: 'pays', pays: p.nom },
    url: `/football/${slug(p.nom)}/`,
    titre: `Football ${p.nom} — classements et résultats des championnats | NinjaScores`,
    desc: `Les ${ordre.length} championnats de ${p.nom} : classements complets, `
        + `résultats et calendrier. ${ordre.slice(0, 3).join(', ')}.`,
    h1: `Football en ${p.nom}`,
    fil: [{ nom: 'Accueil', url: '/' }, { nom: 'Football', url: '/football/' }, { nom: p.nom }],
    corps: `<p class="sous">${ordre.length} championnat${ordre.length > 1 ? 's' : ''} couvert${ordre.length > 1 ? 's' : ''}, du plus haut niveau au plus bas.</p>
<h2>Championnats</h2><ul class="liens">${liens}</ul>`,
    jsonld: [{
      '@context': 'https://schema.org', '@type': 'ItemList',
      name: 'Championnats de football en ' + p.nom,
      itemListElement: ordre.map((lg, i) => ({
        '@type': 'ListItem', position: i + 1, name: lg,
        url: `${SITE}/football/${slug(p.nom)}/${slug(lg)}/`,
      })),
    }],
  });
}

// ── /football/{pays}/{competition}/ ────────────────────────────────────────
function pageCompetition(p, ligue, donnees) {
  const saisons = donnees[ligue];
  const saison = saisonUtile(saisons);
  if (!saison) return null;
  const lignes = saisons[saison] || [];
  // seuil anti-contenu-pauvre : sous 4 equipes la page n'apporte rien
  if (lignes.length < 4) return null;

  const logos = donnees._logos || {};
  const parGroupe = {};
  lignes.forEach((r) => { (parGroupe[r.groupe || ''] = parGroupe[r.groupe || ''] || []).push(r); });

  const tables = Object.keys(parGroupe).map((g) => {
    const rows = parGroupe[g].slice().sort((a, b) => (a.rank || 0) - (b.rank || 0)).map((r) => {
      const lg = logos[r.team];
      return `<tr><td>${esc(r.rank)}</td><td class="eq">${
        lg ? `<img src="${esc(lg)}" alt="" width="18" height="18" loading="lazy" style="vertical-align:-4px;margin-right:6px"> ` : ''
      }${esc(r.team)}</td><td>${esc(r.played)}</td><td>${esc(r.won)}</td><td>${esc(r.drawn)}</td><td>${esc(r.lost)}</td><td>${esc(r.gd)}</td><td class="pts">${esc(r.pts)}</td></tr>`;
    }).join('');
    return (g ? `<h2>${esc(tradGroupe(g))}</h2>` : '')
      + `<table><thead><tr><th>#</th><th class="eq">Équipe</th><th>J</th><th>G</th><th>N</th><th>P</th><th>Diff</th><th>Pts</th></tr></thead><tbody>${rows}</tbody></table>`;
  }).join('');

  const premier = (lignes.find((r) => r.rank === 1) || {}).team || '';
  const autres = (p.ordre || []).filter((l) => l !== ligue).map((l) =>
    `<li><a href="/football/${slug(p.nom)}/${slug(l)}/">${esc(l)}</a></li>`).join('');
  const saisonsDispo = Object.keys(saisons).sort().reverse().slice(0, 8);

  return page({
    // les libelles attendus par STANDINGS_DATA, pas les slugs d'URL :
    // c'est le serveur qui les connait, le client n'a pas a les rededuire
    cible: { type: 'competition', pays: p.nom, ligue },
    preload: { [p.cle]: donnees },
    url: `/football/${slug(p.nom)}/${slug(ligue)}/`,
    titre: `${ligue} ${saison} — classement ${p.nom} | NinjaScores`,
    desc: `Classement complet de ${ligue} (${p.nom}) saison ${saison} : ${lignes.length} équipes, `
        + `points, victoires, différence de buts.${premier ? ' ' + premier + ' en tête.' : ''}`,
    h1: `Classement ${ligue} — ${saison}`,
    fil: [{ nom: 'Accueil', url: '/' }, { nom: 'Football', url: '/football/' },
          { nom: p.nom, url: `/football/${slug(p.nom)}/` }, { nom: ligue }],
    corps: `<p class="sous">${p.nom} · saison ${saison} · ${lignes.length} équipes${premier ? ' · leader : ' + esc(premier) : ''}</p>
${tables}
<h2>Saisons disponibles</h2>
<p class="sous">${saisonsDispo.map(esc).join(' · ')}</p>
${autres ? `<h2>Autres championnats de ${esc(p.nom)}</h2><ul class="liens">${autres}</ul>` : ''}`,
    jsonld: [{
      '@context': 'https://schema.org', '@type': 'SportsOrganization',
      name: ligue, sport: 'Football',
      url: `${SITE}/football/${slug(p.nom)}/${slug(ligue)}/`,
      location: { '@type': 'Country', name: p.nom },
    }],
  });
}


// ── /football/match/{slug}-{id}/ ───────────────────────────────────────────
// L'URL est PERMANENTE : la meme avant, pendant et apres la rencontre. Elle
// n'est jamais supprimee ni redirigee — une page de match termine est l'actif
// de longue traine le plus durable d'un site de scores. L'identifiant en fin
// de slug garantit l'unicite et permet de changer le libelle sans casser le
// lien (301 vers le meme identifiant).
// Le nom du fournisseur est en anglais. L'application le traduit depuis
// longtemps (TRAD_COMPET dans index.html) ; les pages indexees, non — elles
// annoncaient "UEFA Champions League" quand le site affiche "Ligue des
// Champions". C'est le nom francais qui doit figurer dans les titres.
const TRAD_COMPET = {
  'UEFA Champions League': 'Ligue des Champions',
  'UEFA Europa League': 'Ligue Europa',
  'UEFA Europa Conference League': 'Ligue Conférence',
  'UEFA Super Cup': "Supercoupe d'Europe",
  'UEFA Nations League': 'Ligue des Nations',
  'Euro Championship': "Championnat d'Europe",
  'World Cup': 'Coupe du monde',
  'FIFA Club World Cup': 'Coupe du monde des clubs',
  'Africa Cup of Nations': "Coupe d'Afrique des nations",
  'CAF Champions League': 'Ligue des Champions de la CAF',
  'CAF Confederation Cup': 'Coupe de la Confédération',
  'CONMEBOL Libertadores': 'Copa Libertadores',
  'CONMEBOL Sudamericana': 'Copa Sudamericana',
  'CONCACAF Champions League': 'Ligue des Champions de la CONCACAF',
  'CONCACAF Gold Cup': 'Gold Cup',
  'CONCACAF Nations League': 'Ligue des Nations de la CONCACAF',
  'AFC Champions League Elite': "Ligue des Champions de l'AFC",
  'AFC Champions League Two': "Coupe de l'AFC",
  'Asian Cup': "Coupe d'Asie des nations",
  'Gulf Cup of Nations': 'Coupe du Golfe',
  'Arab Club Champions Cup': 'Coupe arabe des clubs champions',
};
function tradCompet(nom) {
  const n = String(nom || '');
  if (TRAD_COMPET[n]) return TRAD_COMPET[n];
  const q = n.match(/^World Cup - Qualification (.+)$/);
  if (q) {
    const z = { Europe: 'Europe', Africa: 'Afrique', Asia: 'Asie', CONCACAF: 'CONCACAF',
                'South America': 'Amérique du Sud', Oceania: 'Océanie' }[q[1]] || q[1];
    return 'Éliminatoires Coupe du monde · ' + z;
  }
  if (/^Cup$/i.test(n)) return 'Coupe';
  if (/^Super Cup$/i.test(n)) return 'Supercoupe';
  if (/^League Cup$/i.test(n)) return 'Coupe de la Ligue';
  return n;
}

// Traduit les sous-titres / groupes de classement (phases, poules, conférences).
// Meme jeu de regles que window.NS_TRAD_GROUPE cote client.
function tradGroupe(s) {
  if (!s) return s;
  let r = String(s);
  const rules = [
    [/Conference League Play-?off Group/gi, 'Barrages Ligue Conférence'],
    [/Copa Libertadores Play-?off/gi, 'Barrage Copa Libertadores'],
    [/CL\/EL Play-?offs?/gi, 'Barrages LDC/Ligue Europa'],
    [/Europa League Group/gi, 'Poule Ligue Europa'],
    [/Championship Round/gi, 'Tour du titre'],
    [/Championship Group/gi, 'Poule de titre'],
    [/Relegation Round/gi, 'Tour de relégation'],
    [/Relegation Group/gi, 'Poule de relégation'],
    [/Rel\.?\/Prom\.? Play-?offs?/gi, 'Barrages relégation/promotion'],
    [/Relegation\/Promotion/gi, 'Relégation/Promotion'],
    [/Promotion Play-?offs?/gi, 'Barrages de promotion'],
    [/Promotion Round/gi, 'Tour de promotion'],
    [/Promotion Group/gi, 'Poule de promotion'],
    [/Middle Play-?offs Group/gi, 'Poule de barrages intermédiaires'],
    [/Qualification Play-?off/gi, 'Barrage de qualification'],
    [/Qualifying Play-?off/gi, 'Barrage de qualification'],
    [/Qualifying Round/gi, 'Tour de qualification'],
    [/Regular Season/gi, 'Saison régulière'],
    [/Group Stage/gi, 'Phase de groupes'],
    [/Winners Stage/gi, 'Phase des vainqueurs'],
    [/Losers Stage/gi, 'Phase des perdants'],
    [/Main Round/gi, 'Tour principal'],
    [/Opening Bottom 6/gi, 'Ouverture — Bas 6'],
    [/Closing Bottom 6/gi, 'Clôture — Bas 6'],
    [/Opening Top 6/gi, 'Ouverture — Top 6'],
    [/Closing Top 6/gi, 'Clôture — Top 6'],
    [/Opening Round/gi, "Tour d'ouverture"],
    [/Closing Round/gi, 'Tour de clôture'],
    [/Lower Table Round/gi, 'Tour bas de tableau'],
    [/Upper Table Round/gi, 'Tour haut de tableau'],
    [/Placement Matches/gi, 'Matchs de classement'],
    [/Placement Round/gi, 'Tour de classement'],
    [/Intermediate Round/gi, 'Tour intermédiaire'],
    [/Hexagonal Final/gi, 'Hexagonal final'],
    [/Final Four/gi, 'Final Four'],
    [/Eastern Conference/gi, 'Conférence Est'],
    [/Western Conference/gi, 'Conférence Ouest'],
    [/\bConference\b/gi, 'Conférence'],
    [/Qualification Playoff/gi, 'Barrage de qualification'],
    [/Play-?offs?/gi, 'Barrages'],
    [/1st Phase/gi, '1re phase'], [/2nd Phase/gi, '2e phase'],
    [/1st Stage/gi, '1re phase'], [/2nd Stage/gi, '2e phase'], [/First Stage/gi, '1re phase'],
    [/1st Round/gi, '1er tour'], [/2nd Round/gi, '2e tour'],
    [/First Amateur Division/gi, 'Première Division Amateur'],
    [/First Division/gi, 'Première Division'], [/Second Division/gi, 'Deuxième Division'], [/Third Division/gi, 'Troisième Division'],
    [/1st Division/gi, '1re Division'], [/2nd Division/gi, '2e Division'],
    [/Torneo Intermedio/gi, 'Tournoi intermédiaire'],
    [/Torneo Competencia/gi, 'Tournoi de compétition'],
    [/Tabla Anual/gi, 'Classement annuel'],
    [/\bPromedios\b/gi, 'Moyennes'],
    [/Quadrangular/gi, 'Quadrangulaire'],
    [/\bGROUP\b/g, 'GROUPE'], [/\bGroup\b/gi, 'Groupe'],
    [/\bRegion\b/gi, 'Région'],
    [/\bEastern\b/gi, 'Est'], [/\bWestern\b/gi, 'Ouest'],
    [/\bNorthern\b/gi, 'Nord'], [/\bSouthern\b/gi, 'Sud'],
    [/Centre-East/gi, 'Centre-Est'],
    [/\bNorth\b/gi, 'Nord'], [/\bSouth\b/gi, 'Sud'],
    [/\bEast\b/gi, 'Est'], [/\bWest\b/gi, 'Ouest'],
    [/\bCentral\b/gi, 'Centre'],
    [/\bOpening\b/gi, 'Ouverture'], [/\bClosing\b/gi, 'Clôture'],
  ];
  rules.forEach((rl) => { r = r.replace(rl[0], rl[1]); });
  return r.replace(/\s+/g, ' ').replace(/\s+:/g, ' :').trim();
}

// Fin estimee d'un match (coup d'envoi + 2 h) pour le champ endDate du
// SportsEvent. Repli sur la date de debut si la date est invalide.
function finEvt(d) {
  try { const t = new Date(d).getTime(); return isNaN(t) ? d : new Date(t + 7200000).toISOString(); }
  catch (e) { return d; }
}

const STATUTS = {
  NS: ['À venir', 'https://schema.org/EventScheduled'],
  '1H': ['1re mi-temps', 'https://schema.org/EventScheduled'],
  HT: ['Mi-temps', 'https://schema.org/EventScheduled'],
  '2H': ['2e mi-temps', 'https://schema.org/EventScheduled'],
  ET: ['Prolongation', 'https://schema.org/EventScheduled'],
  P: ['Tirs au but', 'https://schema.org/EventScheduled'],
  FT: ['Terminé', 'https://schema.org/EventScheduled'],
  AET: ['Terminé (a.p.)', 'https://schema.org/EventScheduled'],
  PEN: ['Terminé (t.a.b.)', 'https://schema.org/EventScheduled'],
  PST: ['Reporté', 'https://schema.org/EventPostponed'],
  CANC: ['Annulé', 'https://schema.org/EventCancelled'],
};
const FINIS = { FT: 1, AET: 1, PEN: 1 };

// Panne API constatee pendant CE rendu.
//
// API-Football repond 200 avec un objet `errors` quand le quota est epuise :
// `response` vaut alors [], indiscernable d'une vraie absence de resultat.
// Sans ce drapeau, une panne de quota transformait toutes les fiches match et
// equipe en 404 — et un 404 dit a Google de RETIRER la page de son index.
// On a perdu de l'indexation ainsi pendant des heures le 25/08/2026.
let _apiIndispo = false;
function apiIndispo() { return _apiIndispo; }
function apiReset() { _apiIndispo = false; }

// On passe par /api/foot plutot que d'appeler API-Football en direct.
//
// Le proxy porte un TTL par endpoint (headtohead 24 h, fixtures 5 min...) et
// ses reponses sont mises en cache par le CDN : le meme appel sert alors TOUS
// les rendus au lieu d'etre refacture a chaque affichage. En direct, une page
// match coutait 8 requetes a CHAQUE visite de robot — 150 000/jour epuisees le
// 25/08/2026, sans un seul visiteur reel.
//
// Le proxy signale les erreurs metier par un 502, ce qui nous donne enfin un
// signal de panne fiable (l'API renvoie 200 meme quand le quota est mort).
async function api(chemin) {
  const i = chemin.indexOf('?');
  const point = i < 0 ? chemin : chemin.slice(0, i);
  const params = i < 0 ? '' : '&' + chemin.slice(i + 1);
  // La barre finale est obligatoire : trailingSlash renverrait une 308.
  const url = SITE + '/api/foot/?path=' + encodeURIComponent(point) + params;
  try {
    const r = await fetch(url);
    if (!r.ok) { _apiIndispo = true; return []; }   // 502 = quota ou panne
    const j = await r.json();
    return (j && j.response) || [];
  } catch (e) {
    _apiIndispo = true;
    return [];
  }
}

function dateFr(iso) {
  const d = new Date(iso);
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
                'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  return d.getDate() + ' ' + MOIS[d.getMonth()] + ' ' + d.getFullYear();
}

// ── onglets d'une fiche match ──────────────────────────────────────────────
// Chaque onglet a son URL, son rendu serveur et sa regle d'indexation.
//   canon 'self' : page a part entiere, canonique auto-referente
//   canon 'base' : navigable, mais canonique vers la fiche principale
// `vide` bascule en noindex quand le fournisseur ne renvoie rien : un
// canonical sur une page sans contenu reste une page sans contenu a crawler.
const ONGLETS = [
  { id: 'resume',     seg: '',             nom: 'Résumé',       canon: 'base' },
  { id: 'cotes',      seg: 'cotes',        nom: 'Cotes',        canon: 'base' },
  { id: 'pronostics', seg: 'pronostics',   nom: 'Pronostics',   canon: 'self' },
  { id: 'compo',      seg: 'compositions', nom: 'Compositions', canon: 'self' },
  { id: 'volume',     seg: 'volume',       nom: 'Volume',       canon: 'base' },
  { id: 'stats',      seg: 'statistiques', nom: 'Statistiques', canon: 'self' },
  { id: 'tat',        seg: 'tete-a-tete',  nom: 'Tête-à-tête',  canon: 'self' },
  // `app` : identifiant de l'onglet cote application. Il coincide partout
  // sauf pour le dernier, que le bundle appelle 'classements' : la fiche
  // s'ouvrait alors sur un onglet inexistant, sans contenu ni onglet actif.
  { id: 'tableau',    seg: 'tableau',      nom: 'Tableau',      canon: 'base', app: 'classements' },
];
const PAR_SEG = {};
for (const o of ONGLETS) if (o.seg) PAR_SEG[o.seg] = o;

function barreOnglets(base, actif) {
  return '<nav class="ong" aria-label="Sections du match">' + ONGLETS.map((o) => {
    const u = base + (o.seg ? o.seg + '/' : '');
    return o.id === actif
      ? '<span class="on" aria-current="page">' + esc(o.nom) + '</span>'
      : '<a href="' + esc(u) + '">' + esc(o.nom) + '</a>';
  }).join('') + '</nav>';
}

const tblStat = (lignes) => '<table><tbody>' + lignes.map(
  (l) => '<tr><td class="eq">' + esc(l[0]) + '</td><td class="pts">' + esc(l[1]) + '</td></tr>'
).join('') + '</tbody></table>';

// ── rendu de chaque onglet ─────────────────────────────────────────────────
// Tous renvoient { corps, titre, desc, vide } ; `vide` signale l'absence de
// donnee chez le fournisseur, pas une erreur.
// `pre` : la promesse de donnees deja lancee par pageMatch en parallele de
// fixtures?id (meme requete qu'ici). Le repli api() ne sert que si un futur
// appelant oublie de la fournir.
async function ongletCotes(f, dom, ext, pre) {
  let bk = [];
  try { bk = (await (pre || api('odds?fixture=' + f.fixture.id + '&bookmaker=8'))) || []; } catch (e) {}
  const bets = ((bk[0] || {}).bookmakers || [])[0];
  const paris = (bets && bets.bets) || [];
  const prendre = (nom) => (paris.find((b) => b.name === nom) || {}).values || [];
  const v1x2 = prendre('Match Winner');
  const you = prendre('Goals Over/Under').filter((v) => /^(Over|Under) (1\.5|2\.5|3\.5)$/.test(v.value));
  const btts = prendre('Both Teams Score');
  const vide = !v1x2.length;
  const nomFr = { Home: dom, Draw: 'Match nul', Away: ext };
  // le favori se lit dans la cote la plus basse, pas ailleurs
  let favori = null;
  if (!vide) {
    const tri = v1x2.slice().sort((a, b) => parseFloat(a.odd) - parseFloat(b.odd))[0];
    favori = { nom: nomFr[tri.value] || tri.value, cote: tri.odd, nul: tri.value === 'Draw' };
  }
  return {
    vide,
    apropos: favori
      ? (favori.nul
          ? 'Les bookmakers ne dégagent pas de favori : le match nul est coté ' + favori.cote + '.'
          : favori.nom + ' part favori de cette rencontre, coté ' + favori.cote + '.')
        + ' Les cotes ci-dessus sont relevées avant le coup d\'envoi et peuvent évoluer.'
      : 'Aucun opérateur ne propose de cote sur cette rencontre.',
    titre: 'Cotes ' + dom + ' - ' + ext,
    desc: 'Cotes du match ' + dom + ' contre ' + ext + ' : 1N2, plus/moins de buts et les deux équipes marquent.',
    corps: vide
      ? '<p class="sous">Aucune cote publiée pour cette rencontre.</p>'
      : '<h2>Vainqueur du match</h2>'
        + tblStat(v1x2.map((v) => [nomFr[v.value] || v.value, v.odd]))
        + (you.length ? '<h2>Nombre de buts</h2>' + tblStat(you.map(
            (v) => [v.value.replace('Over', 'Plus de').replace('Under', 'Moins de') + ' buts', v.odd])) : '')
        + (btts.length ? '<h2>Les deux équipes marquent</h2>' + tblStat(btts.map(
            (v) => [v.value === 'Yes' ? 'Oui' : 'Non', v.odd])) : '')
        + '<p class="sous">Cotes indicatives, susceptibles d\'évoluer jusqu\'au coup d\'envoi.</p>',
  };
}

async function ongletPronostics(f, dom, ext, pre) {
  let p = [];
  try { p = (await (pre || api('predictions?fixture=' + f.fixture.id))) || []; } catch (e) {}
  const d = p[0];
  const pr = d && d.predictions;
  if (!pr) return { vide: true, titre: 'Pronostic ' + dom + ' - ' + ext,
    desc: 'Pronostic du match ' + dom + ' contre ' + ext + '.',
    corps: '<p class="sous">Aucun pronostic disponible pour cette rencontre.</p>' };
  // "No predictions available" est la facon dont le fournisseur dit qu'il n'a
  // rien, pas un conseil. Le laisser passer produisait une phrase francaise
  // qui se terminait par une excuse en anglais.
  if (/no predictions?/i.test(pr.advice || '')) pr.advice = null;
  const pc = pr.percent || {};
  const cmp = d.comparison || {};
  const LIB = { form: 'Forme', att: 'Attaque', def: 'Défense', poisson_distribution: 'Modèle de Poisson',
                h2h: 'Confrontations directes', goals: 'Buts', total: 'Total' };
  const lignesCmp = Object.keys(LIB).filter((k) => cmp[k])
    .map((k) => '<tr><td class="eq">' + esc(LIB[k]) + '</td><td class="pts">' + esc(cmp[k].home)
      + '</td><td class="pts">' + esc(cmp[k].away) + '</td></tr>').join('');
  const hp = parseInt(pc.home, 10) || 0, ap = parseInt(pc.away, 10) || 0;
  const dp = parseInt(pc.draw, 10) || 0;
  // trois tiers exacts et aucun conseil : le fournisseur n'a pas de modele
  // pour ce match, la page n'a rien a apporter
  const creux = !pr.advice && hp === ap && ap === dp;
  return {
    vide: creux,
    apropos: (hp || ap
      ? (Math.abs(hp - ap) < 8
          ? 'Notre modèle ne départage pas les deux équipes (' + pc.home + ' contre ' + pc.away + ').'
          : (hp > ap ? dom : ext) + ' est favori selon notre modèle, avec '
            + (hp > ap ? pc.home : pc.away) + ' de chances de l\'emporter contre '
            + (hp > ap ? pc.away : pc.home) + '.')
      : 'Notre modèle ne dégage pas de tendance nette sur cette rencontre.')
      + (pr.advice ? ' Le conseil retenu est : ' + pr.advice + '.' : ''),
    titre: 'Pronostic ' + dom + ' - ' + ext,
    desc: 'Pronostic ' + dom + ' contre ' + ext
      + (pc.home ? ' : ' + pc.home + ' de chances pour ' + dom + ', ' + pc.draw + ' de nul, '
          + pc.away + ' pour ' + ext + '.' : '.')
      + (pr.advice ? ' Conseil : ' + pr.advice + '.' : ''),
    corps: '<h2>Probabilités de victoire</h2>'
      + tblStat([[dom, pc.home || '—'], ['Match nul', pc.draw || '—'], [ext, pc.away || '—']])
      + (pr.advice ? '<h2>Conseil</h2><p>' + esc(pr.advice) + '</p>' : '')
      + (pr.winner && pr.winner.comment ? '<p class="sous">' + esc(pr.winner.comment) + '</p>' : '')
      + (pr.goals && (pr.goals.home || pr.goals.away)
          ? '<h2>Buts attendus</h2>' + tblStat([[dom, pr.goals.home], [ext, pr.goals.away]]) : '')
      + (lignesCmp
          ? '<h2>Comparaison des deux équipes</h2><table><thead><tr><th class="eq">Critère</th><th>'
            + esc(dom) + '</th><th>' + esc(ext) + '</th></tr></thead><tbody>' + lignesCmp + '</tbody></table>'
          : ''),
  };
}

async function ongletCompo(f, dom, ext, pre) {
  let lu = [];
  try { lu = (await (pre || api('fixtures/lineups?fixture=' + f.fixture.id))) || []; } catch (e) {}
  if (!lu.length) return { vide: true, titre: 'Compositions ' + dom + ' - ' + ext,
    desc: 'Compositions probables de ' + dom + ' et ' + ext + '.',
    corps: '<p class="sous">Les compositions ne sont pas encore communiquées. '
      + 'Elles sont généralement publiées une heure avant le coup d\'envoi.</p>' };
  const bloc = (e) => '<h2>' + esc(e.team.name) + (e.formation ? ' · ' + esc(e.formation) : '') + '</h2>'
    + '<table><thead><tr><th>N°</th><th class="eq">Joueur</th><th>Poste</th></tr></thead><tbody>'
    + (e.startXI || []).map((j) => '<tr><td>' + esc(j.player.number == null ? '' : j.player.number)
      + '</td><td class="eq">' + esc(j.player.name) + '</td><td>' + esc(j.player.pos || '') + '</td></tr>').join('')
    + '</tbody></table>'
    + ((e.substitutes || []).length
        ? '<p class="sous">Remplaçants : ' + esc((e.substitutes || []).map((j) => j.player.name).join(', ')) + '</p>'
        : '');
  const sch = lu.filter((e) => e.formation).map((e) => e.team.name + ' en ' + e.formation);
  return {
    vide: false,
    apropos: (sch.length === 2
      ? 'Les deux entraîneurs se répondent avec ' + sch[0] + ' et ' + sch[1] + '.'
      : 'Les onze de départ des deux équipes sont désormais connus.')
      + ' Les compositions sont publiées environ une heure avant le coup d\'envoi.',
    titre: 'Compositions ' + dom + ' - ' + ext,
    desc: 'Compositions officielles de ' + dom + ' et ' + ext
      + ' : les onze de départ, les formations et les remplaçants.',
    corps: lu.map(bloc).join(''),
  };
}

async function ongletStats(f, dom, ext, pre) {
  let st = [];
  try { st = (await (pre || api('fixtures/statistics?fixture=' + f.fixture.id))) || []; } catch (e) {}
  const dispo = st.filter((e) => (e.statistics || []).some((s) => s.value != null));
  if (dispo.length < 2) return { vide: true, titre: 'Statistiques ' + dom + ' - ' + ext,
    desc: 'Statistiques du match ' + dom + ' contre ' + ext + '.',
    corps: '<p class="sous">Aucune statistique n\'est publiée pour cette rencontre.</p>' };
  const LIB = { 'Shots on Goal': 'Tirs cadrés', 'Shots off Goal': 'Tirs non cadrés',
    'Total Shots': 'Tirs totaux', 'Blocked Shots': 'Tirs bloqués', 'Fouls': 'Fautes',
    'Corner Kicks': 'Corners', 'Offsides': 'Hors-jeu', 'Ball Possession': 'Possession',
    'Yellow Cards': 'Cartons jaunes', 'Red Cards': 'Cartons rouges', 'Goalkeeper Saves': 'Arrêts du gardien',
    'Total passes': 'Passes totales', 'Passes accurate': 'Passes réussies', 'Passes %': 'Précision des passes' };
  const a = dispo[0].statistics || [], b = dispo[1].statistics || [];
  const lignes = a.filter((s) => LIB[s.type]).map((s, i) => {
    const j = b.find((x) => x.type === s.type) || {};
    return '<tr><td class="pts">' + esc(s.value == null ? '—' : s.value) + '</td>'
      + '<td class="eq" style="text-align:center">' + esc(LIB[s.type]) + '</td>'
      + '<td class="pts">' + esc(j.value == null ? '—' : j.value) + '</td></tr>';
  }).join('');
  const poss = (n) => (((dispo[n].statistics || [])
    .find((s) => s.type === 'Ball Possession') || {}).value) || null;
  const pa = poss(0), pb = poss(1);
  return {
    vide: false,
    apropos: (pa && pb
      ? (parseInt(pa, 10) > parseInt(pb, 10) ? dispo[0].team.name : dispo[1].team.name)
        + ' a tenu le ballon (' + pa + ' contre ' + pb + ').'
      : 'Le détail statistique de la rencontre est disponible ci-dessus.')
      + ' Possession, tirs, corners, fautes et cartons sont relevés en fin de rencontre.',
    titre: 'Statistiques ' + dom + ' - ' + ext,
    desc: 'Statistiques complètes de ' + dom + ' contre ' + ext
      + ' : possession, tirs, corners, fautes et cartons.',
    corps: '<table><thead><tr><th>' + esc(dispo[0].team.name) + '</th><th></th><th>'
      + esc(dispo[1].team.name) + '</th></tr></thead><tbody>' + lignes + '</tbody></table>',
  };
}

// Le TaT du site compare les deux equipes sur leurs derniers matchs ET liste
// les confrontations. Cote serveur on rend les trois listes : c'est le seul
// onglet dont le contenu existe quel que soit l'etat du match.
// `h2hP` est une promesse (lancee par pageMatch) : la resoudre DANS le
// Promise.all fait courir les confrontations et la forme des deux equipes
// en meme temps, au lieu de les empiler.
async function ongletTat(f, dom, ext, h2hP) {
  const idD = f.teams.home.id, idE = f.teams.away.id;
  let dD = [], dE = [], h2h = [];
  try {
    [dD, dE, h2h] = await Promise.all([
      api('fixtures?team=' + idD + '&last=10').catch(() => []),
      api('fixtures?team=' + idE + '&last=10').catch(() => []),
      Promise.resolve(h2hP).then((x) => x || []).catch(() => []),
    ]);
  } catch (e) {}
  const bloc = (nom, lot, id) => !lot.length ? '' :
    '<h2>Les ' + lot.length + ' derniers matchs de ' + esc(nom) + '</h2>'
    + '<table><thead><tr><th>Date</th><th></th><th class="eq">Adversaire</th><th>Score</th>'
    + '<th>Compétition</th></tr></thead><tbody>'
    + lot.map((x) => ligneMatch(x, id)).join('') + '</tbody></table>';
  const bilan = (lot, id) => {
    let v = 0, n2 = 0, p = 0;
    lot.forEach((x) => {
      const chez = x.teams.home.id === id, a = x.goals.home, b = x.goals.away;
      if (a == null || b == null) return;
      if (a === b) n2++; else if ((a > b) === chez) v++; else p++;
    });
    return v + 'V ' + n2 + 'N ' + p + 'D';
  };
  return {
    vide: !h2h.length && !dD.length && !dE.length,
    apropos: (dD.length && dE.length
      ? 'Sur leurs dix dernières sorties, ' + dom + ' affiche ' + bilan(dD, idD)
        + ' et ' + ext + ' ' + bilan(dE, idE) + '.'
      : 'Les derniers résultats des deux équipes sont détaillés ci-dessus.'),
    titre: dom + ' - ' + ext + ' : confrontations et forme',
    desc: 'Face-à-face ' + dom + ' - ' + ext + ' : ' + h2h.length
      + ' confrontations directes et les derniers résultats des deux équipes.',
    corps: (h2h.length
        ? '<h2>Confrontations directes</h2><table><thead><tr><th>Date</th><th class="eq">Domicile</th>'
          + '<th>Score</th><th class="eq">Extérieur</th><th>Compétition</th></tr></thead><tbody>'
          + h2h.map(ligneH2H).join('') + '</tbody></table>'
        : '<h2>Confrontations directes</h2><p class="sous">Aucune rencontre entre ces deux équipes dans nos archives.</p>')
      + bloc(dom, dD, idD) + bloc(ext, dE, idE),
  };
}

// Classement de la competition, lu dans nos fichiers locaux : aucune requete
// fournisseur, et c'est exactement le tableau de la page competition.
function ongletTableau(f, dom, ext, competVo, compet, paysNom) {
  const annee = String((f.league && f.league.season) || '');
  let rows = null, lien = '';
  try {
    const m = manifeste();
    for (const cle of Object.keys(m)) {
      if (m[cle].nom !== paysNom && cle.replace(/-/g, ' ') !== f.league.country) continue;
      const don = lirePays(cle);
      const saisons = don && don[competVo];
      const s = saisons && (Object.keys(saisons).find((k) => k.slice(0, 4) === annee)
        || saisonUtile(saisons));
      if (s) { rows = saisons[s]; lien = '/football/' + slug(m[cle].nom) + '/' + slug(competVo) + '/'; }
      break;
    }
  } catch (e) {}
  if (!rows || !rows.length) return { vide: true, titre: 'Classement ' + compet,
    desc: 'Classement de ' + compet + '.',
    corps: '<p class="sous">Cette compétition ne se joue pas au classement, ou son tableau '
      + 'n\'est pas encore disponible.</p>' };
  const cle2 = [dom, ext];
  const place = (nom) => { const r = rows.find((x) => x.team === nom); return r ? r.rank : null; };
  const rd = place(dom), re2 = place(ext);
  return {
    vide: false,
    apropos: (rd && re2
      ? dom + ' occupe la ' + rd + (rd === 1 ? 're' : 'e') + ' place de ' + compet
        + ' et ' + ext + ' la ' + re2 + (re2 === 1 ? 're' : 'e') + '.'
      : 'Le classement complet de ' + compet + ' est affiché ci-dessus.'),
    titre: 'Classement ' + compet + ' — ' + dom + ' - ' + ext,
    desc: 'Classement de ' + compet + ' au moment du match ' + dom + ' contre ' + ext + '.',
    corps: '<table><thead><tr><th>#</th><th class="eq">Équipe</th><th>J</th><th>G</th><th>N</th>'
      + '<th>P</th><th>Pts</th></tr></thead><tbody>'
      + rows.map((r) => '<tr' + (cle2.includes(r.team) ? ' style="background:#f3f1f9"' : '') + '>'
        + '<td>' + esc(r.rank) + '</td><td class="eq">' + esc(r.team) + '</td><td>' + esc(r.played)
        + '</td><td>' + esc(r.won) + '</td><td>' + esc(r.drawn) + '</td><td>' + esc(r.lost)
        + '</td><td class="pts">' + esc(r.pts) + '</td></tr>').join('')
      + '</tbody></table>'
      + (lien ? '<ul class="liens"><li><a href="' + esc(lien) + '">Classement complet de '
          + esc(compet) + '</a></li></ul>' : ''),
  };
}

// ── bloc « À propos de ce match » ──────────────────────────────────────────
// Une page de match est presque entierement faite de chiffres et de tableaux :
// sans prose, le moteur n'a rien a se mettre sous la dent pour comprendre de
// quoi elle parle. Flashscore et Livescore y repondent par un paragraphe en
// pied de page — Livescore en repetant sept fois la meme phrase, ce que le
// systeme "helpful content" sanctionne. On construit donc les phrases A PARTIR
// des donnees du match (vainqueur, ecart, bilan des confrontations) : le texte
// differe reellement d'une page a l'autre parce que les faits different.
function phraseResultat(f, dom, ext, compet, date, fini) {
  const g = f.goals || {};
  const v = f.fixture.venue;
  const lieu = (v && v.name) ? ' à ' + v.name + (v.city ? ' (' + v.city + ')' : '') : '';
  if (fini && g.home != null) {
    const ecart = Math.abs(g.home - g.away);
    if (g.home === g.away) {
      return dom + ' et ' + ext + ' se sont neutralisés ' + g.home + '-' + g.away
        + lieu + ', en ' + compet + ', le ' + date + '.';
    }
    const vq = g.home > g.away ? dom : ext, pd = g.home > g.away ? ext : dom;
    const sc = Math.max(g.home, g.away) + '-' + Math.min(g.home, g.away);
    const verbe = ecart >= 3 ? ' a largement dominé ' : (ecart === 1 ? ' s\'est imposé d\'un but face à ' : ' a battu ');
    return vq + verbe + pd + ' ' + sc + lieu + ', en ' + compet + ', le ' + date + '.';
  }
  // "pour le compte de Ligue Europa" ne se dit pas : le nom de competition
  // n'accepte pas cette tournure sans article.
  return dom + ' reçoit ' + ext + lieu + ' le ' + date
    + ', dans le cadre d\'un match de ' + compet + '.';
}

function phraseH2H(h2h, dom, ext, idDom) {
  if (!h2h.length) return ' Les deux clubs ne s\'étaient encore jamais rencontrés dans nos archives.';
  let vd = 0, ve = 0, n = 0;
  h2h.forEach((x) => {
    const chezDom = x.teams.home.id === idDom;
    const a = x.goals.home, b = x.goals.away;
    if (a === b) n++; else if ((a > b) === chezDom) vd++; else ve++;
  });
  const tot = h2h.length;
  const un = tot === 1;
  // le singulier a sa propre tournure : "sur leurs 1 dernieres confrontations"
  // se lisait dans les pages, et une page sur trois n'a qu'un seul precedent
  const intro = un ? ' Lors de leur seule confrontation, ' : ' Sur leurs ' + tot + ' dernières confrontations, ';
  const pl = (k, s) => k + ' ' + s + (k > 1 ? 's' : '');
  if (n === tot) {
    return un ? ' Leur seule confrontation s\'est soldée par un match nul.'
      : ' Leurs ' + tot + ' dernières confrontations se sont toutes soldées par un match nul.';
  }
  const tete = vd > ve ? dom : (ve > vd ? ext : null);
  if (!tete) return intro + 'chaque équipe compte ' + pl(vd, 'victoire')
    + (n ? ', pour ' + pl(n, 'nul') : '') + '.';
  if (un) return ' Lors de leur seule confrontation, ' + tete + ' l\'avait emporté.';
  return intro + tete + ' mène avec ' + pl(Math.max(vd, ve), 'victoire') + ', '
    + pl(n, 'nul') + ' et ' + pl(Math.min(vd, ve), 'défaite') + '.';
}

// Liens vers les grands championnats, comme le fait Flashscore en pied de page.
// Uniquement ceux qui existent vraiment chez nous : un lien mort abime le
// maillage au lieu de le nourrir.
let _pop = null;
function liensPopulaires() {
  if (_pop) return _pop;
  const veut = [['France', 'Ligue 1'], ['England', 'Premier League'], ['Spain', 'La Liga'],
                ['Italy', 'Serie A'], ['Germany', 'Bundesliga']];
  const m = manifeste();
  _pop = veut.filter(([c, l]) => m[c] && (m[c].ordre || []).includes(l))
    .map(([c, l]) => '<a href="/football/' + slug(m[c].nom) + '/' + slug(l) + '/">'
      + esc(l) + '</a>').join(' · ');
  return _pop;
}

// Ce bloc est le SEUL contenu serveur qui survit a l'hydratation : il est
// deplace en pied de la vraie page, comme le fait Flashscore. Le reste est
// re-rendu par l'application et serait donc en double.
function blocApropos(txt, base, dom, ext) {
  // Phrase de sommaire, sur le modele de Flashscore : elle nomme ce que la
  // page contient et pointe chaque terme vers l'onglet correspondant, ce qui
  // fait d'elle un lien interne utile plutot qu'une simple enumeration.
  const sommaire = 'Retrouvez sur cette page le <a href="' + esc(base) + '">résumé</a> du match, '
    + 'les actualités des deux clubs, les <a href="' + esc(base) + 'compositions/">compositions</a>, '
    + 'les <a href="' + esc(base) + 'cotes/">cotes</a> et les '
    + '<a href="' + esc(base) + 'tete-a-tete/">statistiques tête-à-tête</a> entre '
    + esc(dom) + ' et ' + esc(ext) + '.';
  return '<div id="ns-apropos"><h2>À propos de ce match</h2><p>' + txt + '</p>'
    + '<p>' + sommaire + '</p>'
    + '<p class="sous">Tous les scores en direct, les classements et les pronostics sur '
    + '<a href="/">NinjaScores</a> · <a href="/calendrier/">Calendrier des matchs</a> · '
    + liensPopulaires() + '</p></div>';
}

function ligneH2H(x) {
  const d2 = new Date(x.fixture.date);
  const dateTxt = esc(String(d2.getDate()).padStart(2, '0') + '/'
    + String(d2.getMonth() + 1).padStart(2, '0') + '/' + d2.getFullYear());
  const urlM = '/football/match/' + slug(x.teams.home.name) + '-' + slug(x.teams.away.name)
    + '-' + x.fixture.id + '/';
  // lien reel vers la page du match archive : c'est ce qui rend les
  // confrontations directes exploitables pour le maillage interne (SEO).
  const lienScore = '<a href="' + esc(urlM) + '">' + esc(x.goals.home) + ' - ' + esc(x.goals.away) + '</a>';
  return '<tr><td><a href="' + esc(urlM) + '">' + dateTxt + '</a></td><td class="eq">'
    + esc(x.teams.home.name) + '</td><td class="pts">' + lienScore + '</td><td class="eq">'
    + esc(x.teams.away.name) + '</td><td>' + esc(x.league.name) + '</td></tr>';
}

async function pageMatch(slugComplet, onglet) {
  // Le libelle est facultatif : /football/match/1552773/ doit marcher aussi.
  // C'est la forme que construit l'app iOS quand une notification n'apporte
  // que le fixtureId (NotificationRouter, ios-app/…/PushNotifications.swift)
  // — sans ce cas, l'appui sur la notification tombait sur « page
  // introuvable ». La redirection 301 vers la forme canonique plus bas
  // remet ensuite l'URL complete dans la barre d'adresse.
  const id = (String(slugComplet).match(/(?:^|-)(\d+)$/) || [])[1];
  if (!id) return null;

  // Onglet demande, resolu AVANT les appels : c'est lui qui decide des
  // donnees dont cette URL a besoin. `resume` n'existe pas comme segment :
  // c'est l'URL de base, sinon deux URLs porteraient la meme page.
  const o = onglet ? PAR_SEG[onglet] : ONGLETS[0];
  if (onglet && !o) return null;

  // Les donnees de l'onglet ne dependent que de l'id (present dans le slug) :
  // on les lance EN PARALLELE de fixtures?id au lieu d'attendre leur tour.
  // La fonction est facturee au temps allume — deux attentes empilees
  // coutaient le double d'une seule.
  const lancerTab = {
    cotes: () => api('odds?fixture=' + id + '&bookmaker=8').catch(() => []),
    pronostics: () => api('predictions?fixture=' + id).catch(() => []),
    compo: () => api('fixtures/lineups?fixture=' + id).catch(() => []),
    stats: () => api('fixtures/statistics?fixture=' + id).catch(() => []),
  }[o.id];
  const tabP = lancerTab ? lancerTab() : null;
  const artP = lienPronostic(Number(id));

  const rep = await api('fixtures?id=' + id);
  if (!rep.length) return null;
  const f = rep[0];
  const dom = f.teams.home.name, ext = f.teams.away.name;
  const st = (f.fixture.status && f.fixture.status.short) || 'NS';
  const [libelle, statutLd] = STATUTS[st] || ['À venir', 'https://schema.org/EventScheduled'];
  const fini = !!FINIS[st];
  const g = f.goals || {};
  const score = (g.home != null && g.away != null) ? g.home + ' - ' + g.away : null;
  const url = '/football/match/' + slug(dom) + '-' + slug(ext) + '-' + id + '/';
  const date = dateFr(f.fixture.date);
  const competVo = f.league.name;
  const compet = tradCompet(competVo);
  const paysNom = f.league.country === 'World' ? 'International' : f.league.country;

  // confrontations directes : c'est ce qui donne de la substance a la page —
  // mais seuls le resume et le TaT les affichent. Les six autres onglets
  // payaient cet appel pour rien (constat facture du 31/08). Promesse et non
  // await : le TaT la resout en parallele de ses propres appels.
  const besoinH2H = o.id === 'resume' || o.id === 'tat';
  const h2hP = besoinH2H
    ? api('fixtures/headtohead?h2h=' + f.teams.home.id + '-' + f.teams.away.id + '&last=11')
      // le fournisseur inclut la rencontre en cours : une page ne peut pas se
      // citer elle-meme parmi ses confrontations passees
      .then((r) => r.filter((x) => FINIS[x.fixture.status.short] && x.fixture.id !== f.fixture.id).slice(0, 10))
      .catch(() => [])
    : Promise.resolve([]);

  const titreScore = fini && score ? dom + ' ' + score + ' ' + ext : dom + ' - ' + ext;
  const h1 = titreScore;
  const sousTitre = compet + ' · ' + date + ' · ' + libelle
    + (f.fixture.venue && f.fixture.venue.name ? ' · ' + f.fixture.venue.name : '');

  // lien vers la competition quand elle fait partie des pages indexees
  let lienCompet = '';
  try {
    const m = manifeste();
    for (const cle of Object.keys(m)) {
      if (m[cle].nom === paysNom || cle.replace(/-/g, ' ') === f.league.country) {
        if ((m[cle].ordre || []).includes(competVo)) {
          lienCompet = '<li><a href="/football/' + slug(m[cle].nom) + '/' + slug(competVo)
            + '/">Classement ' + esc(compet) + '</a></li>'
            + '<li><a href="/football/' + slug(m[cle].nom) + '/">Football en ' + esc(m[cle].nom) + '</a></li>';
        }
        break;
      }
    }
  } catch (e) {}

  const art = await artP;
  const blocPronostic = art
    ? '<h2>Notre pronostic</h2><ul class="liens"><li><a href="' + art.racine
      + esc(art.slug) + '/">' + esc(art.titre) + '</a></li></ul>'
    : '';

  const liensEquipes = blocPronostic + '<h2>Les deux équipes</h2><ul class="liens">'
    + '<li><a href="/football/equipe/' + slug(dom) + '-' + f.teams.home.id + '/">' + esc(dom) + '</a></li>'
    + '<li><a href="/football/equipe/' + slug(ext) + '-' + f.teams.away.id + '/">' + esc(ext) + '</a></li>'
    + '</ul>'
    + (lienCompet ? '<h2>À voir aussi</h2><ul class="liens">' + lienCompet + '</ul>' : '');

  let vue;
  let h2h = [];
  if (o.id === 'resume') {
    h2h = await h2hP;
    vue = { vide: false,
      titre: titreScore + ' — ' + compet + ', ' + date + (fini ? ' : résultat et statistiques' : ' : avant-match'),
      desc: (fini && score
        ? dom + ' ' + score + ' ' + ext + '. Résultat complet du match de ' + compet + ' du ' + date + '.'
        : dom + ' contre ' + ext + ', ' + compet + ', le ' + date + '. Horaire, confrontations directes et statistiques.')
        + (h2h.length ? ' ' + h2h.length + ' confrontations directes.' : ''),
      corps: (h2h.length
        ? '<h2>Confrontations directes</h2><table><thead><tr><th>Date</th><th class="eq">Domicile</th>'
          + '<th>Score</th><th class="eq">Extérieur</th><th>Compétition</th></tr></thead><tbody>'
          + h2h.map(ligneH2H).join('') + '</tbody></table>'
        : '<h2>Confrontations directes</h2><p class="sous">Aucune rencontre entre ces deux équipes dans nos archives.</p>') };
  } else if (o.id === 'cotes')      vue = await ongletCotes(f, dom, ext, tabP);
  else if (o.id === 'pronostics')   vue = await ongletPronostics(f, dom, ext, tabP);
  else if (o.id === 'compo')        vue = await ongletCompo(f, dom, ext, tabP);
  else if (o.id === 'stats')        vue = await ongletStats(f, dom, ext, tabP);
  else if (o.id === 'tat')          { vue = await ongletTat(f, dom, ext, h2hP); h2h = await h2hP; }
  else if (o.id === 'tableau')      vue = ongletTableau(f, dom, ext, competVo, compet, paysNom);
  else vue = { vide: true, titre: 'Volume des marchés — ' + dom + ' - ' + ext,
    desc: 'Volume échangé sur les marchés du match ' + dom + ' contre ' + ext + '.',
    corps: '<p class="sous">Les volumes de marché ne sont pas disponibles pour cette rencontre.</p>' };

  // Un onglet promu ne garde sa canonique auto-referente que s'il a vraiment
  // du contenu. Vide, il retombe sur la fiche et sort de l'index : c'est ce
  // qui evite huit doublons minces par match.
  const propre = o.canon === 'self' && !vue.vide;
  const urlOnglet = url + (o.seg ? o.seg + '/' : '');
  const robots = (o.id === 'volume' || (o.canon === 'self' && vue.vide) || (o.id === 'tableau' && vue.vide))
    ? 'noindex, follow' : null;

  return { url: urlOnglet, base: url, onglet: o, fini, html: page({
    cible: { type: 'match', id: Number(id), onglet: o.app || o.id },
    url: urlOnglet,
    canon: propre || o.id === 'resume' ? urlOnglet : url,
    robots,
    titre: vue.titre + (o.id === 'resume' ? '' : ' | NinjaScores'),
    desc: vue.desc,
    h1,
    fil: [{ nom: 'Accueil', url: '/' }, { nom: 'Football', url: '/football/' },
          { nom: compet }].concat(o.id === 'resume'
            ? [{ nom: dom + ' - ' + ext }]
            : [{ nom: dom + ' - ' + ext, url }, { nom: o.nom }]),
    corps: '<p class="sous">' + esc(sousTitre) + '</p>'
      + (score ? '<p style="font-size:34px;font-weight:800;margin:6px 0 22px">'
          + esc(dom) + ' <span class="pts">' + esc(score) + '</span> ' + esc(ext) + '</p>' : '')
      + barreOnglets(url, o.id)
      + vue.corps
      + liensEquipes
      + blocApropos(phraseResultat(f, dom, ext, compet, date, fini)
          + (o.id === 'resume' || o.id === 'tat'
              ? phraseH2H(h2h, dom, ext, f.teams.home.id) : '')
          + (vue.apropos ? ' ' + vue.apropos : ''), url, dom, ext),
    jsonld: o.id === 'resume' ? [{
      '@context': 'https://schema.org', '@type': 'SportsEvent',
      name: dom + ' - ' + ext, sport: 'Football',
      description: 'Match de football ' + dom + ' - ' + ext + ' en ' + compet
        + ' : résultat, cotes, compositions et statistiques.',
      startDate: f.fixture.date,
      endDate: finEvt(f.fixture.date),
      eventStatus: statutLd,
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      image: [SITE + '/assets/og-ninjascores.png'],
      organizer: { '@type': 'SportsOrganization', name: compet },
      performer: [
        { '@type': 'SportsTeam', name: dom },
        { '@type': 'SportsTeam', name: ext },
      ],
      url: SITE + url,
      homeTeam: { '@type': 'SportsTeam', name: dom, sport: 'Football' },
      awayTeam: { '@type': 'SportsTeam', name: ext, sport: 'Football' },
      competitor: [
        { '@type': 'SportsTeam', name: dom, sport: 'Football' },
        { '@type': 'SportsTeam', name: ext, sport: 'Football' },
      ],
      superEvent: { '@type': 'SportsOrganization', name: compet, sport: 'Football' },
      location: (f.fixture.venue && f.fixture.venue.name)
        ? { '@type': 'Place', name: f.fixture.venue.name,
            address: { '@type': 'PostalAddress', addressLocality: f.fixture.venue.city || '' } }
        : { '@type': 'Place', name: 'Stade non communiqué',
            address: { '@type': 'PostalAddress', addressLocality: '' } },
    }] : (propre ? [{
      '@context': 'https://schema.org', '@type': 'SportsEvent',
      name: dom + ' - ' + ext, sport: 'Football',
      description: 'Match de football ' + dom + ' - ' + ext + ' en ' + compet
        + ' : résultat, cotes, compositions et statistiques.',
      startDate: f.fixture.date,
      endDate: finEvt(f.fixture.date),
      eventStatus: statutLd,
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      url: SITE + url,
      image: [SITE + '/assets/og-ninjascores.png'],
      organizer: { '@type': 'SportsOrganization', name: compet },
      performer: [
        { '@type': 'SportsTeam', name: dom },
        { '@type': 'SportsTeam', name: ext },
      ],
      homeTeam: { '@type': 'SportsTeam', name: dom, sport: 'Football' },
      awayTeam: { '@type': 'SportsTeam', name: ext, sport: 'Football' },
      superEvent: { '@type': 'SportsOrganization', name: compet, sport: 'Football' },
      location: (f.fixture.venue && f.fixture.venue.name)
        ? { '@type': 'Place', name: f.fixture.venue.name,
            address: { '@type': 'PostalAddress', addressLocality: f.fixture.venue.city || '' } }
        : { '@type': 'Place', name: 'Stade non communiqué',
            address: { '@type': 'PostalAddress', addressLocality: '' } },
    }] : []),
  }) };
}



// ── /football/equipe/{slug}-{id}/ ──────────────────────────────────────────
// L'identifiant est indispensable, pas decoratif : 55 slugs d'equipes sont
// partages par plusieurs clubs reels ("arsenal" en designe 2, "al-shabab" 4).
// Sans lui, deux clubs distincts se retrouveraient sur la meme URL.
function ligneMatch(f, idEquipe) {
  const d2 = new Date(f.fixture.date);
  const dom = f.teams.home.id === idEquipe;
  const adv = dom ? f.teams.away : f.teams.home;
  const g = f.goals || {};
  const joue = g.home != null && g.away != null;
  const url = '/football/match/' + slug(f.teams.home.name) + '-'
            + slug(f.teams.away.name) + '-' + f.fixture.id + '/';
  return '<tr><td>' + esc(String(d2.getDate()).padStart(2, '0') + '/'
    + String(d2.getMonth() + 1).padStart(2, '0') + '/' + d2.getFullYear()) + '</td>'
    + '<td>' + (dom ? 'dom.' : 'ext.') + '</td>'
    + '<td class="eq"><a href="' + esc(url) + '">' + esc(adv.name) + '</a></td>'
    + '<td class="pts">' + (joue ? esc(g.home + ' - ' + g.away) : esc(
        String(d2.getHours()).padStart(2, '0') + ':' + String(d2.getMinutes()).padStart(2, '0'))) + '</td>'
    + '<td>' + esc(f.league.name) + '</td></tr>';
}

async function pageEquipe(slugComplet) {
  const id = (String(slugComplet).match(/-(\d+)$/) || [])[1];
  if (!id) return null;
  const [infos, passes, venir] = await Promise.all([
    api('teams?id=' + id),
    api('fixtures?team=' + id + '&last=8'),
    api('fixtures?team=' + id + '&next=8'),
  ]);
  if (!infos.length) return null;
  const eq = infos[0].team, stade = infos[0].venue || {};
  const nom = eq.name;
  const url = '/football/equipe/' + slug(nom) + '-' + id + '/';
  const paysNom = paysFr(eq.country || '');

  const finis = passes.filter((f) => ['FT', 'AET', 'PEN'].includes(f.fixture.status.short));
  const bilan = finis.reduce((a, f) => {
    const dom = f.teams.home.id === Number(id);
    const pour = dom ? f.goals.home : f.goals.away, contre = dom ? f.goals.away : f.goals.home;
    if (pour > contre) a.v++; else if (pour === contre) a.n++; else a.d++;
    return a;
  }, { v: 0, n: 0, d: 0 });

  // lien vers le championnat quand il fait partie des pages indexees
  let liens = '';
  try {
    const m = manifeste();
    for (const cle of Object.keys(m)) {
      if (m[cle].nom === paysNom || cle.replace(/-/g, ' ').toLowerCase() === String(paysNom).toLowerCase()) {
        liens = '<li><a href="/football/' + slug(m[cle].nom) + '/">Football en ' + esc(m[cle].nom) + '</a></li>'
          + (m[cle].ordre || []).slice(0, 3).map((lg) =>
              '<li><a href="/football/' + slug(m[cle].nom) + '/' + slug(lg) + '/">Classement ' + esc(lg) + '</a></li>').join('');
        break;
      }
    }
  } catch (e) {}

  const tbl = (titre, liste) => liste.length
    ? '<h2>' + titre + '</h2><table><thead><tr><th>Date</th><th>Lieu</th>'
      + '<th class="eq">Adversaire</th><th>Score</th><th>Compétition</th></tr></thead><tbody>'
      + liste.map((f) => ligneMatch(f, Number(id))).join('') + '</tbody></table>'
    : '';

  return { url, html: page({
    cible: { type: 'equipe', id: Number(id), nom },
    url,
    titre: nom + ' — calendrier, résultats et statistiques' + (paysNom ? ' | ' + paysNom : '') + ' | NinjaScores',
    desc: 'Tous les matchs de ' + nom + (paysNom ? ' (' + paysNom + ')' : '') + ' : '
        + (venir.length ? venir.length + ' matchs à venir, ' : '')
        + finis.length + ' derniers résultats'
        + (finis.length ? ' (' + bilan.v + 'V ' + bilan.n + 'N ' + bilan.d + 'D)' : '') + '.',
    h1: nom,
    fil: [{ nom: 'Accueil', url: '/' }, { nom: 'Football', url: '/football/' },
          ...(paysNom ? [{ nom: paysNom }] : []), { nom }],
    corps: '<p class="sous">'
      + (paysNom ? esc(paysNom) + ' · ' : '')
      + (eq.founded ? 'fondé en ' + esc(eq.founded) + ' · ' : '')
      + (stade.name ? esc(stade.name) + (stade.capacity ? ' (' + esc(stade.capacity) + ' places)' : '') : '')
      + (finis.length ? ' · bilan récent : ' + bilan.v + 'V ' + bilan.n + 'N ' + bilan.d + 'D' : '')
      + '</p>'
      + tbl('Prochains matchs', venir)
      + tbl('Derniers résultats', passes.filter((f) => ['FT', 'AET', 'PEN'].includes(f.fixture.status.short)))
      + (liens ? '<h2>À voir aussi</h2><ul class="liens">' + liens + '</ul>' : ''),
    jsonld: [{
      '@context': 'https://schema.org', '@type': 'SportsTeam',
      name: nom, sport: 'Football', url: SITE + url,
      ...(eq.logo ? { logo: eq.logo } : {}),
      ...(eq.founded ? { foundingDate: String(eq.founded) } : {}),
      ...(paysNom ? { location: { '@type': 'Country', name: paysNom } } : {}),
      ...(stade.name ? { homeLocation: { '@type': 'Place', name: stade.name,
            ...(stade.city ? { address: { '@type': 'PostalAddress', addressLocality: stade.city } } : {}) } } : {}),
    }],
  }) };
}

// ── /football/joueur/{slug}-{id}/ ───────────────────────────────────────────
// L'id est celui du DATASET (Transfermarkt), pas celui d'API-Football : c'est
// le seul stable et disponible pour les 15 680 joueurs du site (l'id
// API-Football n'est resolu que pour ~80% d'entre eux, via player-photos.json).

let _players = null;
function joueurs() {
  if (_players) return _players;
  const txt = fs.readFileSync(path.join(process.cwd(), 'search_data.js'), 'utf8');
  const i = txt.indexOf('{'), j = txt.lastIndexOf('}');
  _players = JSON.parse(txt.slice(i, j + 1)).players || [];
  return _players;
}
let _photos = null;
function photosMap() {
  if (!_photos) {
    try { _photos = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'player-photos.json'), 'utf8')); }
    catch (e) { _photos = {}; }
  }
  return _photos;
}
let _teamsIdx = null;
function teamsIndex() {
  if (!_teamsIdx) {
    try { _teamsIdx = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'teams-index.json'), 'utf8')); }
    catch (e) { _teamsIdx = []; }
  }
  return _teamsIdx;
}
// meme normalisation que window.NS_PLAYER_INFO (index.html) : la cle de
// player-photos.json doit correspondre EXACTEMENT, cote serveur comme client.
const nrm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');
const dernierMot = (n) => { const t = String(n || '').replace(/\./g, ' ').trim().split(/\s+/);
  return t.length ? nrm(t[t.length - 1]) : ''; };

const TRPOS = {
  Keeper: 'Gardien', keeper: 'Gardien', Goalkeeper: 'Gardien',
  'Center Back': 'Défenseur central', 'Centre Back': 'Défenseur central',
  'Left Back': 'Arrière gauche', 'Right Back': 'Arrière droit',
  'Left Wing-Back': 'Piston gauche', 'Right Wing-Back': 'Piston droit',
  defender: 'Défenseur', Defender: 'Défenseur',
  'Defensive Midfielder': 'Milieu défensif', 'Central Midfielder': 'Milieu central',
  'Attacking Midfielder': 'Milieu offensif', 'Left Midfielder': 'Milieu gauche', 'Right Midfielder': 'Milieu droit',
  midfielder: 'Milieu', Midfielder: 'Milieu',
  'Left Winger': 'Ailier gauche', 'Right Winger': 'Ailier droit',
  Striker: 'Attaquant', forward: 'Attaquant', Forward: 'Attaquant', 'Centre-Forward': 'Avant-centre',
};
const tradPos = (p) => TRPOS[p] || p;

function idEquipeParNom(nom) {
  const n = nrm(nom);
  const hit = teamsIndex().find((t) => nrm(t.n) === n);
  if (!hit) return null;
  const m = String(hit.l || '').match(/\/teams\/(\d+)\.png/);
  return m ? m[1] : null;
}

function formatMontant(v) {
  const n = parseInt(v || 0, 10) || 0;
  if (!n) return null;
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.', ',').replace(',0', '') + ' M€';
  if (n >= 1000) return Math.round(n / 1000) + ' K€';
  return n + ' €';
}

async function pageJoueur(slugComplet) {
  const id = (String(slugComplet).match(/-(\d+)$/) || [])[1];
  if (!id) return null;
  const j = joueurs().find((p) => String(p.id) === id);
  if (!j) return null;

  const nom = j.name;
  const url = '/football/joueur/' + slug(nom) + '-' + id + '/';
  const posTxt = tradPos(j.position);
  const valeurTxt = formatMontant(j.marketValue);

  const idClub = j.team ? idEquipeParNom(j.team) : null;
  const urlClub = idClub ? '/football/equipe/' + slug(j.team) + '-' + idClub + '/' : null;

  // resolution vers l'id API-Football (memes cles que le client) : sans lui,
  // pas de carriere/transferts chiffres, mais la fiche existe quand meme.
  const map = photosMap();
  const entree = map[dernierMot(nom) + '|' + nrm(j.team || '')] || null;
  const apiId = entree ? entree.apiId : null;

  let carriere = [];
  let transferts = [];
  if (apiId) {
    try {
      const saisons = [2025, 2024, 2023];
      const rep = await Promise.all(saisons.map((s) => api('players?id=' + apiId + '&season=' + s).catch(() => [])));
      const lignes = [];
      rep.forEach((r) => {
        if (!r || !r[0]) return;
        (r[0].statistics || []).forEach((st) => {
          const lg = st.league || {}, tm = st.team || {}, g = st.games || {}, go = st.goals || {};
          if (/friendl/i.test(lg.name || '')) return;
          const apps = g.appearences || 0;
          if (!apps && !go.total) return;
          lignes.push({ saison: lg.season, comp: tradCompet(lg.name || ''), club: tm.name || '',
            mj: apps, buts: go.total || 0, passes: go.assists || 0 });
        });
      });
      carriere = lignes.sort((a, b) => (b.saison || 0) - (a.saison || 0));
    } catch (e) {}
    try {
      const rt = await api('transfers?player=' + apiId).catch(() => []);
      if (rt && rt[0]) {
        transferts = (rt[0].transfers || []).slice(0, 8).map((t) => ({
          date: t.date, type: t.type,
          depuis: (t.teams && t.teams.out && t.teams.out.name) || '',
          vers: (t.teams && t.teams.in && t.teams.in.name) || '',
        }));
      }
    } catch (e) {}
  }

  const tblCarriere = carriere.length
    ? '<h2>Carrière</h2><table><thead><tr><th>Saison</th><th class="eq">Club</th>'
      + '<th>Compétition</th><th>MJ</th><th>Buts</th><th>Passes</th></tr></thead><tbody>'
      + carriere.map((c) => '<tr><td>' + esc(c.saison ? c.saison + '-' + String(c.saison + 1).slice(2) : '')
        + '</td><td class="eq">' + esc(c.club) + '</td><td>' + esc(c.comp) + '</td>'
        + '<td class="pts">' + esc(c.mj) + '</td><td class="pts">' + esc(c.buts) + '</td>'
        + '<td class="pts">' + esc(c.passes) + '</td></tr>').join('') + '</tbody></table>'
    : '';

  const tblTransferts = transferts.length
    ? '<h2>Transferts</h2><table><thead><tr><th>Date</th><th class="eq">Depuis</th>'
      + '<th class="eq">Vers</th><th>Type</th></tr></thead><tbody>'
      + transferts.map((t) => '<tr><td>' + esc(dateFr(t.date)) + '</td><td class="eq">' + esc(t.depuis)
        + '</td><td class="eq">' + esc(t.vers) + '</td><td>' + esc(t.type || '') + '</td></tr>').join('')
      + '</tbody></table>'
    : '';

  const clubLien = urlClub ? '<a href="' + esc(urlClub) + '">' + esc(j.team) + '</a>' : esc(j.team || '—');

  return { url, html: page({
    cible: { type: 'joueur', id: Number(id) },
    url,
    titre: nom + ' — ' + posTxt + (j.team ? ' à ' + j.team : '') + ' | NinjaScores',
    desc: nom + ', ' + posTxt.toLowerCase() + (j.team ? ' de ' + j.team : '')
        + (valeurTxt ? ', valeur marchande estimée à ' + valeurTxt : '') + '.'
        + (carriere.length ? ' Statistiques de carrière, ' : '') + 'transferts et actualités.',
    h1: nom,
    fil: [{ nom: 'Accueil', url: '/' }, { nom: 'Football', url: '/football/' }, { nom }],
    corps: '<p class="sous">' + esc(posTxt)
      + (j.team ? ' · ' + clubLien : '')
      + (j.nationality ? ' · ' + esc(j.nationality) : '')
      + (j.age ? ' · ' + esc(j.age) + ' ans' : '')
      + '</p>'
      + (valeurTxt ? '<h2>Valeur marchande</h2><p class="sous" style="font-size:22px;font-weight:800;color:var(--v)">' + esc(valeurTxt) + '</p>' : '')
      + tblCarriere + tblTransferts
      + (!apiId ? '<p class="sous">Statistiques détaillées non disponibles pour ce joueur.</p>' : ''),
    jsonld: [{
      '@context': 'https://schema.org', '@type': 'Person', name: nom, url: SITE + url,
      ...(j.nationality ? { nationality: j.nationality } : {}),
      ...(j.team ? { affiliation: { '@type': 'SportsTeam', name: j.team } } : {}),
      jobTitle: posTxt,
    }],
  }) };
}

// ── Sitemaps ───────────────────────────────────────────────────────────────
// Index segmente : Google traite mieux plusieurs fichiers thematiques qu'un
// seul monolithe, et un segment qui echoue n'emporte pas les autres.
const AMICAL_S = /(friendl|amistoso|amical|pre-?season|test match)/i;
const JEUNES_S = /(\bu-?1[0-9]\b|\bu-?2[0-3]\b|youth|junior|primavera|junioren|aspirantes|sub-?2[0-3]|academy)/i;
const FEMININ_S = /(women|femen|f[ée]minin|femminile|frauen|\bwsl\b|\bnwsl\b|feminina)/i;
const ECARTEES_S = /(cotif)/i;

function xml(urls) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map((u) => '<url><loc>' + esc(SITE + u.loc) + '</loc>'
        + (u.lastmod ? '<lastmod>' + u.lastmod + '</lastmod>' : '')
        + (u.freq ? '<changefreq>' + u.freq + '</changefreq>' : '')
        + (u.prio ? '<priority>' + u.prio + '</priority>' : '')
        + '</url>').join('\n')
    + '\n</urlset>\n';
}

function sitemapEquipes(jour) {
  const m = manifeste();
  const vues = new Set();
  const urls = [];
  Object.keys(m).forEach((cle) => {
    const d = lirePays(cle);
    if (!d) return;
    const premiere = (m[cle].ordre || [])[0];
    if (!premiere || !d[premiere]) return;
    const s2 = saisonUtile(d[premiere]);
    if (!s2) return;
    const L = d._logos || {};
    (d[premiere][s2] || []).forEach((r) => {
      const u = L[r.team] || '';
      const id = (u.match(/api-sports\.io\/football\/teams\/(\d+)\.png/) || [])[1];
      if (!id || vues.has(id)) return;
      vues.add(id);
      urls.push({ loc: '/football/equipe/' + slug(r.team) + '-' + id + '/',
                  lastmod: jour, freq: 'weekly', prio: '0.7' });
    });
  });
  return xml(urls);
}

// Seuil de valeur marchande pour figurer au sitemap.
//
// Constat Search Console du 08/08/2026 : 7 711 pages « Detectee, actuellement
// non indexee ». Google connait ces URLs et refuse d'aller les chercher. La
// cause n'est ni le cache (verifie : HIT) ni la vitesse (~345 ms), mais le
// VOLUME rapporte a l'autorite du domaine : 20 952 URLs soumises, dont 15 680
// pages joueur — 75 % du total — pour des profils comme « gardien de Rodina,
// 1re division russe », que personne ne recherche.
//
// Un sitemap n'est pas un inventaire : c'est une liste de pages qu'on veut
// voir indexees. Noyer 4 800 joueurs interessants sous 11 000 inconnus dilue
// le signal et gaspille le budget d'exploration.
//
// Les pages restent en ligne et accessibles par les liens internes : on cesse
// seulement de les pousser. Google les trouvera si elles le meritent.
// Releve de 1 M€ a 10 M€ le 15/08/2026 : le premier elagage laissait encore
// 4 820 joueurs, et la Search Console montrait 17 634 URLs « Detectee,
// actuellement non indexee » — Google refusait toujours d'explorer. A 10 M€ il
// reste 1 272 profils reellement recherches.
const VALEUR_MIN_SITEMAP = 10000000;

function sitemapJoueurs(jour) {
  const urls = joueurs()
    .filter((p) => Number(p.marketValue) >= VALEUR_MIN_SITEMAP)
    .map((p) => ({
      loc: '/football/joueur/' + slug(p.name) + '-' + p.id + '/',
      lastmod: jour, freq: 'weekly', prio: '0.5',
    }));
  return xml(urls);
}

// Articles de pronostics ecrits par api/cron-articles dans Supabase.
// On ne liste que ceux dont le match n'est pas trop ancien : un pronostic
// perime n'a aucune valeur pour un lecteur ni pour Google.
// Racine des URLs d'article par langue. Elle doit rester alignee sur les
// rewrites de vercel.json et sur LANGUES dans lib/articles/langues.mjs :
// un sitemap qui pointe vers une URL non routee vaut moins que pas de sitemap.
const RACINE_ARTICLE = { fr: '/football/pronostic/', es: '/es/futbol/pronostico/',
  nl: '/nl/voetbal/voorspelling/', pt: '/pt/futebol/prognostico/',
  br: '/br/futebol/palpite/', de: '/de/fussball/prognose/', it: '/it/calcio/pronostico/', en: '/en/football/prediction/' };

async function sitemapPronostics(jour, langue) {
  const lg = RACINE_ARTICLE[langue] ? langue : 'fr';
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return xml([]);
  const depuis = new Date(Date.now() - 30 * 86400000).toISOString();
  try {
    const r = await fetch(
      `${url}/rest/v1/articles?langue=eq.${lg}&coup_envoi=gte.${depuis}&select=slug,coup_envoi&order=coup_envoi.desc&limit=5000`,
      { headers: { apikey: key, Authorization: 'Bearer ' + key } });
    if (!r.ok) return xml([]);
    const lignes = await r.json();
    return xml(lignes.map((a) => ({
      loc: RACINE_ARTICLE[lg] + a.slug + '/',
      lastmod: String(a.coup_envoi).slice(0, 10),
      freq: 'daily', prio: '0.8',
    })));
  } catch (e) { return xml([]); }
}

function sitemapIndex(jour) {
  const seg = ['pays', 'competitions', 'equipes', 'joueurs', 'matchs', 'pronostics',
    // Une entree par langue : sans elle, Google ne decouvrirait jamais les
    // articles espagnols, aucune page du site francais n'y menant.
    'pronosticos-es', 'voorspellingen-nl',
    'prognosticos-pt', 'palpites-br', 'prognosen-de', 'pronostici-it', 'predictions-en'];
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + seg.map((n) => '<sitemap><loc>' + SITE + '/sitemap-' + n + '.xml</loc>'
        + '<lastmod>' + jour + '</lastmod></sitemap>').join('\n')
    + '\n</sitemapindex>\n';
}

function sitemapPays(jour) {
  const m = manifeste();
  const urls = [{ loc: '/', lastmod: jour, freq: 'hourly', prio: '1.0' },
                { loc: '/football/', lastmod: jour, freq: 'daily', prio: '0.9' },
                { loc: '/transferts/', lastmod: jour, freq: 'daily', prio: '0.7' },
                { loc: '/pronostics/', lastmod: jour, freq: 'daily', prio: '0.8' },
                { loc: '/pronosticos/', lastmod: jour, freq: 'daily', prio: '0.7' },
                { loc: '/voorspellingen/', lastmod: jour, freq: 'daily', prio: '0.7' },
                { loc: '/prognosticos/', lastmod: jour, freq: 'daily', prio: '0.7' },
                { loc: '/palpites/', lastmod: jour, freq: 'daily', prio: '0.7' },
                { loc: '/prognosen/', lastmod: jour, freq: 'daily', prio: '0.7' },
                { loc: '/pronostici/', lastmod: jour, freq: 'daily', prio: '0.7' },
                { loc: '/predictions/', lastmod: jour, freq: 'daily', prio: '0.7' }];
  Object.keys(m).forEach((cle) => {
    if (!(m[cle].ordre || []).length) return;
    urls.push({ loc: '/football/' + slug(m[cle].nom) + '/', lastmod: jour, freq: 'weekly', prio: '0.7' });
  });
  return xml(urls);
}

function sitemapCompetitions(jour) {
  const m = manifeste();
  const urls = [];
  Object.keys(m).forEach((cle) => {
    const donnees = lirePays(cle);
    if (!donnees) return;
    (m[cle].ordre || []).forEach((lg) => {
      // meme seuil que pour le rendu : une page sans classement exploitable
      // ne doit pas etre proposee au crawl
      const sa = donnees[lg]; if (!sa) return;
      const s2 = saisonUtile(sa);
      if (!s2 || (sa[s2] || []).length < 4) return;
      urls.push({ loc: '/football/' + slug(m[cle].nom) + '/' + slug(lg) + '/',
                  lastmod: jour, freq: 'daily', prio: '0.8' });
    });
  });
  return xml(urls);
}

async function sitemapMatchs(jour) {
  const urls = [];
  const auj = new Date();
  const dates = [];
  for (let i = -3; i <= 7; i++) {
    const d = new Date(auj); d.setDate(auj.getDate() + i);
    dates.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
             + '-' + String(d.getDate()).padStart(2, '0'));
  }
  const lots = await Promise.all(dates.map((d) => api('fixtures?date=' + d).catch(() => [])));
  lots.forEach((fx, i) => {
    const passe = i < 3;
    fx.forEach((f) => {
      const n = f.league.name;
      if (AMICAL_S.test(n) || JEUNES_S.test(n) || FEMININ_S.test(n) || ECARTEES_S.test(n)) return;
      // Hors des competitions suivies, une page de match n'a ni demande de
      // recherche ni article associe : elle consomme du budget d'exploration
      // sans rien pouvoir ramener.
      if (!LIGUES_SITEMAP.has(f.league.id)) return;
      const base = '/football/match/' + slug(f.teams.home.name) + '-'
                 + slug(f.teams.away.name) + '-' + f.fixture.id + '/';
      const lastmod = (f.fixture.date || '').slice(0, 10) || jour;
      // un match passe ne bouge plus, un match a venir change chaque jour
      const freq = passe ? 'monthly' : 'daily';
      urls.push({ loc: base, lastmod, freq, prio: passe ? '0.5' : '0.6' });
      // Les onglets /pronostics/ et /tete-a-tete/ restent servis et crawlables
      // par lien interne (depuis la page de match), mais ne sont plus soumis
      // au sitemap : leur contenu est quasi identique a la page principale
      // (meme gabarit ~468 Ko), et les soumettre doublait le volume d'URLs du
      // sitemap matchs (9 873 au lieu de 3 291) sans apporter de valeur
      // supplementaire — dilution du budget de crawl sur un domaine jeune.
    });
  });
  return xml(urls);
}

// ── /transferts/ ───────────────────────────────────────────────────────────
// L'ecran Transferts existait dans l'application mais sans URL : donc invisible
// pour Google. On rend ici la liste cote serveur, hydratee par l'application
// comme les autres pages (cible { type: 'transfers' }).
async function pageTransferts() {
  let fil = [];
  try {
    const r = await fetch(SITE + '/api/transferts/');
    if (r.ok) { const j = await r.json(); fil = (j && j.transferts) || []; }
  } catch (e) {}

  const NATURE = { transfert: 'Transfert', libre: 'Transfert libre' };
  const lignes = fil.slice(0, 60).map((x) => {
    const d = new Date(x.date + 'T12:00:00Z');
    const jour = String(d.getUTCDate()).padStart(2, '0') + '/'
      + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear();
    return '<tr><td class="eq">' + esc(x.joueur) + '</td><td class="eq">' + esc(x.de)
      + '</td><td class="eq">' + esc(x.vers) + '</td><td>'
      + esc(x.valeur || NATURE[x.type] || 'Transfert') + '</td><td>' + esc(jour) + '</td></tr>';
  }).join('');

  const corps = (fil.length
    ? '<table><thead><tr><th class="eq">Joueur</th><th class="eq">De</th>'
      + '<th class="eq">Vers</th><th>Type</th><th>Date</th></tr></thead><tbody>'
      + lignes + '</tbody></table>'
    : '<p class="sous">Aucun transfert récent à afficher pour le moment.</p>')
    + '<p class="sous">Le mercato des grands championnats européens : Ligue 1, Premier League, '
    + 'La Liga, Serie A, Bundesliga, Liga Portugal, Eredivisie, Jupiler Pro League et Süper Lig. '
    + '<a href="/">Scores en direct</a> · <a href="/calendrier/">Calendrier</a> · '
    + '<a href="/classement/">Classements</a>.</p>';

  return page({
    cible: { type: 'transfers' },
    url: '/transferts/',
    titre: 'Derniers transferts football — mercato des grands championnats | NinjaScores',
    desc: 'Tous les derniers transferts du mercato : Ligue 1, Premier League, Liga, Serie A, '
      + 'Bundesliga et plus. Joueur, club de départ, club d\'arrivée et date.',
    h1: 'Derniers transferts',
    fil: [{ nom: 'Accueil', url: '/' }, { nom: 'Transferts' }],
    corps,
    jsonld: fil.length ? [{
      '@context': 'https://schema.org', '@type': 'ItemList',
      name: 'Derniers transferts football',
      numberOfItems: Math.min(fil.length, 60),
      itemListElement: fil.slice(0, 20).map((x, i) => ({
        '@type': 'ListItem', position: i + 1,
        name: x.joueur + ' : ' + x.de + ' → ' + x.vers,
      })),
    }] : [],
  });
}

// ── point d'entree ─────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Le module reste charge entre deux invocations « chaudes » : sans remise a
  // zero, une panne survenue lors d'un rendu precedent contaminerait celui-ci.
  apiReset();
  // Apres une reecriture, Vercel remplace req.url par la DESTINATION
  // (/api/seo) : le chemin d'origine est perdu. On le recoit donc via le
  // parametre `chemin` pose dans vercel.json.
  const q = req.query || {};
  const bouts = ['football'];
  if (q.pays) bouts.push(String(q.pays));
  if (q.comp) bouts.push(String(q.comp));
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // le classement bouge peu : une heure de cache CDN, servi perime pendant
  // la revalidation pour ne jamais faire attendre le visiteur
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');

  try {
    if (q.sitemap) {
      const jour = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
      const quoi = String(q.sitemap);
      if (quoi === 'index') return res.status(200).send(sitemapIndex(jour));
      if (quoi === 'pays') return res.status(200).send(sitemapPays(jour));
      if (quoi === 'competitions') return res.status(200).send(sitemapCompetitions(jour));
      if (quoi === 'equipes') return res.status(200).send(sitemapEquipes(jour));
      if (quoi === 'joueurs') return res.status(200).send(sitemapJoueurs(jour));
      if (quoi === 'matchs') return res.status(200).send(await sitemapMatchs(jour));
      if (quoi === 'pronostics') return res.status(200).send(await sitemapPronostics(jour, String(req.query.lang || 'fr')));
      return res.status(404).send('<?xml version="1.0"?><urlset/>');
    }

    // page de match : cache court tant que le score peut bouger, tres long
    // une fois le match termine puisque le contenu ne changera plus
    if (q.equipe) {
      const r = await pageEquipe(String(q.equipe));
      if (!r) return introuvable(res);
      const demande = '/football/equipe/' + String(q.equipe).replace(/\/+$/, '') + '/';
      if (demande !== r.url) {
        res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400');
        res.setHeader('Location', SITE + r.url);
        return res.status(301).end();
      }
      // le calendrier d'un club bouge lentement : cache long, revalidation
      // en arriere-plan, pour ne pas exposer le quota a un crawl soutenu
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=21600, stale-while-revalidate=604800');
      return res.status(200).send(r.html);
    }

    if (q.joueur) {
      const r = await pageJoueur(String(q.joueur));
      if (!r) return introuvable(res);
      const demande = '/football/joueur/' + String(q.joueur).replace(/\/+$/, '') + '/';
      if (demande !== r.url) {
        res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400');
        res.setHeader('Location', SITE + r.url);
        return res.status(301).end();
      }
      // carriere/transferts bougent lentement : meme cache que la page equipe
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=21600, stale-while-revalidate=604800');
      return res.status(200).send(r.html);
    }

    if (q.match) {
      const seg = q.onglet ? String(q.onglet).replace(/\/+$/, '') : '';
      // /resume/ n'est pas une URL : le resume EST la fiche. On redirige au
      // lieu de servir deux fois la meme page.
      if (seg === 'resume') {
        res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400');
        res.setHeader('Location', SITE + '/football/match/'
          + String(q.match).replace(/\/+$/, '') + '/');
        return res.status(301).end();
      }
      if (seg && !PAR_SEG[seg]) return introuvable(res);
      const r = await pageMatch(String(q.match), seg);
      if (!r) return introuvable(res);
      // L'identifiant final fait foi. Un libelle different (ancien nom de
      // club, faute de frappe, lien recopie) ne doit pas creer une seconde
      // page au meme contenu : on redirige en 301 vers la forme canonique,
      // onglet compris pour ne pas renvoyer le visiteur au resume.
      const demande = '/football/match/' + String(q.match).replace(/\/+$/, '') + '/'
        + (seg ? seg + '/' : '');
      if (demande !== r.url) {
        res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400');
        res.setHeader('Location', SITE + r.url);
        return res.status(301).end();
      }
      // Les compositions et les cotes bougent jusqu'au coup d'envoi ; le
      // classement et les confrontations, non. Une fois le match FINI, les
      // huit onglets sont figes : on cache 30 jours au CDN pour barrer le
      // trafic bots avant meme d'atteindre la fonction (constate le 03/09 :
      // fixtures:id brulait 100 % du quota API par re-crawl des historiques).
      res.setHeader('Cache-Control', r.fini
        ? 'public, max-age=0, s-maxage=2592000, stale-while-revalidate=2592000'
                    // 60 s etait absurde : un robot repassant toutes les
                    // minutes refaisait les 8 appels API a chaque fois. Une cote
                    // ou une compo probable ne bougent pas a cette cadence.
        : 'public, max-age=0, s-maxage=600, stale-while-revalidate=3600');
      return res.status(200).send(r.html);
    }
    if (q.transferts) {
      // le fil bouge par jours : cache aligne sur celui de /api/transferts
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=21600, stale-while-revalidate=86400');
      return res.status(200).send(await pageTransferts());
    }

    if (bouts.length === 1) return res.status(200).send(await pageRacine());

    const p = paysParSlug(bouts[1]);
    if (!p) return introuvable(res);

    if (bouts.length === 2) return res.status(200).send(pagePays(p));

    const donnees = lirePays(p.cle);
    if (!donnees) return introuvable(res);
    const ligue = (p.ordre || []).find((l) => slug(l) === bouts[2]);
    if (!ligue) return introuvable(res);

    const html = pageCompetition(p, ligue, donnees);
    if (!html) return introuvable(res);
    return res.status(200).send(html);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).send('<!doctype html><html lang="fr"><head><meta charset="utf-8">'
      + '<title>Erreur</title><meta name="robots" content="noindex"></head><body>'
      + '<p>Une erreur est survenue. <a href="/">Retour à l\'accueil</a></p></body></html>');
  }
}

function introuvable(res) {
  // Panne API : la page existe peut-etre tres bien, on n'a simplement pas pu
  // le verifier. Un 404 ferait desindexer ; un 503 avec Retry-After dit a
  // Google de repasser plus tard et preserve l'URL.
  if (apiIndispo()) {
    // s-maxage : pendant une panne de quota, les robots repassent en boucle
    // sur des milliers d'URL. no-store transformait chaque passage en pages
    // SSR completes (jusqu'a 8 appels API chacune) — la panne s'alimentait
    // elle-meme. 10 min d'absorption CDN par URL suffisent a casser la boucle
    // sans retarder le retour a la normale.
    res.setHeader('Cache-Control', 'public, s-maxage=600');
    res.setHeader('Retry-After', '3600');
    return res.status(503).send('<!doctype html><html lang="fr"><head><meta charset="utf-8">'
      + '<title>Service momentanement indisponible | NinjaScores</title>'
      + '<meta name="robots" content="noindex">'
      + '</head><body><h1>Service momentanement indisponible</h1>'
      + '<p>Les données ne sont pas accessibles pour le moment. Merci de réessayer dans quelques minutes.</p>'
      + '<p><a href="/football/">Voir tous les championnats</a> · <a href="/">Accueil</a></p></body></html>');
  }
  // Une page reellement introuvable le reste : cache court pour absorber les
  // crawlers sans figer une 404 qui pourrait devenir une vraie page demain.
  res.setHeader('Cache-Control', 'public, s-maxage=600');
  return res.status(404).send('<!doctype html><html lang="fr"><head><meta charset="utf-8">'
    + '<title>Page introuvable | NinjaScores</title><meta name="robots" content="noindex">'
    + '</head><body><h1>Page introuvable</h1>'
    + '<p><a href="/football/">Voir tous les championnats</a> · <a href="/">Accueil</a></p></body></html>');
}
