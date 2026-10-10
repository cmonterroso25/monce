-- ============================================================================
-- 20261010120000_comentarios_actividad.sql
-- Tabla para almacenar seguimientos/comentarios en actividades (citas)
-- ============================================================================

create table if not exists comentarios_actividad (
  id                uuid primary key default gen_random_uuid(),
  actividad_id      uuid not null references actividades(id) on delete cascade,
  creado_por        uuid not null references perfiles(id),
  contenido         text not null,
  creado_en         timestamptz default now(),
  organization_id   uuid not null default organizacion_por_defecto()
                      references organizaciones(id)
);

-- Índice para búsquedas por actividad
create index idx_comentarios_actividad_actividad_id on comentarios_actividad(actividad_id);

-- Índice para búsquedas por organización
create index idx_comentarios_actividad_organization_id on comentarios_actividad(organization_id);

-- RLS: Solo administradores y el creador del comentario pueden ver comentarios
alter table comentarios_actividad enable row level security;

create policy "Administradores y creador ven comentarios"
on comentarios_actividad
for select
using (
  es_administrador()
  or creado_por = auth.uid()
);

create policy "Administradores y creador crean comentarios"
on comentarios_actividad
for insert
with check (
  (es_administrador() or true)
  and creado_por = auth.uid()
);

create policy "Administrador actualiza comentarios"
on comentarios_actividad
for update
using (es_administrador())
with check (es_administrador());

create policy "Administrador elimina comentarios"
on comentarios_actividad
for delete
using (es_administrador());
