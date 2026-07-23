select cron.schedule(
  'marcar_informes_atascados',
  '*/5 * * * *',
  $$
    update informes_evaluacion
    set estado = 'error', error_mensaje = 'Tiempo de espera agotado.'
    where estado = 'procesando'
      and creado_en < now() - interval '15 minutes'
  $$
);
