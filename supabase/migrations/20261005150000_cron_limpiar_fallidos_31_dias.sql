-- 24 h visible + 30 días oculto = se borra a los 31 días de la última actualización.
select cron.unschedule(jobid) from cron.job where jobname = 'limpiar-trabajos-publicacion-fallidos';

select cron.schedule(
  'limpiar-trabajos-publicacion-fallidos',
  '15 8 * * *',
  $$
  delete from public.trabajos_publicacion
  where estado in ('VALIDATION_ERROR','ADAPTER_MISMATCH','APPROVAL_EXPIRED','CANCELLED','FAILED')
    and actualizado_en < now() - interval '31 days'
  $$
);
