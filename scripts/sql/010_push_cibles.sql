-- 010_push_cibles.sql — notifications : équipes et joueurs favoris, préférences, compte
-- (13/09/2026). Ajoute aux DEUX tables d'abonnements (web et iOS) :
--   cibles  : { equipes: [id API-Football], equipesNoms: [nom], joueurs: [{nom, equipe}] }
--   prefs   : { buts, mi_temps, fin } — types de notifications voulus
--   user_id : compte connecté au moment de l'inscription (facultatif)
-- À exécuter UNE FOIS dans Supabase (SQL Editor). Idempotent, sans perte de données.
-- Le code fonctionne AVANT cette migration (colonnes ignorées) : elle active les
-- notifications d'équipes, de joueurs et les préférences.

alter table push_subscriptions add column if not exists cibles  jsonb not null default '{}'::jsonb;
alter table push_subscriptions add column if not exists prefs   jsonb not null default '{"buts":true,"mi_temps":true,"fin":true}'::jsonb;
alter table push_subscriptions add column if not exists user_id uuid;

alter table apns_subscriptions add column if not exists cibles  jsonb not null default '{}'::jsonb;
alter table apns_subscriptions add column if not exists prefs   jsonb not null default '{"buts":true,"mi_temps":true,"fin":true}'::jsonb;
alter table apns_subscriptions add column if not exists user_id uuid;

create index if not exists idx_push_subscriptions_user on push_subscriptions (user_id);
create index if not exists idx_apns_subscriptions_user on apns_subscriptions (user_id);

-- PostgREST doit relire le schéma pour exposer les nouvelles colonnes tout de suite.
notify pgrst, 'reload schema';
