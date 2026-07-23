-- NOTA: esta política asume que tipo_relacionado usa los valores
-- 'propiedad', 'contacto' y 'lead'. No hay código en el repo todavía que
-- inserte en esta tabla, así que estos valores son una convención propuesta,
-- no una confirmada contra datos reales. Ajustar si al construir la UI de
-- documentos se usan nombres distintos.

drop policy if exists "Admin gestiona documentos de su organizacion" on documentos;

create policy "Admin gestiona documentos de su organizacion"
on documentos for all
to authenticated
using (organization_id = mi_organization_id() and es_administrador())
with check (organization_id = mi_organization_id() and es_administrador());

create policy "Agente ve documentos de lo suyo"
on documentos for select
to authenticated
using (
  organization_id = mi_organization_id()
  and (
    (tipo_relacionado = 'propiedad' and exists (
      select 1 from propiedades p
      where p.id = documentos.id_relacionado and p.captado_por = auth.uid()
    ))
    or (tipo_relacionado = 'contacto' and exists (
      select 1 from contactos c
      where c.id = documentos.id_relacionado and c.agente_asignado = auth.uid()
    ))
    or (tipo_relacionado = 'lead' and exists (
      select 1 from leads l
      where l.id = documentos.id_relacionado and l.agente_id = auth.uid()
    ))
  )
);

create policy "Agente sube documentos de lo suyo"
on documentos for insert
to authenticated
with check (
  organization_id = mi_organization_id()
  and (
    (tipo_relacionado = 'propiedad' and exists (
      select 1 from propiedades p
      where p.id = documentos.id_relacionado and p.captado_por = auth.uid()
    ))
    or (tipo_relacionado = 'contacto' and exists (
      select 1 from contactos c
      where c.id = documentos.id_relacionado and c.agente_asignado = auth.uid()
    ))
    or (tipo_relacionado = 'lead' and exists (
      select 1 from leads l
      where l.id = documentos.id_relacionado and l.agente_id = auth.uid()
    ))
  )
);
