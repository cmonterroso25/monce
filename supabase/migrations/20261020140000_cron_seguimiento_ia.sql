-- ============================================================================
-- 20261020140000_cron_seguimiento_ia.sql
-- Cron del agente de seguimiento IA (seguimiento-ia-cron), cada 15 min.
--
-- Se crea DESACTIVADO (active := false) a propósito: antes de que empiece a
-- escribirle a asesores reales y mover leads solo, hay que probar manualmente
-- el flujo completo (ver plan en /Users/carlos/.claude/plans/validated-exploring-pancake.md,
-- sección "Verificación end-to-end"). Para activarlo una vez probado:
--   select cron.alter_job((select jobid from cron.job where jobname = 'seguimiento_ia_cron'), active := true);
-- ============================================================================

select cron.schedule(
  'seguimiento_ia_cron',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://ymvrddvckmwiajcqaled.supabase.co/functions/v1/seguimiento-ia-cron',
    headers := jsonb_build_object(
      'x-notificacion-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'whatsapp_function_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.alter_job((select jobid from cron.job where jobname = 'seguimiento_ia_cron'), active := false);
