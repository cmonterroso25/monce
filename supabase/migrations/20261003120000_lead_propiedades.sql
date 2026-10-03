-- Propiedades de interés de un lead. id propio (sin PK compuesta) para que
-- PostgREST no la trate como tabla de unión y no vuelva ambiguo el embed
-- leads -> propiedades que ya usa la app.
create table public.lead_propiedades (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  propiedad_id uuid not null references public.propiedades(id) on delete cascade,
  organization_id uuid not null default organizacion_por_defecto() references public.organizaciones(id),
  creado_en timestamptz not null default now(),
  unique (lead_id, propiedad_id)
);

alter table public.lead_propiedades enable row level security;

create policy "Ver propiedades de leads visibles"
  on public.lead_propiedades for select to authenticated
  using (
    puede_ver_organizacion(organization_id)
    and exists (select 1 from public.leads l where l.id = lead_propiedades.lead_id)
  );

create policy "Agregar propiedades a leads visibles"
  on public.lead_propiedades for insert to authenticated
  with check (
    puede_ver_organizacion(organization_id)
    and exists (select 1 from public.leads l where l.id = lead_propiedades.lead_id)
  );

create policy "Quitar propiedades de leads visibles"
  on public.lead_propiedades for delete to authenticated
  using (
    puede_ver_organizacion(organization_id)
    and exists (select 1 from public.leads l where l.id = lead_propiedades.lead_id)
  );

revoke all on public.lead_propiedades from anon, authenticated;
grant select, insert, delete on public.lead_propiedades to authenticated;
grant select, insert, update, delete on public.lead_propiedades to service_role;
revoke truncate, references, trigger on public.lead_propiedades from service_role;

-- Relleno: la propiedad que ya tenía cada lead pasa a la nueva tabla.
insert into public.lead_propiedades (lead_id, propiedad_id, organization_id)
select id, propiedad_id, organization_id
from public.leads
where propiedad_id is not null
on conflict do nothing;
