-- Nuevo tipo de evento: un administrador libera una propiedad bloqueada por un envío PUBLICADO/NEEDS_REVIEW.
alter table public.logs_publicacion drop constraint if exists logs_publicacion_tipo_evento_check;
alter table public.logs_publicacion add constraint logs_publicacion_tipo_evento_check
  check (tipo_evento = any (array[
    'SOLICITUD_CREATED','SUBJOB_CREATED','JOB_CREATED','VALIDATION_PASSED','VALIDATION_FAILED',
    'CONTENT_READY','ASSETS_READY','QUEUE_ENQUEUED','WORKER_CLAIMED','SESSION_OPENED',
    'MARKETPLACE_OPENED','CATEGORY_SELECTED','FORM_FILLED','PHOTOS_UPLOADED','EVIDENCE_CAPTURED',
    'WAITING_APPROVAL','APPROVED','PUBLISH_CLICKED','PUBLICATION_VERIFIED','FAILED',
    'HUMAN_INTERVENTION_REQUIRED','CIRCUIT_PAUSED','LISTING_RELEASED'
  ]::text[]));

-- Las fotos de trabajos ya PUBLICADO se subieron a Facebook pero quedaron en PENDING.
update public.activos_publicacion
set estado = 'UPLOADED'
where tipo_activo = 'photo'
  and estado = 'PENDING'
  and trabajo_id in (select id from public.trabajos_publicacion where estado = 'PUBLICADO');
