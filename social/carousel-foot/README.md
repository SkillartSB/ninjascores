# Visuels Foot — NinjaScores

Générateur des visuels quotidiens pour Instagram et TikTok. Deux sorties,
**une seule source de données** :

- **`index.html`** — le carrousel, 7 slides
  ```
  slide 1  →  la sélection du jour (5 matchs)
  slide 2  →  match 1  ─┐
  …                     ├─ 1 slide par match : écussons, coup d'envoi, prono, cote
  slide 6  →  match 5  ─┘
  slide 7  →  CTA « télécharge l'app »
  ```
- **`story.html`** — la story TikTok, un visuel unique et autonome : les 5 matchs
  y portent chacun leur prono et leur cote, puisqu'il n'y a rien à faire glisser.
  Ses marges tiennent compte de l'interface TikTok (180 px en haut, 250 px en bas,
  168 px à droite pour les boutons like / commentaire / partage). Le bouton
  **Zones TikTok** de l'aperçu affiche ces repères.

Tout est local (polices, écussons, logos de ligue) : ça marche hors ligne et le
rendu est identique d'une machine à l'autre.

## Changer les matchs du jour

Un seul fichier : **`data.js`**. Il alimente le carrousel *et* la story.

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

Ouvre `index.html` ou `story.html` dans un navigateur. La barre du bas permet de
rejouer l'animation d'entrée, de zoomer à 100 %, de basculer 1080×1350 ↔ 1080×1920
(carrousel) et d'afficher les zones d'interface TikTok (story).

## Exporter les PNG

```bash
npm install                                  # une seule fois (playwright)
node social/carousel-foot/export.mjs         # tout
node social/carousel-foot/export.mjs ig      # carrousel 1080×1350 — Instagram
node social/carousel-foot/export.mjs 9x16    # carrousel 1080×1920 — TikTok
node social/carousel-foot/export.mjs story   # la story 1080×1920
```

Sortie dans `out/` : `carrousel-4x5/`, `carrousel-9x16/`, `story/`. Dimensions
exactes, animations figées sur leur état final. Le dossier `out/` n'est pas
versionné.

Le texte du post TikTok (légende, premier commentaire, réglages de publication)
est dans `legende-tiktok.md`.

## Ce qu'il y a dans le dossier

```
data.js                 LES DONNÉES DU JOUR — le seul fichier à modifier
index.html              le carrousel, 7 slides
story.html              la story TikTok, visuel unique
theme.css               socle commun : décor, marque, titrage, animations
common.js               briques communes : fond, entête, titres calés, montage
export.mjs              capture des visuels en PNG
legende-tiktok.md       la légende du post et les réglages de publication
assets/fonts/           Archivo (titrage) · JetBrains Mono (libellés techniques)
assets/crests/          écussons des clubs
assets/leagues/         logos de championnats
assets/noise.png        grain argentique de la texture de fond
```

Plus Jakarta Sans (la police de l'app) est reprise depuis `assets/fonts/` à la
racine du repo pour la maquette du téléphone de la slide 7.
