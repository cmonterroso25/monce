-- Corrige reclamar_trabajo_publicacion (FOR UPDATE sobre el lado nulo de un
-- left join no es válido en Postgres) y restringe ambas RPC a service_role.

create or replace function reclamar_trabajo_publicacion(
  p_worker_id uuid,
  p_canales_soportados text[] default null
)
returns trabajos_publicacion
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
  v_cuenta_id uuid;
  v_cuenta_tomada uuid;
  v_job trabajos_publicacion;
begin
  -- Solo se bloquea la fila del subjob. La cuenta se toma abajo con un
  -- UPDATE condicionado a estado = 'READY' (atómico entre workers).
  select tp.id, tp.cuenta_social_id
  into v_job_id, v_cuenta_id
  from trabajos_publicacion tp
  join canales_publicacion c on c.id = tp.canal_id
  where tp.estado = 'QUEUED'
    and (p_canales_soportados is null or c.codigo = any(p_canales_soportados))
    and (
      tp.cuenta_social_id is null
      or exists (
        select 1 from cuentas_sociales cs
        where cs.id = tp.cuenta_social_id and cs.estado = 'READY'
      )
    )
    and not exists (
      select 1 from circuito_publicacion cb
      where cb.organization_id = tp.organization_id
        and cb.canal_id = tp.canal_id
        and cb.pausado = true
    )
  order by tp.prioridad desc, tp.encolado_en asc
  for update of tp skip locked
  limit 1;

  if v_job_id is null then
    return null;
  end if;

  if v_cuenta_id is not null then
    update cuentas_sociales
    set estado = 'BUSY', usada_en = now()
    where id = v_cuenta_id and estado = 'READY'
    returning id into v_cuenta_tomada;

    -- Otro worker tomó la cuenta entre la selección y el update:
    -- no se cambia nada; el Worker vuelve a consultar en su siguiente ciclo.
    if v_cuenta_tomada is null then
      return null;
    end if;
  end if;

  update trabajos_publicacion
  set estado = 'PUBLICANDO', worker_id = p_worker_id, iniciado_en = now()
  where id = v_job_id
  returning * into v_job;

  insert into logs_publicacion (trabajo_id, tipo_evento, detalle)
  values (v_job.id, 'WORKER_CLAIMED',
          jsonb_build_object('worker_id', p_worker_id, 'cuenta_social_id', v_cuenta_id));

  return v_job;
end;
$$;

alter function liberar_cuenta_publicacion(uuid) set search_path = public;

revoke execute on function reclamar_trabajo_publicacion(uuid, text[]) from public, anon, authenticated;
grant  execute on function reclamar_trabajo_publicacion(uuid, text[]) to service_role;

revoke execute on function liberar_cuenta_publicacion(uuid) from public, anon, authenticated;
grant  execute on function liberar_cuenta_publicacion(uuid) to service_role;
