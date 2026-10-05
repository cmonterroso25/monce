-- Un usuario no administrador solo puede pasar un envío de WAITING_APPROVAL a
-- APPROVED o CANCELLED (y solo tocar los campos de aprobación/cancelación).
-- service_role, el Worker y las funciones security definer no se ven afectados.
create or replace function public.restringir_update_trabajos_publicacion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_cols text[] := array['estado','aprobado_en','codigo_error','mensaje_error','completado_en','actualizado_en'];
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if es_administrador() then
    return new;
  end if;

  if old.estado <> 'WAITING_APPROVAL' or new.estado not in ('APPROVED','CANCELLED') then
    raise exception 'Transición de estado no permitida (% -> %)', old.estado, new.estado
      using errcode = '42501';
  end if;

  if (to_jsonb(new) - v_cols) is distinct from (to_jsonb(old) - v_cols) then
    raise exception 'Solo se pueden modificar los campos de aprobación o cancelación'
      using errcode = '42501';
  end if;

  if new.estado = 'APPROVED' then
    if old.expira_en is null or old.expira_en <= now() then
      raise exception 'La aprobación venció' using errcode = '42501';
    end if;
    if new.codigo_error is distinct from old.codigo_error
       or new.mensaje_error is distinct from old.mensaje_error
       or new.completado_en is distinct from old.completado_en then
      raise exception 'Una aprobación no puede modificar campos de error' using errcode = '42501';
    end if;
  else
    if new.aprobado_en is distinct from old.aprobado_en then
      raise exception 'Una cancelación no puede modificar aprobado_en' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_restringir_update_trabajos_publicacion on public.trabajos_publicacion;
create trigger trg_restringir_update_trabajos_publicacion
  before update on public.trabajos_publicacion
  for each row execute function public.restringir_update_trabajos_publicacion();
