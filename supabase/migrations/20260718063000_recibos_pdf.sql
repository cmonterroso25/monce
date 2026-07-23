-- Tabla de recibos/comprobantes de pago generados por lead.
create table recibos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizaciones(id),
  lead_id uuid not null references leads(id),
  contacto_id uuid not null references contactos(id),
  agente_receptor_id uuid not null references perfiles(id),
  numero_recibo int not null,
  monto numeric not null,
  moneda text not null default 'GTQ',
  concepto text not null,
  metodo_pago text not null,
  fecha_pago date not null,
  creado_por uuid not null references perfiles(id),
  creado_en timestamptz not null default now(),
  unique (organization_id, numero_recibo)
);

alter table recibos enable row level security;

create policy "Agente ve recibos de sus leads, admin ve todos"
on recibos for select
to authenticated
using (
  organization_id = mi_organization_id()
  and (
    es_administrador()
    or exists (select 1 from leads l where l.id = recibos.lead_id and l.agente_id = auth.uid())
  )
);

create policy "Agente genera recibos de sus leads"
on recibos for insert
to authenticated
with check (
  organization_id = mi_organization_id()
  and (
    es_administrador()
    or exists (select 1 from leads l where l.id = recibos.lead_id and l.agente_id = auth.uid())
  )
);

create policy "Admin borra recibos"
on recibos for delete
to authenticated
using (organization_id = mi_organization_id() and es_administrador());

-- Numeración correlativa atómica, arrancando en 500.
-- Reutiliza la tabla `contadores` ya existente (tipo = 'recibo').
create or replace function siguiente_numero_recibo(org_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  nuevo_valor int;
begin
  insert into contadores (organization_id, tipo, valor)
  values (org_id, 'recibo', 500)
  on conflict (organization_id, tipo)
  do update set valor = contadores.valor + 1
  returning valor into nuevo_valor;
  return nuevo_valor;
end;
$$;

grant execute on function siguiente_numero_recibo(uuid) to authenticated;
