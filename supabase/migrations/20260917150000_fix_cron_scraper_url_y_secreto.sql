-- =====================================================================
-- Corrige el cron del scraper de propiedades externas:
--   1. La URL tenía el placeholder literal "TU_PROJECT_REF" (nunca se
--      reemplazó al aplicar la migración original), causando
--      "Couldn't resolve host name" en cada corrida (confirmado en
--      net._http_response el 17 sept 2026).
--   2. El secreto se mandaba en el header "Authorization" con el
--      nombre de secreto "scraper_service_role_key", pero la Edge
--      Function espera el header "x-scraper-secret" comparado contra
--      la env var SCRAPER_TRIGGER_SECRET. Nunca coincidían -> 401.
--
-- Requiere que el secreto 'scraper_trigger_secret' ya exista en
-- Supabase Vault con el mismo valor que SCRAPER_TRIGGER_SECRET de la
-- función (creado manualmente desde el SQL Editor, no en migración).
-- =====================================================================

select cron.schedule(
  'scrapear_propiedades_externas_diario',
  '0 12 * * *',
  $$
  select net.http_post(
    url := 'https://ymvrddvckmwiajcqaled.supabase.co/functions/v1/scrapear-propiedades-externas',
    headers := jsonb_build_object(
      'x-scraper-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'scraper_trigger_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
