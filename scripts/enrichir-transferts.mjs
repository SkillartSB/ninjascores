// Enrichissement des transferts avec les montants Transfermarkt.
//
// Lance par GitHub Actions tous les 3-4 jours. Deroule :
//   1. recupere la base (balayage API-Football) via /api/transferts?raw=1
//   2. pour les 60 premiers, cherche le montant sur Transfermarkt
//   3. ecrit data/transferts.json (servi ensuite tel quel par l'endpoint)
//
// Appariement SUR : on ne fait pas confiance au nom seul. On confirme chaque
// transfert par le club d'arrivee ET la date (a +-8 jours). Un homonyme n'a
// pas ce transfert-la dans son historique, donc il est ecarte. En cas de
// doute, on n'ecrit AUCUN montant plutot qu'un faux.
//
// Source des montants : l'API JSON interne de Transfermarkt
//   /ceapi/transferHistory/list/{id}  ->  { transfers: [{ date, from, to, fee, marketValue }] }
// Pas de scraping HTML : c'est structure et stable.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const RACINE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SORTIE = path.join(RACINE, 'data', 'transferts.json');
const SITE = process.env.SITE || 'https://ninjascores.com';
const COMBIEN = Number(process.env.COMBIEN || 60);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const dors = (ms) => new Promise((r) => setTimeout(r, ms));

async function tm(url, json, essai = 0) {
  try {
    const r = await fetch('https://www.transfermarkt.com' + url,
      { headers: { 'User-Agent': UA, accept: json ? 'application/json' : '*/*' } });
    if (!r.ok) {
      if (r.status === 429 && essai < 3) { await dors(1500 * (essai + 1)); return tm(url, json, essai + 1); }
      return null;
    }
    return json ? await r.json() : await r.text();
  } catch (e) {
    if (essai < 3) { await dors(1200 * (essai + 1)); return tm(url, json, essai + 1); }
    return null;
  }
}

// tokens d'un nom de club, sans les suffixes qui ne discriminent pas
function jetons(s) {
  const t = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return new Set(t.replace(/\b(fc|cf|ac|sc|as|ss|afc|sv|fk|bk|rc|us|ud|cd|sk|nk|if|ac)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 1));
}
function memeClub(a, b) {
  const A = jetons(a), B = jetons(b);
  for (const w of A) if (B.has(w)) return true;
  return false;
}

// "M. Estève" -> "Estève" ; "Mikel Rodríguez" -> "Rodríguez"
function nomRecherche(n) {
  const sansInitiale = String(n || '').replace(/^[A-Z]\.\s*/, '');
  const parts = sansInitiale.split(/\s+/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : sansInitiale;
}

// "€39.00m" -> "39 M€" ; "€500k" -> "500 K€" ; "free transfer" -> "Libre"
function nettoyerMontant(brut) {
  const f = String(brut || '').replace(/<[^>]+>/g, ' ');
  const m = f.match(/€\s?([\d.,]+)\s?(m|k|bn)?/i);
  if (m) {
    const v = parseFloat(m[1].replace(',', '.'));
    const u = (m[2] || '').toLowerCase();
    if (u === 'k') return Math.round(v) + ' K€';
    if (u === 'bn') return v.toFixed(2).replace('.', ',') + ' Md€';
    return (v % 1 === 0 ? String(v) : v.toFixed(1).replace('.', ',')) + ' M€';
  }
  if (/free/i.test(f)) return 'Libre';
  if (/loan/i.test(f)) return 'Prêt';
  return null;
}

async function candidats(requete) {
  const srch = await tm('/schnellsuche/ergebnis/schnellsuche?query='
    + encodeURIComponent(requete), false);
  const ids = [];
  if (!srch) return ids;
  const re = /\/profil\/spieler\/(\d+)"/g; let m;
  while ((m = re.exec(srch)) && ids.length < 20) if (!ids.includes(m[1])) ids.push(m[1]);
  return ids;
}

async function montant(joueur, vers, dateIso) {
  const d0 = new Date(dateIso + 'T12:00:00Z');
  // Quand le prenom est complet (« Andrey Santos »), on cherche le nom entier
  // car le nom de famille seul est trop courant. Quand il est abrege
  // (« A. Král »), le nom entier « A Král » ne resout rien et POLLUE la liste
  // de candidats : on s'en tient alors au nom de famille.
  const abrege = /^[A-Z]\.\s/.test(String(joueur || ''));
  const requetes = abrege ? [nomRecherche(joueur)]
    : [String(joueur).trim(), nomRecherche(joueur)];
  const ids = [];
  for (const q of requetes) {
    for (const id of await candidats(q)) if (!ids.includes(id)) ids.push(id);
    await dors(250);
  }

  for (const id of ids.slice(0, 10)) {
    const th = await tm('/ceapi/transferHistory/list/' + id, true);
    await dors(300);
    if (!th || !th.transfers) continue;
    for (const t of th.transfers) {
      const to = (t.to || {}).clubName || '';
      if (!memeClub(to, vers)) continue;
      // confirmation par la date
      const parts = String(t.date || '').split('/');
      if (parts.length === 3) {
        const dt = new Date(Date.UTC(+parts[2], +parts[1] - 1, +parts[0], 12));
        if (Math.abs((dt - d0) / 86400000) > 8) continue;
      }
      return nettoyerMontant(t.fee);
    }
  }
  return null;
}

async function main() {
  const rep = await fetch(SITE + '/api/transferts/?raw=1');
  if (!rep.ok) throw new Error('base indisponible : HTTP ' + rep.status);
  const base = await rep.json();
  const liste = (base.transferts || []).slice(0, COMBIEN);
  console.log('base : ' + (base.transferts || []).length + ' transferts, on enrichit les ' + liste.length + ' premiers');

  let trouves = 0, chiffres = 0;
  for (const x of liste) {
    const v = await montant(x.joueur, x.vers, x.date);
    if (v) {
      trouves++;
      x.valeur = v;
      // le montant precise la nature : un vrai prix => transfert definitif
      if (v !== 'Libre' && v !== 'Prêt') { x.type = 'transfert'; chiffres++; }
      else if (v === 'Libre') x.type = 'libre';
    }
    console.log('  ' + (v ? '✓ ' + v : '· —').padEnd(12) + ' ' + x.joueur + ' → ' + x.vers);
    await dors(500);
  }

  // Garde-fou anti-blocage : si presque rien n'a matche (Transfermarkt bloque
  // l'IP — cas des runners GitHub Actions), on n'ecrit PAS. Ecraser le bon
  // fichier par du vide serait pire que ne rien faire. Le precedent reste servi.
  if (liste.length >= 10 && trouves < liste.length * 0.2) {
    console.error('\n⚠ seulement ' + trouves + '/' + liste.length + ' apparies : '
      + 'Transfermarkt bloque probablement cette IP. Fichier NON modifie.');
    process.exit(2);
  }

  // on conserve TOUT le fil (150), seuls les 60 premiers sont enrichis
  const sortie = {
    genere: base.genere,
    enrichi: new Date().toISOString(),
    clubs: base.clubs,
    total: (base.transferts || []).length,
    enrichis: liste.length,
    transferts: base.transferts || [],
  };
  fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
  fs.writeFileSync(SORTIE, JSON.stringify(sortie));
  console.log('\ndata/transferts.json ecrit : ' + trouves + '/' + liste.length
    + ' apparies, ' + chiffres + ' avec montant chiffre');
}

main().catch((e) => { console.error('ECHEC :', e.message); process.exit(1); });
