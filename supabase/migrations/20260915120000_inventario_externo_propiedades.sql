-- =====================================================================
-- Migración: Inventario paralelo de propiedades externas (scraping)
-- =====================================================================
-- Contexto: propiedades de terceros (venta o renta) en San José Pinula,
-- Fraijanes y Carretera a El Salvador, extraídas de portales inmobiliarios
-- externos (Encuentra24, CityMax, Mapainmueble, BienesOnline, Mappi, etc.)
-- para prospección/captación — NO para inteligencia de mercado / CMA.
--
-- Diseño clave:
--   - `propiedades_externas` es GLOBAL (sin organization_id): la misma
--     casa en renta es la misma casa sin importar qué organización la
--     esté consultando; evita duplicar el scraping por tenant.
--   - `coincidencias_propiedad_externa` SÍ es por organización, porque
--     depende de los contactos de cada organización.
--   - El motor de matching debe considerar solo contactos con
--     tipo_contacto IN ('comprador','inquilino') — son quienes buscan
--     propiedad; 'vendedor'/'propietario' son oferta, no demanda.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabla: propiedades_externas
-- ---------------------------------------------------------------------
create table public.propiedades_externas (
    id                      uuid primary key default gen_random_uuid(),

    -- Origen del dato
    fuente_portal           text not null,               -- 'encuentra24' | 'citymax' | 'mapainmueble' | 'bienesonline' | 'mappi' | ...
    fuente_id               text,                         -- ID del anuncio en el portal origen (si existe)
    fuente_url              text not null,

    -- Clasificación
    tipo_operacion          text not null check (tipo_operacion in ('venta', 'renta')),
    tipo_propiedad          text not null check (tipo_propiedad in (
                                'casa', 'apartamento', 'terreno', 'bodega', 'ofibodega',
                                'oficina', 'finca', 'granja', 'local'
                             )),

    -- Datos del anuncio
    titulo                  text not null,
    precio                  numeric,
    moneda                  text,                         -- 'GTQ' | 'USD'
    precio_anterior         numeric,                      -- para trackear cambios detectados entre corridas

    -- Ubicación (zona de interés: San José Pinula, Fraijanes, Carretera a El Salvador)
    zona_municipio          text not null,
    condominio_sector       text,
    direccion_aprox         text,

    -- Características (nullable porque no todos los tipos aplican: un terreno no tiene baños)
    dormitorios             text,
    banos                   text,
    parqueos                int4,
    area_construccion_m2    numeric,
    area_terreno_m2         numeric,
    atributos_extra         jsonb not null default '{}'::jsonb,  -- amueblada, mascotas, mantenimiento,
                                                                    -- altura de nave, amenidades, etc.
                                                                    -- (varía según tipo_propiedad)

    -- Anunciante
    anunciante_nombre       text,
    anunciante_contacto     text,

    -- Estado de la publicación en el portal origen
    estado_publicacion      text not null default 'activo'
                             check (estado_publicacion in ('activo', 'posible_baja', 'eliminado')),

    -- Seguimiento interno del CRM (lo edita el agente, no el scraper)
    estado_seguimiento      text not null default 'sin_contactar'
                             check (estado_seguimiento in ('sin_contactar', 'descartado', 'nuevo_colega')),
    notas_agente            text,
    agente_que_contacto     uuid references public.perfiles(id),
    colega_id               uuid references public.colegas(id),  -- se llena cuando estado_seguimiento = 'nuevo_colega'

    -- Deduplicación entre portales (mismo inmueble publicado en varios sitios)
    hash_duplicado          text,                         -- hash normalizado: zona + m2 + tipo + rango de precio

    -- Control de scraping
    primera_deteccion       timestamptz not null default now(),
    ultima_actualizacion    timestamptz not null default now(),
    creado_en               timestamptz not null default now()
);

comment on table public.propiedades_externas is
    'Inventario paralelo de propiedades de terceros (scraping de portales inmobiliarios) para prospección/captación. Tabla global, no ligada a organization_id.';

comment on column public.propiedades_externas.estado_seguimiento is
    'sin_contactar: default, recién detectada o sin acción. descartado: no relevante o ya no disponible. nuevo_colega: el anunciante resultó ser una agencia/agente y se registró en colegas.';

create index idx_propiedades_externas_zona on public.propiedades_externas (zona_municipio);
create index idx_propiedades_externas_tipo_operacion on public.propiedades_externas (tipo_operacion, tipo_propiedad);
create index idx_propiedades_externas_estado_seguimiento on public.propiedades_externas (estado_seguimiento);
create index idx_propiedades_externas_hash_duplicado on public.propiedades_externas (hash_duplicado);
create unique index idx_propiedades_externas_fuente_unica on public.propiedades_externas (fuente_portal, fuente_id)
    where fuente_id is not null;

-- ---------------------------------------------------------------------
-- Tabla: coincidencias_propiedad_externa
-- ---------------------------------------------------------------------
create table public.coincidencias_propiedad_externa (
    id                      uuid primary key default gen_random_uuid(),
    organization_id         uuid not null references public.organizaciones(id),
    contacto_id             uuid references public.contactos(id),
    propiedad_externa_id    uuid references public.propiedades_externas(id),
    puntaje_coincidencia    numeric,
    notificado              bool default false,
    creado_en               timestamptz not null default now()
);

comment on table public.coincidencias_propiedad_externa is
    'Igual que coincidencias_propiedad, pero contra el inventario externo (propiedades_externas) en vez del inventario propio de la organización.';

create index idx_coincidencias_externas_contacto on public.coincidencias_propiedad_externa (contacto_id);
create index idx_coincidencias_externas_propiedad on public.coincidencias_propiedad_externa (propiedad_externa_id);
create index idx_coincidencias_externas_org on public.coincidencias_propiedad_externa (organization_id);

-- =====================================================================
-- RLS
-- =====================================================================

alter table public.propiedades_externas enable row level security;
alter table public.coincidencias_propiedad_externa enable row level security;

-- --- propiedades_externas: dato global, visible para cualquier agente autenticado ---

create policy "Agentes autenticados ven propiedades externas"
    on public.propiedades_externas
    for select
    to authenticated
    using (true);

-- Solo el pipeline de scraping (service_role) inserta/borra masivamente.
-- service_role ya bypassa RLS por defecto en Supabase, no se necesita policy para eso.

-- Los agentes SÍ pueden actualizar el registro (para marcar seguimiento, notas, colega vinculado).
-- Nota: RLS de Postgres es a nivel de fila, no de columna — la UI del CRM debe limitar
-- qué campos expone al agente (estado_seguimiento, notas_agente, colega_id, agente_que_contacto),
-- para que no edite accidentalmente los datos crudos del scraping.
create policy "Agentes autenticados actualizan seguimiento de propiedades externas"
    on public.propiedades_externas
    for update
    to authenticated
    using (true)
    with check (true);

-- Solo el propietario de la plataforma puede borrar manualmente (limpieza de datos).
create policy "Propietario de plataforma elimina propiedades externas"
    on public.propiedades_externas
    for delete
    to authenticated
    using (es_propietario_plataforma());

-- --- coincidencias_propiedad_externa: mismo patrón que coincidencias_propiedad ---

create policy "Agente ve coincidencias externas de sus contactos"
    on public.coincidencias_propiedad_externa
    for select
    to authenticated
    using (
        puede_ver_organizacion(organization_id)
        and exists (
            select 1 from public.contactos
            where contactos.id = coincidencias_propiedad_externa.contacto_id
              and (contactos.agente_asignado = auth.uid() or es_administrador())
        )
    );

create policy "Sistema o admin gestiona coincidencias externas"
    on public.coincidencias_propiedad_externa
    for all
    to authenticated
    using (
        puede_ver_organizacion(organization_id)
        and exists (
            select 1 from public.contactos
            where contactos.id = coincidencias_propiedad_externa.contacto_id
              and (contactos.agente_asignado = auth.uid() or es_administrador())
        )
    )
    with check (
        puede_ver_organizacion(organization_id)
        and exists (
            select 1 from public.contactos
            where contactos.id = coincidencias_propiedad_externa.contacto_id
              and (contactos.agente_asignado = auth.uid() or es_administrador())
        )
    );

-- =====================================================================
-- Grants
-- =====================================================================
grant select on public.propiedades_externas to authenticated;
grant update on public.propiedades_externas to authenticated;
grant select, insert, update, delete on public.propiedades_externas to service_role;

grant select, insert, update, delete on public.coincidencias_propiedad_externa to authenticated;
grant select, insert, update, delete on public.coincidencias_propiedad_externa to service_role;
