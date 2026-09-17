-- =====================================================================
-- Cron: dispara el scraper de propiedades externas todos los días
-- a las 6:00 AM hora Guatemala (12:00 UTC).
-- =====================================================================
-- Requiere que el secreto 'scraper_service_role_key' ya exista en
-- Supabase Vault (creado manualmente desde el SQL Editor, no en
-- migración, para no exponer el service_role key en git).
-- =====================================================================

create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'scrapear_propiedades_externas_diario',
  '0 12 * * *',
  $$
  select net.http_post(
    url := 'https://TU_PROJECT_REF.supabase.co/functions/v1/scrapear-propiedades-externas',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'scraper_service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
