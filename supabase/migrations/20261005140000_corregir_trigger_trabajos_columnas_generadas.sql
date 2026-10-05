-- Corrige restringir_update_trabajos_publicacion: las columnas generadas (p. ej.
-- publication_key) se calculan después de los triggers BEFORE, así que NEW las
-- ve distintas de OLD. No las puede escribir un usuario, por lo que se excluyen
-- de la comparación.
create or replace function public.restringir_update_trabajos_publicacion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_cols text[] := array['estado','aprobado_en','codigo_error','mensaje_error','completado_en','actualizado_en'];
  v_gen  text[];
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if es_administrador() then
    return new;
  end if;

  select coalesce(array_agg(attname::text), '{}') into v_gen
  from pg_attribute
  where attrelid = 'public.trabajos_publicacion'::regclass
    and attnum > 0 and not attisdropped and attgenerated <> '';
  v_cols := v_cols || v_gen;

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
