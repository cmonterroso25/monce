-- §25: el Worker debe poder reportar ADAPTER_MISMATCH (falta un campo
-- conocido) y NEEDS_REVIEW (aparecen campos nuevos).
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'trabajos_publicacion'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%PUBLICANDO%'
  loop
    execute format('alter table trabajos_publicacion drop constraint %I', r.conname);
  end loop;
end $$;

alter table trabajos_publicacion
  add constraint trabajos_publicacion_estado_check check (estado in (
    'PENDIENTE','VALIDANDO','PREPARANDO','CONTENIDO_LISTO','ASSETS_LISTOS',
    'LISTO_MARKETPLACE','QUEUED','PUBLICANDO','WAITING_APPROVAL','APPROVED',
    'VERIFICANDO','PUBLICADO',
    'VALIDATION_ERROR','RETRY_WAITING','AUTH_REQUIRED',
    'HUMAN_INTERVENTION_REQUIRED','APPROVAL_EXPIRED','CANCELLED','FAILED',
    'ADAPTER_MISMATCH','NEEDS_REVIEW'
  ));

create or replace function actualizar_estado_solicitud_publicacion()
returns trigger
language plpgsql
as $$
declare
  v_total int;
  v_publicados int;
  v_fallidos int;
  v_pendientes int;
  v_nuevo_estado text;
begin
  select
    count(*),
    count(*) filter (where estado = 'PUBLICADO'),
    count(*) filter (where estado in ('FAILED','VALIDATION_ERROR','HUMAN_INTERVENTION_REQUIRED','APPROVAL_EXPIRED','ADAPTER_MISMATCH')),
    count(*) filter (where estado not in ('PUBLICADO','FAILED','VALIDATION_ERROR','HUMAN_INTERVENTION_REQUIRED','APPROVAL_EXPIRED','ADAPTER_MISMATCH','CANCELLED'))
  into v_total, v_publicados, v_fallidos, v_pendientes
  from trabajos_publicacion
  where solicitud_id = new.solicitud_id;

  if v_pendientes > 0 then
    v_nuevo_estado := 'EN_PROCESO';
  elsif v_publicados = v_total and v_total > 0 then
    v_nuevo_estado := 'PUBLICADA';
  elsif v_publicados > 0 and v_fallidos > 0 then
    v_nuevo_estado := 'PARCIALMENTE_PUBLICADA';
  elsif v_fallidos = v_total and v_total > 0 then
    v_nuevo_estado := 'CON_ERRORES';
  else
    v_nuevo_estado := 'EN_PROCESO';
  end if;

  update solicitudes_publicacion
  set estado = v_nuevo_estado
  where id = new.solicitud_id and estado is distinct from v_nuevo_estado;

  return new;
end;
$$;
