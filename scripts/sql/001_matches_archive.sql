-- Archive permanente des matchs (résultats, compos, stats, événements).
-- À exécuter UNE FOIS dans Supabase (SQL Editor) avant d'activer le cron
-- d'archivage. Idempotent : peut être relancé sans casser l'existant.

create table if not exists matches (
  fixture_id       bigint primary key,
  league_id        int,
  league_name      text,
  season           int,
  round            text,
  match_date       timestamptz not null,
  status           text not null,               -- FT / AET / PEN / AWD / WO...
  home_team_id     int,
  home_team_name   text,
  home_team_logo   text,
  away_team_id     int,
  away_team_name   text,
  away_team_logo   text,
  home_score       int,
  away_score       int,
  venue_name       text,
  venue_city       text,
  referee          text,
  lineups          jsonb,          -- null tant que non capturé
  statistics       jsonb,          -- null tant que non capturé
  events           jsonb,          -- null tant que non capturé
  detail_captured  boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_matches_home_team   on matches (home_team_id, match_date desc);
create index if not exists idx_matches_away_team   on matches (away_team_id, match_date desc);
create index if not exists idx_matches_date        on matches (match_date desc);
create index if not exists idx_matches_league      on matches (league_id, season);
create index if not exists idx_matches_pending     on matches (match_date) where detail_captured = false;

-- Statistiques individuelles d'un joueur pour un match donné + table de
-- liaison pour retrouver rapidement "tous les matchs d'un joueur".
create table if not exists match_players (
  fixture_id   bigint not null references matches(fixture_id) on delete cascade,
  player_id    bigint not null,
  player_name  text,
  team_id      int,
  stats        jsonb,             -- {minutes, rating, goals, assists, ...}
  primary key (fixture_id, player_id)
);

create index if not exists idx_match_players_player on match_players (player_id, fixture_id);

-- RLS : lecture publique (les pages SEO/joueur/équipe lisent en anonyme),
-- écriture réservée à la clé service_role (utilisée uniquement côté serveur
-- par la fonction d'archivage Vercel, jamais exposée au client).
alter table matches enable row level security;
alter table match_players enable row level security;

drop policy if exists "matches_public_read" on matches;
create policy "matches_public_read" on matches for select using (true);

drop policy if exists "match_players_public_read" on match_players;
create policy "match_players_public_read" on match_players for select using (true);

-- Aucune policy insert/update/delete pour le rôle anon/authenticated :
-- seule la service_role (qui contourne RLS par défaut) peut écrire.
