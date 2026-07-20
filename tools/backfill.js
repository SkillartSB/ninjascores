#!/usr/bin/env node
// Reprise des classements depuis API-Football, pays par pays.
//
// Economie de credits :
//  1. UNE requete /leagues par pays : elle donne les identifiants, la liste des
//     saisons REELLEMENT existantes et le drapeau coverage.standings. On ne
//     tire donc jamais a l'aveugle sur une saison qui n'existe pas.
//  2. On ignore les saisons dont coverage.standings est faux.
//  3. Reprise sur incident : chaque pays est ecrit sur disque des qu'il est
//     termine, et un pays deja present dans le fichier de sortie n'est jamais
//     redemande.
//  4. Le proxy /api/foot met les reponses en cache 1 h cote CDN : relancer le
//     script dans l'heure ne consomme aucun credit supplementaire.
//
// Usage :  node tools/backfill.js <pays...>     un ou plusieurs pays
//          node tools/backfill.js --tous        toute la liste
//          node tools/backfill.js --cout        estime sans rien depenser

const fs = require('fs');
const path = require('path');

const BASE   = 'https://ninjascores.com/api/foot';
const SORTIE = path.join(__dirname, '..', 'standings_api.json');
const AN_MIN = 2010;

let depense = 0;

async function api(params) {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`${BASE}?${qs}`);
  depense++;
  if (!r.ok) throw new Error(`${qs} → HTTP ${r.status}`);
  const j = await r.json();
  if (j.errors && (Array.isArray(j.errors) ? j.errors.length : Object.keys(j.errors).length)) {
    throw new Error(`${qs} → ${JSON.stringify(j.errors)}`);
  }
  return j;
}

// "2024" seul pour un championnat en annee civile, "2024/25" sinon.
function libelleSaison(s) {
  const a = new Date(s.start).getUTCFullYear();
  const b = new Date(s.end).getUTCFullYear();
  return a === b ? String(a) : `${a}/${String(b).slice(2)}`;
}

// Le classement arrive en groupes (poules, conferences) : on aplatit.
function normalise(rep) {
  if (!rep || !rep.length) return null;
  const groupes = rep[0].league && rep[0].league.standings;
  if (!groupes || !groupes.length) return null;
  const lignes = [];
  groupes.forEach((g, gi) => g.forEach((r) => {
    lignes.push({
      rank: r.rank,
      team: r.team && r.team.name,
      logo: r.team && r.team.logo,
      played: r.all && r.all.played,
      won: r.all && r.all.win,
      drawn: r.all && r.all.draw,
      lost: r.all && r.all.lose,
      gd: String(r.goalsDiff > 0 ? '+' + r.goalsDiff : r.goalsDiff),
      pts: r.points,
      groupe: groupes.length > 1 ? (r.group || `Groupe ${gi + 1}`) : undefined,
    });
  }));
  return lignes.length ? lignes : null;
}

async function traiterPays(pays, sortie, estimerSeulement) {
  // API-Football n'accepte pas les espaces : "South Africa" → "South-Africa".
  const j = await api({ path: 'leagues', country: pays.replace(/\s+/g, '-') });
  const ligues = (j.response || []).filter((l) => l.league.type === 'League');
  if (!ligues.length) { console.log(`  ${pays} : aucun championnat`); return 0; }

  // On garde le championnat le plus ancien (proxy fiable du niveau 1) et,
  // s'il existe, un deuxieme niveau. Inutile de tirer les N3 poule A a M.
  ligues.sort((a, b) => b.seasons.length - a.seasons.length);
  const retenues = ligues.slice(0, 2);

  let cout = 0;
  for (const l of retenues) {
    const id = l.league.id;
    const saisons = l.seasons.filter(
      (s) => s.year >= AN_MIN && s.coverage && s.coverage.standings
    );
    cout += saisons.length;
    if (estimerSeulement) {
      console.log(`  ${pays} · ${l.league.name} (${id}) → ${saisons.length} saisons`);
      continue;
    }

    const bloc = {};
    for (const s of saisons) {
      try {
        const st = await api({ path: 'standings', league: id, season: s.year });
        const lignes = normalise(st.response);
        if (lignes) bloc[libelleSaison(s)] = lignes;
      } catch (e) {
        console.log(`    ! ${l.league.name} ${s.year} : ${e.message}`);
      }
    }
    if (Object.keys(bloc).length) {
      sortie[pays] = sortie[pays] || {};
      sortie[pays][l.league.name] = bloc;
      const ks = Object.keys(bloc);
      console.log(`  ${pays} · ${l.league.name} : ${ks.length} saisons (${ks[ks.length - 1]} → ${ks[0]})`);
    }
  }
  return cout;
}

(async () => {
  const args = process.argv.slice(2);
  const estimer = args.includes('--cout');
  const MAP = require('./pays.js');
  // Pays absents du catalogue API-Football : inutile de depenser une requete.
  const ABSENTS = new Set(['Brunei','Cap-Vert','Guinée équatoriale','Îles Salomon',
    'Madagascar','Mozambique','Niger','Papouasie-Nouvelle-Guinée','Sierra Leone',
    'Sri Lanka','Tahiti','Taïwan','Tchad','Vanuatu']);

  let pays = args.filter((a) => !a.startsWith('--'));
  if (args.includes('--tous')) {
    pays = Object.keys(MAP)
      .filter((fr) => !ABSENTS.has(fr))
      .sort((a, b) => a.localeCompare(b, 'fr'))
      .map((fr) => MAP[fr]);
    console.log(`${pays.length} pays a traiter (${ABSENTS.size} ecartes, absents du catalogue)\n`);
  }
  if (!pays.length) { console.log('Indique au moins un pays, ou --tous.'); process.exit(1); }

  const sortie = fs.existsSync(SORTIE)
    ? JSON.parse(fs.readFileSync(SORTIE, 'utf8')) : {};

  let total = 0;
  for (const p of pays) {
    if (sortie[p] && !estimer) { console.log(`  ${p} : deja fait, ignore`); continue; }
    try {
      total += await traiterPays(p, sortie, estimer);
      if (!estimer) fs.writeFileSync(SORTIE, JSON.stringify(sortie));
    } catch (e) {
      console.log(`  ${p} : ECHEC ${e.message}`);
    }
  }

  if (estimer) console.log(`\nEstimation : ${total} requetes de classement + ${pays.length} de reperage`);
  else console.log(`\nRequetes consommees : ${depense}`);
})();
