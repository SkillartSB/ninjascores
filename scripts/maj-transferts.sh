#!/bin/bash
# Mise a jour periodique des transferts, lancee par launchd tous les 3 jours.
#
# Tourne depuis le Mac (IP residentielle) parce que Transfermarkt bloque les
# IP des runners GitHub Actions. Deroule :
#   1. enrichissement (scripts/enrichir-transferts.mjs)  ->  data/transferts.json
#   2. si le fichier a change : commit + push + deploiement Vercel
#
# launchd demarre avec un environnement minimal : on fixe donc le PATH a la main.
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$HOME/bin:$HOME/.local/bin"

PROJET="/Users/julesmathis/NinjaScores APP"
LOG="$HOME/Library/Logs/ninjascores-transferts.log"

cd "$PROJET" || { echo "$(date): projet introuvable" >> "$LOG"; exit 1; }

echo "" >> "$LOG"
echo "======== $(date) ========" >> "$LOG"

# se remettre a jour avant de travailler (evite les conflits de push)
git pull --quiet --rebase origin main >> "$LOG" 2>&1

# enrichissement — le garde-fou du script n'ecrit rien si l'IP est bloquee
COMBIEN=60 node scripts/enrichir-transferts.mjs >> "$LOG" 2>&1

if git diff --quiet -- data/transferts.json; then
  echo "aucun changement dans data/transferts.json — rien a deployer" >> "$LOG"
  exit 0
fi

echo "changements detectes : commit + push + deploiement" >> "$LOG"
git add data/transferts.json
git commit -q -m "chore: montants transferts (Transfermarkt) $(date +%Y-%m-%d)" >> "$LOG" 2>&1
git push --quiet origin main >> "$LOG" 2>&1
npx vercel deploy --prod >> "$LOG" 2>&1
echo "$(date): termine" >> "$LOG"
