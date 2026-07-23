-- ============================================================================
-- 0003_tablas_negocio.sql
-- Tablas de negocio: contactos, propiedades, imagenes_propiedad, leads,
-- actividades, tareas, coincidencias_propiedad, documentos,
-- notificaciones_whatsapp.
--
-- Orden importante: contactos debe crearse antes que propiedades porque
-- propiedades.contacto_propietario referencia contactos(id).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- contactos
-- ----------------------------------------------------------------------------
create table if not exists contactos (
  id                      uuid primary key default gen_random_uuid(),
  nombre_completo         text not null,
  correo                  text,
  telefono                text,
  tipo_contacto           text default 'lead'
                            check (tipo_contacto = any (array[
                              'lead','comprador','vendedor','inquilino','propietario'
                            ])),
  origen                  text,
  estado                  text default 'nuevo'
                            check (estado = any (array[
                              'nuevo','contactado','calificado','negociando','ganado','perdido'
                            ])),
  presupuesto_min         numeric,
  presupuesto_max         numeric,
  zonas_interes           text[],
  agente_asignado         uuid references perfiles(id),
  puntaje_lead            integer default 0,
  creado_en               timestamptz default now(),
  actualizado_en          timestamptz default now(),
  organization_id         uuid not null default organizacion_por_defecto()
                            references organizaciones(id),

  -- Agregado en sesión 9 (ALTER TABLE original). Aquí queda ya integrado
  -- como parte del baseline en vez de como ALTER separado.
  tipo_propiedad_interes  text
);

-- ----------------------------------------------------------------------------
-- propiedades
-- ----------------------------------------------------------------------------
create table if not exists propiedades (
  id                     uuid primary key default gen_random_uuid(),
  titulo                 text not null,
  tipo_operacion         text
                           check (tipo_operacion = any (array['venta','renta'])),

  -- CHECK agregado a petición explícita (sesión de hoy): antes solo se
  -- validaba en el frontend vía src/lib/tipos-propiedad.ts. Si agregas un
  -- 9no tipo en el futuro, hay que actualizar este CHECK además del
  -- catálogo del frontend.
  tipo_propiedad         text
                           check (tipo_propiedad = any (array[
                             'casa','apartamento','terreno','bodega',
                             'oficina','ofibodega','finca','granja'
                           ])),

  -- 'inactiva' agregado a petición explícita (sesión de hoy). El plan
  -- original la mencionaba pero no existía en el CHECK real.
  estado                 text default 'disponible'
                           check (estado = any (array[
                             'disponible','reservada','vendida','rentada','inactiva'
                           ])),

  precio                 numeric,
  moneda                 text default 'GTQ',
  direccion              text,
  zona                   text,
  ciudad                 text,
  dormitorios            integer,
  banos                  numeric,

  -- Columna huérfana: ya no se usa en los formularios (se usan
  -- area_construccion_m2 / area_terreno_m2). Se conserva en el baseline
  -- porque así existe en producción; pendiente decidir si se elimina
  -- (documentado en RESUMEN_SESION_9.md).
  area_m2                numeric,

  contacto_propietario   uuid references contactos(id),
  descripcion            text,
  creado_en              timestamptz default now(),
  organization_id        uuid not null default organizacion_por_defecto()
                           references organizaciones(id),
  slug                   text unique,
  codigo                 text,
  municipio_id           uuid references municipios(id),
  sector                 text,
  condominio             text,
  numero_casa            text,
  niveles                integer,
  sala                   text,
  comedor                text,
  cocina                 text,
  estudio                text,
  sala_familiar          text,
  habitacion_servicio    text,
  lavanderia             text,
  jardin                 text,
  parqueos               integer,
  extras                 text,
  area_construccion_m2   numeric,
  medidas_terreno        text,
  area_terreno_m2        numeric,
  mantenimiento          numeric,
  iusi                   numeric,
  hipoteca               text
                           check (hipoteca = any (array['Si','No'])),
  mascota                text,
  acceso                 text,
  modalidad_captacion    text
                           check (modalidad_captacion = any (array['Directo','Compartida'])),
  colega_id              uuid references colegas(id),
  captado_por            uuid references perfiles(id),
  comision               numeric,
  comentarios            text,
  valor_hipoteca         numeric,
  propietario_nombre     text
);

create unique index if not exists idx_propiedades_codigo_org
  on propiedades (organization_id, codigo);

-- ----------------------------------------------------------------------------
-- imagenes_propiedad
-- ----------------------------------------------------------------------------
create table if not exists imagenes_propiedad (
  id                     uuid primary key default gen_random_uuid(),
  propiedad_id           uuid references propiedades(id),
  ruta_almacenamiento    text not null,
  es_portada             boolean default false,
  orden                  integer,
  organization_id        uuid not null default organizacion_por_defecto()
                           references organizaciones(id)
);

-- ----------------------------------------------------------------------------
-- leads
-- Nota: los nombres reales de constraint/índice en producción usan el
-- prefijo "negocios_" (negocios_pkey, negocios_etapa_check), rastro de que
-- la tabla se llamó "negocios" antes de renombrarse a "leads". Se preservan
-- esos nombres tal cual para que el baseline coincida 1:1 con producción.
-- ----------------------------------------------------------------------------
create table if not exists leads (
  id                      uuid primary key default gen_random_uuid(),
  contacto_id             uuid references contactos(id),
  propiedad_id            uuid references propiedades(id),
  agente_id               uuid references perfiles(id),
  etapa                   text default 'contacto_inicial'
                            constraint negocios_etapa_check
                            check (etapa = any (array[
                              'contacto_inicial','visita_agendada','visita_realizada',
                              'reservada','ganada','perdida'
                            ])),
  valor_negocio           numeric,
  probabilidad            integer,
  fecha_cierre_esperada   date,
  motivo_perdida          text,
  creado_en               timestamptz default now(),
  actualizado_en          timestamptz default now(),
  organization_id         uuid not null default organizacion_por_defecto()
                            references organizaciones(id)
);

alter table leads rename constraint leads_pkey to negocios_pkey;

-- ----------------------------------------------------------------------------
-- actividades
-- ----------------------------------------------------------------------------
create table if not exists actividades (
  id                uuid primary key default gen_random_uuid(),
  contacto_id       uuid references contactos(id),
  lead_id           uuid references leads(id),
  agente_id         uuid references perfiles(id),
  tipo_actividad    text,
  notas             text,
  programada_en     timestamptz,
  completada_en     timestamptz,
  creado_en         timestamptz default now(),
  organization_id   uuid not null default organizacion_por_defecto()
                      references organizaciones(id)
);

-- ----------------------------------------------------------------------------
-- tareas
-- ----------------------------------------------------------------------------
create table if not exists tareas (
  id                uuid primary key default gen_random_uuid(),
  asignado_a        uuid references perfiles(id),
  contacto_id       uuid references contactos(id),
  lead_id           uuid references leads(id),
  titulo            text not null,
  fecha_limite      timestamptz,
  estado            text default 'pendiente'
                      check (estado = any (array['pendiente','completada','vencida'])),
  prioridad         text default 'media'
                      check (prioridad = any (array['baja','media','alta'])),
  organization_id   uuid not null default organizacion_por_defecto()
                      references organizaciones(id)
);

-- ----------------------------------------------------------------------------
-- coincidencias_propiedad
-- ----------------------------------------------------------------------------
create table if not exists coincidencias_propiedad (
  id                     uuid primary key default gen_random_uuid(),
  contacto_id            uuid references contactos(id),
  propiedad_id           uuid references propiedades(id),
  puntaje_coincidencia   numeric,
  notificado             boolean default false,
  organization_id        uuid not null default organizacion_por_defecto()
                           references organizaciones(id)
);

-- ----------------------------------------------------------------------------
-- documentos
-- ----------------------------------------------------------------------------
create table if not exists documentos (
  id                     uuid primary key default gen_random_uuid(),
  tipo_relacionado       text
                           check (tipo_relacionado = any (array['contacto','propiedad','negocio'])),
  id_relacionado         uuid,
  ruta_almacenamiento    text not null,
  tipo_documento         text,
  organization_id        uuid not null default organizacion_por_defecto()
                           references organizaciones(id)
);

-- ----------------------------------------------------------------------------
-- notificaciones_whatsapp
-- Nota: a diferencia del resto de tablas, organization_id AQUÍ NO tiene
-- default organizacion_por_defecto() en producción (columna NOT NULL sin
-- default). Se replica tal cual: quien inserte debe enviar organization_id
-- explícitamente.
-- ----------------------------------------------------------------------------
create table if not exists notificaciones_whatsapp (
  id                 uuid primary key default gen_random_uuid(),
  actividad_id       uuid references actividades(id),
  contacto_id        uuid references contactos(id),
  telefono           text,
  mensaje            text not null,
  programado_para    timestamptz not null,
  enviado            boolean default false,
  enviado_en         timestamptz,
  creado_en          timestamptz default now(),
  organization_id    uuid not null references organizaciones(id)
);
