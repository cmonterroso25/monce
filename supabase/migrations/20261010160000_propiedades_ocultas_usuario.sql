-- ============================================================================
-- 20261010160000_propiedades_ocultas_usuario.sql
-- Tabla para rastrear qué propiedades cada usuario ha ocultado en "Mis Publicaciones"
-- ============================================================================

drop table if exists propiedades_ocultas_usuario cascade;

create table propiedades_ocultas_usuario (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references perfiles(id) on delete cascade,
  propiedad_id uuid not null references propiedades(id) on delete cascade,
  oculta_en timestamptz default now(),

  unique(usuario_id, propiedad_id)
);

-- Índices para búsquedas rápidas
create index idx_propiedades_ocultas_usuario_usuario_id on propiedades_ocultas_usuario(usuario_id);
create index idx_propiedades_ocultas_usuario_propiedad_id on propiedades_ocultas_usuario(propiedad_id);

-- RLS: cada usuario solo ve y gestiona sus propias propiedades ocultas
alter table propiedades_ocultas_usuario enable row level security;

create policy "Usuario ve sus propias propiedades ocultas"
on propiedades_ocultas_usuario
for select
using (usuario_id = auth.uid());

create policy "Usuario oculta sus propias propiedades"
on propiedades_ocultas_usuario
for insert
with check (usuario_id = auth.uid());

create policy "Usuario muestra sus propias propiedades"
on propiedades_ocultas_usuario
for delete
using (usuario_id = auth.uid());
