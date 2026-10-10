-- ============================================================================
-- 20261010150000_propiedades_oculta.sql
-- Agregar campo para ocultar propiedades en "Mis Publicaciones"
-- ============================================================================

alter table propiedades add column if not exists oculta_en_publicaciones boolean default false;

-- Índice para búsquedas rápidas
create index if not exists idx_propiedades_oculta_en_publicaciones on propiedades(oculta_en_publicaciones);
