-- ============================================================================
-- 20261014120000_trabajos_scraper_externas.sql
-- Cola de trabajos para el scraping manual de propiedades externas.
-- El botón en /dashboard/propiedades/externas inserta un trabajo
-- SOLICITADO; el monce-worker (Playwright, corre en la Mac) lo reclama y
-- ejecuta el scraping (fetch() simple ya no pasa el bloqueo de Cloudflare
-- de Encuentra24, ver comentarios en supabase/functions/scrapear-propiedades-externas).
-- ============================================================================

create table trabajos_scraper_externas (
  id              uuid primary key default gen_random_uuid(),
  portal          text not null default 'encuentra24',
  estado          text not null default 'SOLICITADO'
                    check (estado in ('SOLICITADO', 'EN_PROGRESO', 'COMPLETADO', 'FALLIDO')),
  solicitado_por  uuid references perfiles(id),
  solicitado_en   timestamptz default now(),
  iniciado_en     timestamptz,
  completado_en   timestamptz,
  resultado       jsonb,
  mensaje_error   text
);

create index idx_trabajos_scraper_externas_estado on trabajos_scraper_externas(estado);

alter table trabajos_scraper_externas enable row level security;

-- Cualquier usuario autenticado puede ver el estado y solicitar un scraping;
-- el Worker usa la service role (bypassa RLS) para reclamar y actualizar.
create policy "Autenticados ven trabajos de scraper"
on trabajos_scraper_externas
for select
to authenticated
using (true);

create policy "Autenticados solicitan scraping"
on trabajos_scraper_externas
for insert
to authenticated
with check (solicitado_por = auth.uid());
