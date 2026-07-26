#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Audit des logos de championnat sur les 3 surfaces de NinjaScores.

Objectif : vérifier que CHAQUE championnat a bien son logo, pas seulement
dans le calendrier, mais aussi dans les FAVORIS et dans la BARRE DE RECHERCHE.
Passage pays par pays (Afrique du Sud -> Zimbabwe), championnat par championnat.

Les 3 surfaces ne résolvent PAS le logo de la même façon (c'est la cause des
logos manquants) :

  1. CALENDRIER / CLASSEMENTS  -> LeagueLogo({name, country, src})
       - src provider (runtime, non auditable ici)
       - sinon table "logosParPays" : clé LEAGUE_LOGOS finissant par
         "<ligue> <PaysFR>"  (résolution avec le pays)
       - sinon LEAGUE_LOGOS[nom] direct
     => bonne couverture (le pays aide).

  2. FAVORIS ("Ajouter un favori")   -> liste = SEARCH_DATA.leagues
  3. BARRE DE RECHERCHE (header)      -> liste = SEARCH_DATA.leagues
     Les deux rendent le logo via LeagueLogo({name}) SANS pays ni src :
       logo affiché UNIQUEMENT si LEAGUE_LOGOS[name] existe à la clé EXACTE
       (sensible à la casse). => c'est là que ça casse.

Sources lues (aucun appel réseau) :
  - data/standings/manifest.json    (pays -> nom FR + compétitions = calendrier)
  - index.html                      (dict LEAGUE_LOGOS + LEAGUE_AMBIGUS)
  - app.compiled.js                 (SEARCH_DATA.leagues = favoris + recherche)

Usage :
  python3 scripts/audit_logos_championnats.py            # rapport complet
  python3 scripts/audit_logos_championnats.py --todo     # seulement les problèmes
  python3 scripts/audit_logos_championnats.py --csv out.csv
"""
import json, re, sys, os, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, 'data/standings/manifest.json')
INDEX    = os.path.join(ROOT, 'index.html')
BUNDLE   = os.path.join(ROOT, 'app.compiled.js')

# ── normalisation identique à _nrmLg() de index.html ──────────────────────────
def nrm(s):
    s = unicodedata.normalize('NFD', str(s or ''))
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return s.strip().lower()

def sortkey(nom):            # tri alphabétique FR insensible aux accents
    return nrm(nom)

# ── 1. manifest : pays -> {nom FR, [compétitions]} ────────────────────────────
def load_manifest():
    m = json.load(open(MANIFEST, encoding='utf-8'))['pays']
    pays = {}
    for code, v in m.items():
        pays[code] = {'nom': v['nom'], 'ligues': list(v.get('ligues', {}).keys())}
    return pays

# ── 2. LEAGUE_LOGOS + LEAGUE_AMBIGUS depuis index.html ────────────────────────
def _extract_dict(html, marker):
    i = html.find(marker); j = html.find('{', i); depth = 0; k = j
    while k < len(html):
        if html[k] == '{': depth += 1
        elif html[k] == '}':
            depth -= 1
            if depth == 0: break
        k += 1
    return html[j:k + 1]

def load_league_logos():
    html = open(INDEX, encoding='utf-8').read()
    seg = _extract_dict(html, 'var LEAGUE_LOGOS')
    # clés : 'Nom': ... (on ne garde que les clés, la valeur nous importe peu)
    keys = re.findall(r"'((?:[^'\\]|\\.)*)'\s*:", seg)
    logos = set(k for k in keys)
    amb_seg = _extract_dict(html, 'var LEAGUE_AMBIGUS')
    amb = dict(re.findall(r"'([^']+)'\s*:\s*'([^']+)'", amb_seg))
    return logos, {nrm(k): v for k, v in amb.items()}

# ── 3. SEARCH_DATA.leagues depuis app.compiled.js (favoris + recherche) ────────
def load_search_leagues():
    d = open(BUNDLE, encoding='utf-8', errors='replace').read()
    o = d.find('"leagues":[', 2000000)
    k = d.find('}]', o) + 2
    seg = d[o + len('"leagues":'):k]
    names = re.findall(r'"name":"((?:[^"\\]|\\.)*)"', seg)
    def unesc(s):
        try: return json.loads('"' + s + '"')
        except Exception: return s
    return set(unesc(n) for n in names)

# ── résolution logo comme chaque surface ──────────────────────────────────────
class Resolver:
    def __init__(self, logos, amb, search):
        self.logos = logos                       # clés exactes LEAGUE_LOGOS
        self.logos_nrm = {nrm(k): k for k in logos}
        self.amb = amb
        self.search = search
        self.search_nrm = {nrm(s): s for s in search}
        # table logosParPays : (paysNrm, ligueNrm) présents via clé "<ligue> <pays>"
        self.par_pays = set()
        for k in logos:
            self.par_pays.add(nrm(k))             # on testera par suffixe à la volée

    # CALENDRIER : logo curaté résolu (hors src provider runtime)
    def calendrier(self, comp, paysfr):
        p = nrm(paysfr); c = nrm(comp)
        # 1) table par pays : une clé LEAGUE_LOGOS == "<comp> <paysfr>"
        for kn in self.logos_nrm:
            if kn == (c + ' ' + p):
                return 'ok-pays'
        # 2) direct
        if c in self.logos_nrm:
            # garde-fou LEAGUE_AMBIGUS : logo d'un autre pays => masqué
            owner = self.amb.get(c)
            if owner and nrm(owner) != p:
                return 'bloque-ambigu'
            return 'ok-direct'
        return 'provider'      # dépend du logo fourni par l'API au runtime

    # FAVORIS + RECHERCHE : présent dans la liste ? logo à clé exacte ?
    def recherche(self, comp, paysfr):
        cn = nrm(comp)
        pw = [w for w in nrm(paysfr).split() if len(w) > 2]
        # une entrée SEARCH_DATA.leagues correspond si son nom == comp
        # ou commence par "comp " (suffixe pays francisé, forme variable)
        cand = [s for s in self.search
                if nrm(s) == cn or nrm(s).startswith(cn + ' ')]
        if not cand:
            return ('absent', None)
        # préférer l'entrée qui contient un mot du pays (désambiguïse les
        # noms génériques : Premier League, 1st Division, Serie A...)
        withpays = [s for s in cand if any(w in nrm(s) for w in pw)]
        exact = [s for s in cand if nrm(s) == cn]
        if withpays:
            sname = withpays[0]
        elif exact and not self.amb.get(cn):
            sname = exact[0]                      # générique non ambigu
        elif exact and nrm(self.amb.get(cn, '')) == nrm(paysfr):
            sname = exact[0]                      # générique possédé par ce pays
        else:
            return ('absent', None)               # seul un générique d'un AUTRE pays
        if sname in self.logos:                   # clé EXACTE (sensible casse)
            return ('logo', sname)
        if nrm(sname) in self.logos_nrm:          # existe mais casse/accent diffère
            return ('casse', sname)
        return ('manque', sname)                  # aucun logo nulle part

# ── exécution ─────────────────────────────────────────────────────────────────
def main():
    todo_only = '--todo' in sys.argv
    csv_path = None
    if '--csv' in sys.argv:
        csv_path = sys.argv[sys.argv.index('--csv') + 1]

    pays = load_manifest()
    logos, amb = load_league_logos()
    search = load_search_leagues()
    R = Resolver(logos, amb, search)

    ICON = {'ok-pays': '🗓️✓', 'ok-direct': '🗓️✓', 'provider': '🗓️~',
            'bloque-ambigu': '🗓️✗'}
    SICON = {'logo': '✅', 'casse': '🔤', 'manque': '❌', 'absent': '·'}

    rows = []
    stats = {'total': 0, 'search_ok': 0, 'search_casse': 0,
             'search_manque': 0, 'search_absent': 0, 'cal_provider': 0}
    problems = {'casse': [], 'manque': [], 'absent': []}

    codes = sorted(pays, key=lambda c: sortkey(pays[c]['nom']))
    print("=" * 78)
    print("AUDIT LOGOS CHAMPIONNATS — Calendrier / Favoris / Recherche")
    print("%d pays — de « %s » à « %s »" % (
        len(codes), pays[codes[0]]['nom'], pays[codes[-1]]['nom']))
    print("Légende : 🗓️ calendrier (✓ curaté, ~ provider runtime, ✗ bloqué) | "
          "recherche+favoris : ✅ logo · 🔤 casse à corriger · ❌ aucun logo · · absent de la liste")
    print("=" * 78)

    for ci, code in enumerate(codes, 1):
        nom = pays[code]['nom']; ligues = pays[code]['ligues']
        lines = []
        for comp in ligues:
            cal = R.calendrier(comp, nom)
            srch, sname = R.recherche(comp, nom)
            stats['total'] += 1
            if cal == 'provider': stats['cal_provider'] += 1
            stats['search_' + ({'logo': 'ok', 'casse': 'casse',
                                'manque': 'manque', 'absent': 'absent'}[srch])] += 1
            if srch == 'casse':  problems['casse'].append((nom, comp, sname))
            if srch == 'manque': problems['manque'].append((nom, comp, sname))
            if srch == 'absent': problems['absent'].append((nom, comp))
            ok = (srch == 'logo')
            lines.append((ok, "   %s %-3s %-34s %s%s" % (
                SICON[srch], ICON.get(cal, '?'), comp[:34],
                ('→ ' + sname) if (sname and sname != comp) else '',
                '' )))
            rows.append({'pays': nom, 'championnat': comp, 'calendrier': cal,
                         'recherche_favoris': srch, 'nom_recherche': sname or ''})
        show = lines if not todo_only else [l for l in lines if not l[0]]
        if show:
            flag = '' if all(l[0] for l in lines) else '  ⚠️'
            print("\n[%3d/%d] %s  (%d championnat%s)%s"
                  % (ci, len(codes), nom, len(ligues),
                     's' if len(ligues) > 1 else '', flag))
            for _, txt in show:
                print(txt)

    # ── synthèse ──────────────────────────────────────────────────────────────
    print("\n" + "=" * 78)
    print("SYNTHÈSE")
    print("=" * 78)
    t = stats['total']
    print("  Championnats audités                    : %d" % t)
    print("  ✅ Logo OK en favoris/recherche         : %d (%.0f%%)"
          % (stats['search_ok'], 100 * stats['search_ok'] / t))
    print("  🔤 Logo existe mais CASSE à corriger    : %d" % stats['search_casse'])
    print("  ❌ Aucun logo (à ajouter à LEAGUE_LOGOS): %d" % stats['search_manque'])
    print("  ·  Absent de la liste recherche/favoris : %d" % stats['search_absent'])
    print("  🗓️~ Calendrier dépendant du provider    : %d" % stats['cal_provider'])

    if problems['casse']:
        print("\n── 🔤 CASSE/ACCENT à corriger (logo existe, clé exacte KO) ──")
        for nom, comp, sname in problems['casse']:
            print("   %-22s %-30s recherche='%s'" % (nom, comp, sname))
    if problems['manque']:
        print("\n── ❌ AUCUN LOGO (présent en recherche, à ajouter) ──")
        for nom, comp, sname in problems['manque']:
            print("   %-22s %-30s recherche='%s'" % (nom, comp, sname))

    # ── audit DIRECT et précis de SEARCH_DATA.leagues (favoris + recherche) ────
    # (indépendant du manifest : c'est exactement ce que voient l'utilisateur
    #  dans la barre de recherche et l'écran « Ajouter un favori »)
    scasse = sorted(s for s in search if s not in logos and nrm(s) in R.logos_nrm)
    smanque = sorted(s for s in search if s not in logos and nrm(s) not in R.logos_nrm)
    print("\n" + "=" * 78)
    print("AUDIT DIRECT — SEARCH_DATA.leagues (favoris + barre de recherche)")
    print("=" * 78)
    print("  Compétitions searchables                : %d" % len(search))
    print("  ✅ avec logo (clé exacte)               : %d" % (len(search) - len(scasse) - len(smanque)))
    print("  🔤 logo existe, CASSE à corriger        : %d" % len(scasse))
    print("  ❌ aucun logo (à ajouter)               : %d" % len(smanque))
    if scasse:
        print("\n  🔤 à corriger (la clé LEAGUE_LOGOS diffère juste par la casse/accent) :")
        for s in scasse:
            print("     recherche='%s'   vs clé existante='%s'" % (s, R.logos_nrm[nrm(s)]))
    if smanque:
        print("\n  ❌ aucun logo nulle part (ajouter à LEAGUE_LOGOS) :")
        for s in smanque:
            print("     %s" % s)

    if csv_path:
        import csv
        with open(csv_path, 'w', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader(); w.writerows(rows)
        print("\nCSV écrit : %s (%d lignes)" % (csv_path, len(rows)))

if __name__ == '__main__':
    main()
