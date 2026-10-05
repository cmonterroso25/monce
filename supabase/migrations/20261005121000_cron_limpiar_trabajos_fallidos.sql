-- Borra a diario (02:15 hora de Guatemala) los envíos en estados terminales
-- fallidos que llevan más de 30 días sin actualizarse. No toca PUBLICADO,
-- NEEDS_REVIEW, estados vivos ni estados intermedios. Contenido, activos,
-- intentos y logs se borran en cascada.
select cron.schedule(
  'limpiar-trabajos-publicacion-fallidos',
  '15 8 * * *',
  $$
  delete from public.trabajos_publicacion
  where estado in ('VALIDATION_ERROR','ADAPTER_MISMATCH','APPROVAL_EXPIRED','CANCELLED','FAILED')
    and actualizado_en < now() - interval '30 days'
  $$
);
