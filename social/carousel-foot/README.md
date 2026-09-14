# Carrousel Foot — NinjaScores

Générateur de carrousels pour Instagram et TikTok. 7 slides, pilotées par un seul
bloc de données. Tout est local (polices, écussons, logos de ligue) : ça marche
hors ligne et le rendu est identique d'une machine à l'autre.

```
slide 1  →  la sélection du jour (5 matchs)
slide 2  →  match 1  ─┐
…                     ├─ 1 slide par match : écussons, coup d'envoi, prono, cote
slide 6  →  match 5  ─┘
slide 7  →  CTA « télécharge l'app »
```

## Changer les matchs du jour

Ouvre `index.html`, bloc **① LES DONNÉES** (tout en haut du `<script>`).
C'est le seul endroit à toucher :

```js
{
  league: { name: 'Serie A', country: 'Italie', badge: 'assets/leagues/serie-a.png' },
  time:  '18:30',                                            // coup d'envoi
  home:  { name: 'Torino',  crest: 'assets/crests/torino.png', color: '#A32020' },
  away:  { name: 'AS Roma', crest: 'assets/crests/roma.png',   color: '#C2394F' },
  prono: ['Victoire', 'de la Roma'],                         // 2 lignes
  cote:  '1.55',
  book:  'Bet365',
  freq:  '90%',    // fréquence observée
  note:  9,        // note du ninja, sur 10
}
```

- `color` pilote le halo coloré derrière l'écusson → mets la couleur du club.
- `plate: 'light'` sur une équipe : pose l'écusson sur un disque blanc. À utiliser
  pour les écussons très sombres, invisibles sur fond noir (ex. Metz).
- `light: true` sur une ligue : même chose pour un logo de ligue sombre
  (Premier League, LaLiga).
- Les gros titres se recalent automatiquement sur la largeur utile : écris ce que
  tu veux dans `cover.l1`, `cta.l1`… la taille s'ajuste toute seule.

Le nombre de matchs n'est pas figé : 3 ou 7 entrées dans `matches` marchent aussi,
la pagination et les slides suivent.

## Ajouter un écusson

Dépose le PNG (fond transparent) dans `assets/crests/` et pointe-le dans `crest`.
Une URL distante marche aussi, par ex. celle qu'utilise déjà l'app :
`https://media.api-sports.io/football/teams/503.png` (l'id vient de
`data/teams-index.json`). Les fichiers locaux restent préférables : l'export ne
dépend alors d'aucun réseau.

## Voir le rendu

Ouvre `social/carousel-foot/index.html` dans un navigateur. La barre du bas permet
de rejouer l'animation d'entrée, de basculer 1080×1350 ↔ 1080×1920 et de zoomer
à 100 %.

## Exporter les PNG

```bash
npm install                                   # une seule fois (playwright)
node social/carousel-foot/export.mjs          # 1080×1350 — carrousel Instagram
node social/carousel-foot/export.mjs story    # 1080×1920 — TikTok / Stories
node social/carousel-foot/export.mjs both
```

Sortie : `social/carousel-foot/out/<format>/01.png … 07.png`, aux dimensions
exactes, animations figées sur leur état final. Le dossier `out/` n'est pas
versionné.

## Ce qu'il y a dans le dossier

```
index.html              le générateur (design + données + rendu)
export.mjs              capture des slides en PNG
assets/fonts/           Archivo (titrage) · JetBrains Mono (libellés techniques)
assets/crests/          écussons des clubs
assets/leagues/         logos de championnats
assets/noise.png        grain argentique de la texture de fond
```

Plus Jakarta Sans (la police de l'app) est reprise depuis `assets/fonts/` à la
racine du repo pour la maquette du téléphone de la slide 7.
