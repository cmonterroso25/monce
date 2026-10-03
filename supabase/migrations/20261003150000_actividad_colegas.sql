-- Colegas de una actividad (cita). id propio (sin PK compuesta) para que PostgREST
-- no la trate como tabla de unión y no vuelva ambiguo el embed actividades -> colegas.
-- actividades.colega_id se conserva como colega principal.
create table public.actividad_colegas (
  id uuid primary key default gen_random_uuid(),
  actividad_id uuid not null references public.actividades(id) on delete cascade,
  colega_id uuid not null references public.colegas(id) on delete cascade,
  organization_id uuid not null default organizacion_por_defecto() references public.organizaciones(id),
  creado_en timestamptz not null default now(),
  unique (actividad_id, colega_id)
);

alter table public.actividad_colegas enable row level security;

create policy "Ver colegas de actividades visibles"
  on public.actividad_colegas for select to authenticated
  using (
    puede_ver_organizacion(organization_id)
    and exists (select 1 from public.actividades a where a.id = actividad_colegas.actividad_id)
  );

create policy "Agregar colegas a actividades visibles"
  on public.actividad_colegas for insert to authenticated
  with check (
    puede_ver_organizacion(organization_id)
    and exists (select 1 from public.actividades a where a.id = actividad_colegas.actividad_id)
  );

create policy "Quitar colegas de actividades visibles"
  on public.actividad_colegas for delete to authenticated
  using (
    puede_ver_organizacion(organization_id)
    and exists (select 1 from public.actividades a where a.id = actividad_colegas.actividad_id)
  );

revoke all on public.actividad_colegas from anon, authenticated;
grant select, insert, delete on public.actividad_colegas to authenticated;
grant select, insert, update, delete on public.actividad_colegas to service_role;
revoke truncate, references, trigger on public.actividad_colegas from service_role;

-- Relleno: el colega que ya tenía cada actividad pasa a la nueva tabla.
insert into public.actividad_colegas (actividad_id, colega_id, organization_id)
select id, colega_id, organization_id
from public.actividades
where colega_id is not null
on conflict do nothing;
