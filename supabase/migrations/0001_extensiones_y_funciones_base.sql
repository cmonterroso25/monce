-- ============================================================================
-- 0001_extensiones_y_funciones_base.sql
-- Baseline reconstruido a partir del schema real en producción (proyecto
-- CRM Inmobiliario). Generado el 2026-07-16 a partir de queries de
-- introspección (information_schema, pg_policies, pg_proc, pg_indexes).
--
-- Este archivo: extensiones necesarias + funciones helper usadas por RLS
-- y por triggers en toda la base.
-- ============================================================================

-- gen_random_uuid() requiere pgcrypto (o puede venir ya habilitada por
-- Supabase vía pgcrypto/uuid-ossp). La incluimos explícitamente para que
-- el baseline sea reproducible en un proyecto nuevo.
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- IMPORTANTE — orden de creación de funciones vs. tablas:
--
-- organizacion_por_defecto(), mi_organization_id() y es_administrador()
-- están escritas en LANGUAGE SQL. A diferencia de plpgsql, las funciones
-- SQL se validan (planifican) contra el catálogo en el momento de crearse,
-- no solo cuando se ejecutan. Esto significa que Postgres exige que las
-- tablas "organizaciones" y "perfiles" YA EXISTAN antes de poder crear
-- estas funciones — de lo contrario falla con "relation does not exist".
--
-- Por eso estas tres funciones NO se crean aquí en 0001 (que corre antes
-- que cualquier tabla), sino en 0002_tablas_core.sql, intercaladas justo
-- después de crear la tabla de la que dependen. rls_auto_enable() sí se
-- queda aquí porque no depende de ninguna tabla de negocio.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- NOTA sobre rls_auto_enable():
-- En la base real existe además una función `rls_auto_enable()` colgada de
-- un EVENT TRIGGER (no capturado por information_schema.triggers, por eso
-- no se incluye su definición completa de disparo en este baseline). Su
-- propósito es forzar `ENABLE ROW LEVEL SECURITY` automáticamente en toda
-- tabla nueva que se cree en el schema public. La replicamos aquí como
-- función y como event trigger para que el comportamiento se mantenga
-- también en instalaciones nuevas (útil sobre todo si en el futuro se
-- automatiza la creación de tablas por migraciones o por una herramienta).
-- Si prefieres NO tener este comportamiento automático (algunos equipos
-- prefieren habilitar RLS explícitamente por migración, tabla por tabla,
-- para evitar sorpresas), puedes comentar el `create event trigger` de
-- abajo sin problema; las tablas de este baseline ya traen RLS habilitado
-- explícitamente en 0005_rls_policies.sql de cualquier forma.
--
-- SECURITY DEFINER confirmado en producción: tiene sentido porque el
-- ALTER TABLE ... ENABLE ROW LEVEL SECURITY que ejecuta debe poder correr
-- sin importar qué usuario/rol haya disparado el CREATE TABLE original.
-- ----------------------------------------------------------------------------
create or replace function public.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
as $$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table','partitioned table')
  loop
     if cmd.schema_name is not null and cmd.schema_name in ('public') and cmd.schema_name not in ('pg_catalog','information_schema') and cmd.schema_name not like 'pg_toast%' and cmd.schema_name not like 'pg_temp%' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      exception
        when others then
          raise log 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      end;
     else
        raise log 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     end if;
  end loop;
end;
$$;

drop event trigger if exists rls_auto_enable_trigger;
create event trigger rls_auto_enable_trigger
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.rls_auto_enable();
