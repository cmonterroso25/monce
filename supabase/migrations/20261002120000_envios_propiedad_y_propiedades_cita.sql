-- Registro de propiedades enviadas a un contacto (clic en compartir)
create table public.envios_propiedad_contacto (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default organizacion_por_defecto() references public.organizaciones(id),
  contacto_id uuid not null references public.contactos(id) on delete cascade,
  propiedad_id uuid not null references public.propiedades(id) on delete cascade,
  canal text not null check (canal in ('whatsapp','messenger','instagram','tiktok')),
  enviado_por uuid not null default auth.uid() references public.perfiles(id),
  creado_en timestamptz not null default now()
);

create index envios_propiedad_contacto_contacto_idx
  on public.envios_propiedad_contacto (contacto_id, propiedad_id);

-- Propiedades que se visitarán en una actividad (cita)
create table public.actividad_propiedades (
  actividad_id uuid not null references public.actividades(id) on delete cascade,
  propiedad_id uuid not null references public.propiedades(id) on delete cascade,
  organization_id uuid not null default organizacion_por_defecto() references public.organizaciones(id),
  creado_en timestamptz not null default now(),
  primary key (actividad_id, propiedad_id)
);

alter table public.envios_propiedad_contacto enable row level security;
alter table public.actividad_propiedades enable row level security;

create policy "Ver envios de propiedad de mis contactos o leads"
  on public.envios_propiedad_contacto for select to authenticated
  using (
    puede_ver_organizacion(organization_id)
    and (
      es_administrador()
      or enviado_por = auth.uid()
      or exists (select 1 from public.contactos c
                 where c.id = envios_propiedad_contacto.contacto_id and c.agente_asignado = auth.uid())
      or exists (select 1 from public.leads l
                 where l.contacto_id = envios_propiedad_contacto.contacto_id and l.agente_id = auth.uid())
    )
  );

create policy "Registrar envios de propiedad a mis contactos"
  on public.envios_propiedad_contacto for insert to authenticated
  with check (
    puede_ver_organizacion(organization_id)
    and enviado_por = auth.uid()
    and (
      es_administrador()
      or exists (select 1 from public.contactos c
                 where c.id = envios_propiedad_contacto.contacto_id and c.agente_asignado = auth.uid())
    )
  );

create policy "Ver propiedades de actividades visibles"
  on public.actividad_propiedades for select to authenticated
  using (
    puede_ver_organizacion(organization_id)
    and exists (select 1 from public.actividades a where a.id = actividad_propiedades.actividad_id)
  );

create policy "Agregar propiedades a actividades visibles"
  on public.actividad_propiedades for insert to authenticated
  with check (
    puede_ver_organizacion(organization_id)
    and exists (select 1 from public.actividades a where a.id = actividad_propiedades.actividad_id)
  );

create policy "Quitar propiedades de actividades visibles"
  on public.actividad_propiedades for delete to authenticated
  using (
    puede_ver_organizacion(organization_id)
    and exists (select 1 from public.actividades a where a.id = actividad_propiedades.actividad_id)
  );

grant select, insert on public.envios_propiedad_contacto to authenticated;
grant select, insert, delete on public.actividad_propiedades to authenticated;
grant select, insert, update, delete on public.envios_propiedad_contacto to service_role;
grant select, insert, update, delete on public.actividad_propiedades to service_role;
