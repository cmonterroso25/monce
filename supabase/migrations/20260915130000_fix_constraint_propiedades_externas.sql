-- =====================================================================
-- Fix: el upsert de propiedades_externas fallaba en cada corrida.
-- =====================================================================
drop index if exists public.idx_propiedades_externas_fuente_unica;

alter table public.propiedades_externas
    add constraint propiedades_externas_fuente_unica unique (fuente_portal, fuente_id);
