#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Récupère les logos AUTHENTIQUES des 19 championnats sans logo, via l'API-Football
(endpoint /leagues, qui renvoie id + logo + pays exacts — aucune supposition).

À lancer quand le quota API est disponible (plan relevé) :
    python3 scripts/fetch_logos_manquants.py

Le script interroge le proxy déployé (/api/foot?path=leagues&country=...),
choisit la ligue dont le nom colle le mieux à l'indice, et imprime :
  - l'URL de logo authentique
  - la ligne LEAGUE_LOGOS prête à coller dans index.html
Il NE modifie rien tout seul : on valide les URLs, puis on patche LEAGUE_LOGOS.
"""
import json, sys, urllib.request, unicodedata

PROXY = "https://ninjascores.com/api/foot/"   # slash final : évite la redirection 308 (trailingSlash)

def nrm(s):
    s = unicodedata.normalize('NFD', str(s or ''))
    return ''.join(c for c in s if unicodedata.category(c) != 'Mn').strip().lower()

# (clé cible LEAGUE_LOGOS, country param API, indice de nom, alias éventuel)
CIBLES = [
    ("J.League Japon",              "Japan",       "J1 League",            "J.League"),
    ("Serie C Italie",              "Italy",       "Serie C",              None),
    ("Liga II Roumanie",            "Romania",     "Liga II",              None),
    ("Ligat Haal Israel",           "Israel",      "Ligat Ha'al",          None),
    ("Leumit League Israel",        "Israel",      "Liga Leumit",          None),
    ("Primera Federacion Espagne",  "Spain",       "Primera División RFEF", None),
    ("Primera B Colombie",          "Colombia",    "Primera B",            None),
    ("Segunda Division Uruguay",    "Uruguay",     "Segunda División",     None),
    ("Primera Division Costa Rica", "Costa-Rica",  "Primera División",     None),
    ("Primera Division Salvador",   "El-Salvador", "Primera División",     None),
    ("Primera Division Venezuela",  "Venezuela",   "Primera División",     None),
    ("Liga Nacional Guatemala",     "Guatemala",   "Liga Nacional",        None),
    ("Liga Nacional Honduras",      "Honduras",    "Liga Nacional",        None),
    ("LPF Panama",                  "Panama",      "Liga Panameña",        None),
    ("1. Division Chypre",          "Cyprus",      "1. Division",          None),
    ("2. Division Chypre",          "Cyprus",      "2. Division",          None),
    # AMBIGUS — à confirmer le pays avant de patcher :
    ("Liga Profesional",            "Argentina",   "Liga Profesional",     None),
    ("Liga De Primera",             "Chile",       "Primera División",     None),
]

def leagues(country):
    url = "%s?path=leagues&country=%s" % (PROXY, country.replace(' ', '%20'))
    req = urllib.request.Request(url, headers={'User-Agent': 'ns-audit'})
    with urllib.request.urlopen(req, timeout=20) as r:
        d = json.load(r)
    if isinstance(d, dict) and d.get('error'):
        raise RuntimeError(d.get('details') or d['error'])
    return d.get('response', [])

def best(resp, hint):
    hn = nrm(hint)
    exact = [it for it in resp if nrm(it['league']['name']) == hn]
    if exact: return exact[0]
    partial = [it for it in resp if hn in nrm(it['league']['name'])
               and it['league']['type'] == 'League']
    if partial: return partial[0]
    return None

def main():
    print("// --- logos manquants (à coller dans LEAGUE_LOGOS d'index.html) ---")
    ko = []
    for key, country, hint, alias in CIBLES:
        try:
            resp = leagues(country)
        except Exception as e:
            print("//  %-28s ERREUR API (%s) : %s" % (key, country, e)); ko.append(key); continue
        it = best(resp, hint)
        if not it:
            noms = ', '.join(x['league']['name'] for x in resp[:8])
            print("//  %-28s introuvable pour '%s' — dispo: %s" % (key, hint, noms))
            ko.append(key); continue
        lg = it['league']
        print("    '%s': '%s'," % (key, lg['logo']))
        if alias:
            print("    '%s': '%s'," % (alias, lg['logo']))
    if ko:
        print("\n// à traiter manuellement : %s" % ', '.join(ko))

if __name__ == '__main__':
    main()
