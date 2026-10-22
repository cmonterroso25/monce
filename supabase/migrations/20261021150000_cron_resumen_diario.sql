-- ============================================================================
-- 20261021150000_cron_resumen_diario.sql
-- Resumen diario proactivo de Ben: una vez al día a las 7:00am Guatemala
-- (13:00 UTC, zona fija sin horario de verano), llama a seguimiento-ia-cron
-- con body {"modo":"resumen_diario"} para que tome la rama de
-- procesarResumenDiario() en vez del procesamiento normal de cada 15 min.
--
-- Mismo secreto de Vault ya usado por seguimiento_ia_cron (confirmado real
-- y funcionando el 2026-10-21, no solo asumido).
-- ============================================================================

select cron.schedule(
  'seguimiento_ia_resumen_diario',
  '0 13 * * *',
  $$
  select net.http_post(
    url := 'https://ymvrddvckmwiajcqaled.supabase.co/functions/v1/seguimiento-ia-cron',
    headers := jsonb_build_object(
      'x-notificacion-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'whatsapp_function_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{"modo":"resumen_diario"}'::jsonb
  );
  $$
);
