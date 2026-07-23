-- ============================================================================
-- 0002_tablas_core.sql
-- Tablas base: organizaciones, perfiles (usuarios), y catálogos de apoyo
-- (municipios, colegas, contadores).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- organizaciones
-- ----------------------------------------------------------------------------
create table if not exists organizaciones (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  creado_en  timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- organizacion_por_defecto()
-- Devuelve la primera organización existente. Usada como DEFAULT de
-- organization_id en casi todas las tablas mientras el sistema es
-- mono-tenant (una sola inmobiliaria). Se crea aquí, justo después de
-- organizaciones, porque es una función LANGUAGE SQL y Postgres exige que
-- la tabla referenciada ya exista al momento de crearla.
-- ----------------------------------------------------------------------------
create or replace function public.organizacion_por_defecto()
returns uuid
language sql
stable
as $$
  select id from organizaciones limit 1;
$$;

-- ----------------------------------------------------------------------------
-- perfiles
-- id referencia auth.users(id). En la base real esto se ve como una FK sin
-- tabla "propia" listada (perfiles.id -> auth.users.id), consistente con el
-- patrón estándar de Supabase de extender auth.users con una tabla de
-- perfil pública.
-- ----------------------------------------------------------------------------
create table if not exists perfiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  nombre_completo   text not null,
  rol               text not null default 'agente'
                      check (rol = any (array['agente','administrador'])),
  telefono          text,
  activo            boolean default true,
  creado_en         timestamptz default now(),
  organization_id   uuid not null default organizacion_por_defecto()
                      references organizaciones(id)
);

-- ----------------------------------------------------------------------------
-- mi_organization_id()
-- Devuelve el organization_id del perfil del usuario autenticado actual.
-- Pieza central de todas las políticas RLS multi-tenant. Se crea aquí,
-- justo después de perfiles, por la misma razón de LANGUAGE SQL.
--
-- SECURITY DEFINER (confirmado en producción): sin esto, cuando esta
-- función se evalúa dentro de una política RLS de OTRA tabla, la consulta
-- interna a "perfiles" quedaría a su vez sujeta a las políticas RLS de
-- perfiles (que dependen de... mi_organization_id()). Eso genera un ciclo
-- de evaluación innecesario y, en la práctica, resultados incorrectos o
-- vacíos para el propio usuario. SECURITY DEFINER hace que esta consulta
-- interna corra con los privilegios del dueño de la función (bypass de
-- RLS), rompiendo el ciclo.
-- ----------------------------------------------------------------------------
create or replace function public.mi_organization_id()
returns uuid
language sql
security definer
stable
as $$
  select organization_id from perfiles where id = auth.uid();
$$;

-- ----------------------------------------------------------------------------
-- es_administrador()
-- true si el usuario autenticado actual tiene rol 'administrador' en
-- perfiles. Usada en RLS para dar acceso ampliado a admins.
--
-- SECURITY DEFINER (confirmado en producción): mismo motivo que
-- mi_organization_id() — evita quedar atrapada en las políticas RLS de
-- perfiles al ser llamada desde políticas de otras tablas.
-- ----------------------------------------------------------------------------
create or replace function public.es_administrador()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from perfiles
    where id = auth.uid() and rol = 'administrador'
  );
$$;

-- ----------------------------------------------------------------------------
-- municipios (catálogo de ubicaciones, por organización)
-- ----------------------------------------------------------------------------
create table if not exists municipios (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizaciones(id),
  nombre            text not null,
  creado_en         timestamptz not null default now()
);

create unique index if not exists idx_municipios_nombre_org
  on municipios (organization_id, lower(nombre));

-- ----------------------------------------------------------------------------
-- colegas (agentes/inmobiliarias externas para captaciones compartidas)
-- ----------------------------------------------------------------------------
create table if not exists colegas (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizaciones(id),
  nombre            text not null,
  telefono          text,
  inmobiliaria      text,
  creado_en         timestamptz not null default now()
);

create unique index if not exists idx_colegas_nombre_org
  on colegas (organization_id, lower(nombre));

-- ----------------------------------------------------------------------------
-- contadores (folios/códigos correlativos por organización y tipo)
-- ----------------------------------------------------------------------------
create table if not exists contadores (
  organization_id   uuid not null references organizaciones(id),
  tipo              text not null,
  valor             integer not null default 0,
  primary key (organization_id, tipo)
);
