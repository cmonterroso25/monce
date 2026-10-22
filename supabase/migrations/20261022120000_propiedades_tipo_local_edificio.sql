-- ============================================================================
-- 20261022120000_propiedades_tipo_local_edificio.sql
-- Agrega "local" y "edificio" al catálogo de tipo_propiedad (petición
-- explícita del usuario). Ver el comentario en 0003_tablas_negocio.sql:
-- "si se agrega un 9no tipo en el futuro, hay que actualizar este CHECK
-- además del catálogo del frontend" (src/lib/tipos-propiedad.ts).
-- ============================================================================

alter table propiedades drop constraint propiedades_tipo_propiedad_check;
alter table propiedades add constraint propiedades_tipo_propiedad_check
  check (tipo_propiedad = any (array[
    'casa', 'apartamento', 'terreno', 'bodega',
    'oficina', 'ofibodega', 'finca', 'granja',
    'local', 'edificio'
  ]));
