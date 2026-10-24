-- ============================================================================
-- 20261024120000_requerimientos_estado.sql
-- "Cerrar" un requerimiento (cliente ya encontró algo, o se le fue el
-- interés) para que deje de compararse contra propiedades nuevas — sin
-- esto, la lista de requerimientos solo crece y cada propiedad nueva se
-- sigue revisando contra necesidades ya resueltas.
-- ============================================================================

alter table requerimientos add column estado text not null default 'abierto'
  check (estado in ('abierto', 'cerrado'));

create index idx_requerimientos_estado on requerimientos (estado);
