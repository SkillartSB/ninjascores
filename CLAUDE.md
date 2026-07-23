# NinjaScores APP — Instructions pour Claude Code

## Fichiers à NE JAMAIS lire en entier

Les fichiers suivants sont des bundles compilés/générés. Ne JAMAIS les lire en entier
avec Read ou cat, ne JAMAIS faire de grep dessus sans `head -c` ou redirection limitée.
Ils contiennent des milliers d'emojis multi-codepoint (drapeaux) qui cassent
la sérialisation JSON via le mécanisme de troncature de Claude Code.

- `app.compiled.js` — bundle compilé, NE PAS LIRE
- Tout fichier `*.min.js` ou `*.compiled.*`

## Si tu dois absolument inspecter ces fichiers

Utilise UNIQUEMENT :
- `Read` avec `offset` et `limit` explicites (max 100 lignes par lecture)
- `grep -c` (compte uniquement) plutôt que `grep` (qui renvoie le contenu)
- Pour chercher dans le bundle, demande d'abord à l'utilisateur s'il préfère
  inspecter le fichier source non-compilé à la place.

## Fichiers source à privilégier

Pour comprendre le code, lis les sources, pas les bundles :
- `NinjaScores Prototype2.html` (le prototype, ~12 drapeaux, OK)
- `index.html`
- `polymarket.service.js`

