create table if not exists informes_evaluacion (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizaciones(id),
  lead_id uuid not null references leads(id),
  contacto_id uuid not null references contactos(id),
  estado text not null default 'procesando' check (estado in ('procesando','completado','error')),
  resultado_recomendacion text,
  resultado_resumen text,
  ruta_pdf text,
  error_mensaje text,
  creado_por uuid not null references perfiles(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

alter table informes_evaluacion enable row level security;

create policy "Agente ve informes de sus leads"
on informes_evaluacion for select
using (
  organization_id = mi_organization_id()
  and (
    es_administrador()
    or exists (
      select 1 from leads l
      where l.id = informes_evaluacion.lead_id
      and l.agente_id = auth.uid()
    )
  )
);

create policy "Agente crea informes de sus leads"
on informes_evaluacion for insert
with check (
  organization_id = mi_organization_id()
  and exists (
    select 1 from leads l
    where l.id = informes_evaluacion.lead_id
    and l.agente_id = auth.uid()
  )
);

create policy "Admin gestiona informes"
on informes_evaluacion for all
using (organization_id = mi_organization_id() and es_administrador())
with check (organization_id = mi_organization_id() and es_administrador());
