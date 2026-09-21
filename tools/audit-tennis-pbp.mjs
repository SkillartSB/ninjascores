// Audit du point par point tennis — node tools/audit-tennis-pbp.mjs [jours] [max]
//
// Le flux d'API-Tennis arrive sale (jeu decisif sorti en set a part, decoupe en
// un pseudo-jeu par point, points repetes ou revenus en arriere). api/tennis.js
// le remet en ordre a la reponse : ce script verifie que la sortie est propre,
// sur un lot de matchs reels, et nomme ce qui ne l'est pas.
//
// Il lit la PRODUCTION (donc le cache Redis) : le lancer coute peu d'appels
// amont et donne l'etat reellement servi aux applications.
const SITE = process.env.NS_SITE || 'https://ninjascores.com';
const JOURS = parseInt(process.argv[2], 10) || 3;
const MAX = parseInt(process.argv[3], 10) || 30;
const POINTS_JEU = new Set(['0', '15', '30', '40', 'A']);

const api = async (qs) => {
  try {
    const r = await fetch(SITE + '/api/tennis/?' + qs, { signal: AbortSignal.timeout(30000) });
    const j = await r.json();
    return j && j.success === 1 ? j.result : null;
  } catch { return null; }
};
const jourISO = (d) => d.toISOString().slice(0, 10);
const moins = (n) => jourISO(new Date(Date.now() - n * 86400000));

async function enFile(taches, n) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < taches.length) { const k = i++; out[k] = await taches[k](); } }));
  return out;
}

/** Anomalies d'un match, en clair. Liste vide = rien a signaler. */
const ECHELLE = ['0', '15', '30', '40'];
/**
 * Un point peut-il succeder au precedent ? On tolere les SAUTS (le flux ne
 * publie pas toujours tous les etats, notamment le retour a egalite apres un
 * avantage perdu : « 40-A » puis « A-40 ») mais jamais les RETOURS EN ARRIERE,
 * qui trahissent un jeu rejoue depuis le debut par le fournisseur
 * (« 40-0 » puis « 0-40 », « 0-40 » puis « 15-15 »).
 */
function progresse(prec, suiv, tb) {
  const val = (v) => (v === 'A' ? 4 : (tb ? parseInt(v, 10) : ECHELLE.indexOf(v)));
  const [a0, b0] = prec.split('-').map(val);
  const [a1, b1] = suiv.split('-').map(val);
  if ([a0, b0, a1, b1].some((v) => v == null || isNaN(v) || v < 0)) return false;
  // Avantage perdu : un camp recule d'un cran pour revenir a egalite.
  if (!tb && (a0 === 4 || b0 === 4)) {
    if (a1 === 3 && b1 === 3) return true;               // retour a 40-40
    if ((a0 === 3 && b0 === 4 && a1 === 4 && b1 === 3) || (a0 === 4 && b0 === 3 && a1 === 3 && b1 === 4)) return true;  // l'egalite n'a pas ete publiee
  }
  return a1 >= a0 && b1 >= b0 && (a1 + b1) > (a0 + b0);
}

function auditer(pbp, vides) {
  const pb = [];
  if (!Array.isArray(pbp) || !pbp.length) return ['point par point absent'];

  const sets = [...new Set(pbp.map((g) => String(g.set_number)))];
  if (sets.some((s) => /tiebreak/i.test(s))) pb.push('un set « TieBreak » subsiste : ' + sets.filter((s) => /tiebreak/i.test(s)).join(', '));
  if (sets.length > 5) pb.push(sets.length + ' sets (maximum 5)');
  const doublons = sets.filter((s, i) => sets.indexOf(s) !== i);
  if (doublons.length) pb.push('sets en double : ' + doublons.join(', '));

  sets.forEach((s) => {
    const jeux = pbp.filter((g) => String(g.set_number) === s);
    const nums = jeux.map((g) => parseInt(g.number_game, 10) || 0);
    if (nums.some((n, i) => n !== i + 1)) pb.push(s + ' : jeux non consecutifs (' + nums.join(',') + ')');
    const tbs = jeux.filter((g) => g.tie_break);
    if (tbs.length > 1) pb.push(s + ' : ' + tbs.length + ' jeux decisifs');
    if (tbs.length && tbs[0] !== jeux[jeux.length - 1]) pb.push(s + ' : le jeu decisif n\'est pas le dernier');
    if (jeux.length > 26) pb.push(s + ' : ' + jeux.length + ' jeux, improbable');

    jeux.forEach((g) => {
      const pts = (g.points || []).map((p) => String(p.score || '').replace(/\s/g, ''));
      const ou = s + ' jeu ' + g.number_game;
      // Un jeu sans points arrive quand le fournisseur n'a pas couvert le jeu :
      // c'est une lacune de donnees, pas une incoherence. On le note a part.
      if (!pts.length) { vides.push(ou); return; }
      // Pas de controle de doublon : « 40-40 » revient a chaque avantage perdu,
      // c'est le jeu normal. Seule la progression fait foi (ci-dessous).
      pts.forEach((k) => {
        const c = k.split('-');
        if (c.length !== 2) { pb.push(ou + ' : score illisible « ' + k + ' »'); return; }
        const ok = g.tie_break ? (/^\d+$/.test(c[0]) && /^\d+$/.test(c[1])) : (POINTS_JEU.has(c[0]) && POINTS_JEU.has(c[1]));
        if (!ok) pb.push(ou + ' : score hors jeu « ' + k + ' »' + (g.tie_break ? ' (décisif)' : ''));
      });
      // Chaque point doit s'enchainer selon la regle du tennis (un avantage perdu
      // est legitime, un retour a 15-15 apres 0-40 ne l'est pas).
      for (let i = 1; i < pts.length; i++) {
        if (!progresse(pts[i - 1], pts[i], !!g.tie_break)) pb.push(ou + ' : retour en arrière « ' + pts[i - 1] + ' » → « ' + pts[i] + ' »');
      }
    });
  });
  return pb;
}

(async () => {
  const jours = Array.from({ length: JOURS }, (_, i) => moins(i));
  const listes = await enFile(jours.map((j) => () => api('method=get_fixtures&date_start=' + j + '&date_stop=' + j)), 3);
  const matchs = [];
  listes.forEach((l) => (l || []).forEach((m) => {
    if (!/^(Atp|Wta) Singles$/.test(String(m.event_type_type || ''))) return;
    if (!m.event_winner) return;                       // matchs joues : le pbp y est complet
    matchs.push(m);
  }));
  const lot = matchs.slice(0, MAX);
  console.log('Matchs audités : ' + lot.length + ' (sur ' + matchs.length + ' terminés en ' + JOURS + ' jours)');

  const details = await enFile(lot.map((m) => () => api('method=get_fixtures&match_key=' + m.event_key + '&detail=1')), 3);
  let sains = 0, sansPbp = 0, jeuxVides = 0;
  const rapport = [];
  details.forEach((d, i) => {
    const m = lot[i];
    const nom = m.event_first_player + ' - ' + m.event_second_player + ' (' + m.tournament_name + ', ' + m.event_date + ')';
    const pbp = d && d[0] && d[0].pointbypoint;
    if (!pbp || !pbp.length) { sansPbp++; return; }
    const vides = [];
    const pb = auditer(pbp, vides);
    if (vides.length) jeuxVides += vides.length;
    if (!pb.length) { sains++; return; }
    rapport.push({ nom, pb });
  });

  console.log('Sains : ' + sains + ' · sans point par point : ' + sansPbp + ' · à problème : ' + rapport.length
    + ' · jeux non couverts par le fournisseur : ' + jeuxVides + '\n');
  rapport.slice(0, 12).forEach((r) => {
    console.log('── ' + r.nom);
    r.pb.slice(0, 6).forEach((x) => console.log('   • ' + x));
    if (r.pb.length > 6) console.log('   … et ' + (r.pb.length - 6) + ' autres');
  });
  process.exit(rapport.length ? 1 : 0);
})();
