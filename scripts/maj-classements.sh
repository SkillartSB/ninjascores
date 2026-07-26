#!/bin/bash
# Régénération quotidienne des classements (source API-Football), lancée par
# launchd. Déroule le pipeline tools/ EXISTANT en préservant les zones :
#
#   0. zones-snapshot.js   -> capture les zones actuelles (par index de ligne)
#   1. backfill.js         -> API-Football -> standings_api.json   (coûte quota)
#   2. split.js            -> régénère data/standings/ (EFFACE les zones)
#   3. divisions-inf.js    -> ajoute les divisions inférieures
#   4. zones-restore.js    -> repose les zones sur les mêmes slots
#   5. si data/standings a changé : commit + push + déploiement Vercel
#
# GARDE-FOU : si backfill échoue (quota épuisé, réseau...), standings_api.json
# n'est pas rafraîchi et on ABANDONNE avant split.js — sinon on effacerait les
# classements existants sans rien pour les remplacer.
#
# launchd démarre avec un environnement minimal : on fixe le PATH à la main.
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$HOME/bin:$HOME/.local/bin"

PROJET="/Users/julesmathis/NinjaScores APP"
LOG="$HOME/Library/Logs/ninjascores-classements.log"
SNAP="$PROJET/standings_api.json"
TAILLE_MIN=1000000   # standings_api.json sain fait ~8 Mo ; en-dessous de 1 Mo = suspect

cd "$PROJET" || { echo "$(date): projet introuvable" >> "$LOG"; exit 1; }

echo "" >> "$LOG"
echo "======== $(date) ========" >> "$LOG"

git pull --quiet --rebase origin main >> "$LOG" 2>&1

# 0. snapshot des zones AVANT toute modification
node tools/zones-snapshot.js >> "$LOG" 2>&1 || { echo "snapshot KO — abandon" >> "$LOG"; exit 1; }

# empreinte de standings_api.json avant backfill (détecte s'il a été rafraîchi)
AVANT=$(shasum "$SNAP" 2>/dev/null | awk '{print $1}')

# 1. backfill API-Football
if ! node tools/backfill.js >> "$LOG" 2>&1; then
  echo "backfill.js a échoué (quota ? réseau ?) — abandon AVANT split, données intactes" >> "$LOG"
  exit 1
fi

# garde-fou : standings_api.json doit avoir changé ET rester de taille saine
APRES=$(shasum "$SNAP" 2>/dev/null | awk '{print $1}')
OCTETS=$(wc -c < "$SNAP" 2>/dev/null | tr -d ' ')
if [ "$AVANT" = "$APRES" ]; then
  echo "standings_api.json inchangé après backfill — abandon (rien de neuf, on ne régénère pas)" >> "$LOG"
  exit 0
fi
if [ -z "$OCTETS" ] || [ "$OCTETS" -lt "$TAILLE_MIN" ]; then
  echo "standings_api.json anormalement petit ($OCTETS o) — abandon AVANT split" >> "$LOG"
  exit 1
fi

# 2-4. régénération + réapplication des zones
node tools/split.js >> "$LOG" 2>&1        || { echo "split.js KO" >> "$LOG"; exit 1; }
node tools/divisions-inf.js >> "$LOG" 2>&1 || echo "divisions-inf.js: avertissement (on continue)" >> "$LOG"
node tools/zones-restore.js >> "$LOG" 2>&1 || echo "zones-restore.js: avertissement" >> "$LOG"

# 5. déploiement si changement
if git diff --quiet -- data/standings/; then
  echo "aucun changement dans data/standings/ — rien à déployer" >> "$LOG"
  exit 0
fi

echo "changements détectés : commit + push + déploiement" >> "$LOG"
git add data/standings/
git commit -q -m "chore: classements (API-Football) $(date +%Y-%m-%d)" >> "$LOG" 2>&1
git push --quiet origin main >> "$LOG" 2>&1
npx vercel deploy --prod >> "$LOG" 2>&1
echo "$(date): terminé" >> "$LOG"
