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

const SITE = 'https://ninjascores.com';
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
function page({ url, titre, desc, h1, fil, corps, jsonld, canon, robots, cible }) {
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

  h = h.replace('</head>', '<style>' + CSS_SEO + '</style>\n'
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
    + '<script>window.NS_SEO_CIBLE=' + JSON.stringify(cible || null) + ';</script>';

  return h.replace('<div id="root"></div>', bloc + '\n<div id="root"></div>');
}

// ── /football/ ─────────────────────────────────────────────────────────────
function pageRacine() {
  const m = manifeste();
  const pays = Object.keys(m)
    .map((cle) => ({ cle, nom: m[cle].nom, n: (m[cle].ordre || []).length }))
    .filter((p) => p.n > 0)
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const liens = pays.map((p) =>
    `<li><a href="/football/${slug(p.nom)}/">${esc(p.nom)}</a></li>`).join('');
  return page({
    cible: { type: 'racine' },
    url: '/football/',
    titre: 'Football — classements et résultats de ' + pays.length + ' pays | NinjaScores',
    desc: 'Classements, résultats et calendriers de ' + pays.length + ' pays : Ligue 1, '
        + 'Premier League, Liga, Serie A, Bundesliga et des centaines de championnats.',
    h1: 'Football — ' + pays.length + ' pays couverts',
    fil: [{ nom: 'Accueil', url: '/' }, { nom: 'Football' }],
    corps: `<p class="sous">Choisissez un pays pour accéder à ses championnats, classements et résultats.</p>
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

async function api(chemin) {
  const cle = process.env.API_FOOTBALL_KEY;
  if (!cle) return [];
  const r = await fetch('https://v3.football.api-sports.io/' + chemin,
    { headers: { 'x-apisports-key': cle } });
  if (!r.ok) return [];
  const j = await r.json();
  return j.response || [];
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
async function ongletCotes(f, dom, ext) {
  let bk = [];
  try { bk = await api('odds?fixture=' + f.fixture.id + '&bookmaker=8'); } catch (e) {}
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

async function ongletPronostics(f, dom, ext) {
  let p = [];
  try { p = await api('predictions?fixture=' + f.fixture.id); } catch (e) {}
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

async function ongletCompo(f, dom, ext) {
  let lu = [];
  try { lu = await api('fixtures/lineups?fixture=' + f.fixture.id); } catch (e) {}
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

async function ongletStats(f, dom, ext) {
  let st = [];
  try { st = await api('fixtures/statistics?fixture=' + f.fixture.id); } catch (e) {}
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
async function ongletTat(f, dom, ext, h2h) {
  const idD = f.teams.home.id, idE = f.teams.away.id;
  let dD = [], dE = [];
  try {
    [dD, dE] = await Promise.all([
      api('fixtures?team=' + idD + '&last=10').catch(() => []),
      api('fixtures?team=' + idE + '&last=10').catch(() => []),
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
  return '<tr><td>' + esc(String(d2.getDate()).padStart(2, '0') + '/'
    + String(d2.getMonth() + 1).padStart(2, '0') + '/' + d2.getFullYear())
    + '</td><td class="eq">' + esc(x.teams.home.name) + '</td><td class="pts">'
    + esc(x.goals.home) + ' - ' + esc(x.goals.away) + '</td><td class="eq">'
    + esc(x.teams.away.name) + '</td><td>' + esc(x.league.name) + '</td></tr>';
}

async function pageMatch(slugComplet, onglet) {
  const id = (String(slugComplet).match(/-(\d+)$/) || [])[1];
  if (!id) return null;
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

  // confrontations directes : c'est ce qui donne de la substance a la page
  let h2h = [];
  try {
    h2h = (await api('fixtures/headtohead?h2h=' + f.teams.home.id + '-' + f.teams.away.id + '&last=11'))
      // le fournisseur inclut la rencontre en cours : une page ne peut pas se
      // citer elle-meme parmi ses confrontations passees
      .filter((x) => FINIS[x.fixture.status.short] && x.fixture.id !== f.fixture.id)
      .slice(0, 10);
  } catch (e) {}

  const titreScore = fini && score ? dom + ' ' + score + ' ' + ext : dom + ' - ' + ext;
  const h1 = titreScore;
  const sousTitre = compet + ' · ' + date + ' · ' + libelle
    + (f.fixture.venue && f.fixture.venue.name ? ' · ' + f.fixture.venue.name : '');

  const lignesH2H = h2h.map(ligneH2H).join('');

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

  // Onglet demande. `resume` n'existe pas comme segment : c'est l'URL de base,
  // sinon deux URLs porteraient la meme page.
  const o = onglet ? PAR_SEG[onglet] : ONGLETS[0];
  if (onglet && !o) return null;

  const liensEquipes = '<h2>Les deux équipes</h2><ul class="liens">'
    + '<li><a href="/football/equipe/' + slug(dom) + '-' + f.teams.home.id + '/">' + esc(dom) + '</a></li>'
    + '<li><a href="/football/equipe/' + slug(ext) + '-' + f.teams.away.id + '/">' + esc(ext) + '</a></li>'
    + '</ul>'
    + (lienCompet ? '<h2>À voir aussi</h2><ul class="liens">' + lienCompet + '</ul>' : '');

  let vue;
  if (o.id === 'resume') {
    vue = { vide: false,
      titre: titreScore + ' — ' + compet + ', ' + date + (fini ? ' : résultat et statistiques' : ' : avant-match'),
      desc: (fini && score
        ? dom + ' ' + score + ' ' + ext + '. Résultat complet du match de ' + compet + ' du ' + date + '.'
        : dom + ' contre ' + ext + ', ' + compet + ', le ' + date + '. Horaire, confrontations directes et statistiques.')
        + (h2h.length ? ' ' + h2h.length + ' confrontations directes.' : ''),
      corps: (h2h.length
        ? '<h2>Confrontations directes</h2><table><thead><tr><th>Date</th><th class="eq">Domicile</th>'
          + '<th>Score</th><th class="eq">Extérieur</th><th>Compétition</th></tr></thead><tbody>'
          + lignesH2H + '</tbody></table>'
        : '<h2>Confrontations directes</h2><p class="sous">Aucune rencontre entre ces deux équipes dans nos archives.</p>') };
  } else if (o.id === 'cotes')      vue = await ongletCotes(f, dom, ext);
  else if (o.id === 'pronostics')   vue = await ongletPronostics(f, dom, ext);
  else if (o.id === 'compo')        vue = await ongletCompo(f, dom, ext);
  else if (o.id === 'stats')        vue = await ongletStats(f, dom, ext);
  else if (o.id === 'tat')          vue = await ongletTat(f, dom, ext, h2h);
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
  const paysNom = eq.country || '';

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

function sitemapIndex(jour) {
  const seg = ['pays', 'competitions', 'equipes', 'matchs'];
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
                { loc: '/transferts/', lastmod: jour, freq: 'daily', prio: '0.7' }];
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
      const base = '/football/match/' + slug(f.teams.home.name) + '-'
                 + slug(f.teams.away.name) + '-' + f.fixture.id + '/';
      const lastmod = (f.fixture.date || '').slice(0, 10) || jour;
      // un match passe ne bouge plus, un match a venir change chaque jour
      const freq = passe ? 'monthly' : 'daily';
      urls.push({ loc: base, lastmod, freq, prio: passe ? '0.5' : '0.6' });
      // Seuls les onglets dont la donnee existe toujours entrent au sitemap.
      // Les compositions n'arrivent qu'une heure avant le coup d'envoi : les
      // annoncer plus tot ferait crawler une page vide, donc noindex.
      urls.push({ loc: base + 'pronostics/', lastmod, freq, prio: '0.5' });
      urls.push({ loc: base + 'tete-a-tete/', lastmod, freq, prio: '0.4' });
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
      if (quoi === 'matchs') return res.status(200).send(await sitemapMatchs(jour));
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
      // classement et les confrontations, non.
      const stable = r.fini && (r.onglet.id === 'tat' || r.onglet.id === 'tableau'
        || r.onglet.id === 'stats' || r.onglet.id === 'resume');
      res.setHeader('Cache-Control', stable
        ? 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800'
        : (r.fini ? 'public, max-age=0, s-maxage=21600, stale-while-revalidate=604800'
                  : 'public, max-age=0, s-maxage=60, stale-while-revalidate=300'));
      return res.status(200).send(r.html);
    }
    if (q.transferts) {
      // le fil bouge par jours : cache aligne sur celui de /api/transferts
      res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=21600, stale-while-revalidate=86400');
      return res.status(200).send(await pageTransferts());
    }

    if (bouts.length === 1) return res.status(200).send(pageRacine());

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
  res.setHeader('Cache-Control', 'no-store');
  return res.status(404).send('<!doctype html><html lang="fr"><head><meta charset="utf-8">'
    + '<title>Page introuvable | NinjaScores</title><meta name="robots" content="noindex">'
    + '</head><body><h1>Page introuvable</h1>'
    + '<p><a href="/football/">Voir tous les championnats</a> · <a href="/">Accueil</a></p></body></html>');
}
