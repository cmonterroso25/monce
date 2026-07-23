-- ============================================================================
-- 0004_triggers.sql
-- Triggers de negocio (distintos al event trigger de RLS automática, que
-- vive en 0001).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- crear_perfil_nuevo_usuario()
-- Se dispara AFTER INSERT ON auth.users y crea automáticamente el registro
-- correspondiente en public.perfiles con rol 'agente' por defecto.
--
-- SECURITY DEFINER confirmado en producción (pg_proc.prosecdef = true):
-- necesario porque, sin esto, el INSERT hacia public.perfiles sería
-- bloqueado por las políticas RLS de esa tabla al ejecutarse en el
-- contexto de creación del usuario.
-- ----------------------------------------------------------------------------
create or replace function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (id, nombre_completo, rol, organization_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre_completo', 'Sin nombre'),
    'agente',
    organizacion_por_defecto()
  );
  return new;
end;
$$;

drop trigger if exists al_crear_usuario on auth.users;
create trigger al_crear_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_nuevo_usuario();

-- ----------------------------------------------------------------------------
-- generar_codigo_propiedad()
-- Se dispara BEFORE INSERT ON propiedades. Si no se envía un código
-- explícito, genera uno correlativo por organización usando la tabla
-- contadores (tipo = 'propiedad'), con formato PROP-0001, PROP-0002, etc.
--
-- SECURITY DEFINER confirmado en producción: explica además por qué la
-- tabla "contadores" solo tiene una política RLS de SELECT y ninguna de
-- INSERT/UPDATE (ver 0005_rls_policies.sql) — el UPSERT que hace esta
-- función hacia "contadores" se salta RLS por completo gracias a esta
-- cláusula; si no fuera SECURITY DEFINER, cualquier INSERT de una
-- propiedad fallaría al intentar el upsert en contadores sin política que
-- lo permita.
-- ----------------------------------------------------------------------------
create or replace function public.generar_codigo_propiedad()
returns trigger
language plpgsql
security definer
as $$
declare
  nuevo_valor integer;
begin
  if new.codigo is null then
    insert into contadores (organization_id, tipo, valor)
    values (new.organization_id, 'propiedad', 1)
    on conflict (organization_id, tipo)
    do update set valor = contadores.valor + 1
    returning valor into nuevo_valor;

    new.codigo := 'PROP-' || lpad(nuevo_valor::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_generar_codigo_propiedad on propiedades;
create trigger trg_generar_codigo_propiedad
  before insert on propiedades
  for each row execute function public.generar_codigo_propiedad();
