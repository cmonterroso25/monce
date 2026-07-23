-- Extiende la política de agentes sobre `documentos` para permitir DELETE
-- de sus propios documentos (antes solo SELECT e INSERT). Misma condición
-- de pertenencia que las políticas existentes, vía EXISTS contra
-- propiedades.captado_por, contactos.agente_asignado o leads.agente_id
-- según tipo_relacionado.
create policy "Agente borra documentos de lo suyo"
on documentos for delete
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
