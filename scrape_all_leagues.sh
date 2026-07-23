#!/bin/bash
# Scrape all additional leagues sequentially

cd "/Users/julesmathis/NinjaScores APP"

run() {
  local id=$1 slug=$2 name=$3
  echo ""
  echo "=========================================="
  echo "▶ Starting: $name (ID: $id)"
  echo "=========================================="
  python3 scrape_premier_league.py --league "$id" --slug "$slug" --name "$name"
  echo "✓ Done: $name"
}

run 112  "liga-profesional"     "Liga Profesional"
run 38   "bundesliga"           "Bundesliga Autriche"
run 40   "first-division-a"     "First Division A"
run 268  "serie-a"              "Serie A Brasil"
run 273  "liga-de-primera"      "Liga de Primera"
run 120  "super-league"         "Super League Chine"
run 46   "superligaen"          "Superligaen"
run 64   "premiership"          "Premiership"
run 140  "liga-2"               "Liga 2"
run 51   "veikkausliiga"        "Veikkausliiga"
run 223  "j-league"             "J.League"
run 530  "botola-pro"           "Botola Pro"
run 536  "saudi-pro-league"     "Saudi Pro League"
run 110  "ligue-2"              "Ligue 2"
run 130  "mls"                  "MLS"
run 48   "championship"         "Championship"
run 61   "liga-portugal"        "Liga Portugal"
run 71   "super-lig"            "Super Lig"

echo ""
echo "=========================================="
echo "ALL LEAGUES DONE"
ls -lh *_database.csv
echo "=========================================="
