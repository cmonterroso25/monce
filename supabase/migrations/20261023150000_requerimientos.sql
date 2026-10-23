-- ============================================================================
-- 20261023150000_requerimientos.sql
-- Nuevo módulo "Requerimientos": qué está buscando un contacto en una
-- propiedad (sector, precio, distribución de ambientes, amenidades,
-- características específicas). Un contacto puede tener varios
-- requerimientos (ej. hoy busca para rentar, luego para comprar) sin
-- perder el historial — por eso es tabla aparte y no más columnas en
-- contactos (que ya tiene presupuesto_min/max, zonas_interes,
-- tipo_propiedad_interes, pero un solo valor por campo).
-- ============================================================================

create table requerimientos (
  id                       uuid primary key default gen_random_uuid(),
  contacto_id              uuid not null references contactos(id) on delete cascade,
  organization_id          uuid not null default organizacion_por_defecto() references organizaciones(id),
  tipo_operacion           text check (tipo_operacion in ('venta','renta')),
  tipo_propiedad           text check (tipo_propiedad = any (array[
                              'casa','apartamento','terreno','bodega',
                              'oficina','ofibodega','finca','granja',
                              'local','edificio'
                            ])),
  precio_min               numeric,
  precio_max               numeric,
  moneda                   text default 'GTQ',
  zona                     text,
  sector                   text,
  municipio_id             uuid references municipios(id),
  dormitorios_min          integer,
  banos_min                numeric,
  niveles_min              integer,
  parqueos_min             integer,
  area_min                 numeric,
  -- Checkboxes elegidos en el formulario (ej. {mascotas,closets,pergola,
  -- parqueo_techado,piscina}); ver constantes.ts del módulo para el catálogo.
  caracteristicas_deseadas text[],
  otras_caracteristicas    text,
  notas                    text,
  creado_por               uuid not null references perfiles(id),
  creado_en                timestamptz not null default now(),
  actualizado_en           timestamptz not null default now()
);

create index idx_requerimientos_contacto on requerimientos (contacto_id);
create index idx_requerimientos_org on requerimientos (organization_id);

-- Sin trigger de actualizado_en: igual que contactos/tareas, se actualiza
-- explícitamente en código (acciones.ts) cuando corresponde, no en cada UPDATE.
alter table requerimientos enable row level security;

-- Mismo criterio que coincidencias_propiedad: el acceso se filtra por el
-- agente_asignado del contacto relacionado (requerimientos no tiene su
-- propio "dueño", pertenece al contacto).
create policy "Agente ve requerimientos de sus contactos, admin ve todos"
  on requerimientos for select to authenticated
  using (
    (organization_id = mi_organization_id())
    and exists (
      select 1 from contactos
      where contactos.id = requerimientos.contacto_id
        and ((contactos.agente_asignado = auth.uid()) or es_administrador())
    )
  );

create policy "Agente crea requerimientos para sus contactos, admin para todos"
  on requerimientos for insert to authenticated
  with check (
    (organization_id = mi_organization_id())
    and exists (
      select 1 from contactos
      where contactos.id = requerimientos.contacto_id
        and ((contactos.agente_asignado = auth.uid()) or es_administrador())
    )
  );

create policy "Agente edita requerimientos de sus contactos, admin edita todos"
  on requerimientos for update to authenticated
  using (
    (organization_id = mi_organization_id())
    and exists (
      select 1 from contactos
      where contactos.id = requerimientos.contacto_id
        and ((contactos.agente_asignado = auth.uid()) or es_administrador())
    )
  )
  with check (
    (organization_id = mi_organization_id())
    and exists (
      select 1 from contactos
      where contactos.id = requerimientos.contacto_id
        and ((contactos.agente_asignado = auth.uid()) or es_administrador())
    )
  );

-- Mismo criterio que contactos/tareas: solo admin elimina.
create policy "Admin elimina requerimientos de su organizacion"
  on requerimientos for delete to authenticated
  using ((organization_id = mi_organization_id()) and es_administrador());

grant select, insert, update, delete on requerimientos to authenticated;
