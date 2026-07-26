-- Reemplaza la politica de anon en perfiles: en vez de exigir ser el captador
-- exacto de la propiedad, permite ver perfiles activos que pertenezcan a una
-- organizacion con al menos una propiedad publicada (disponible o reservada).
-- Esto habilita que el boton "Preguntar por esta propiedad" en el portal
-- publico use el telefono del agente que compartio el link (query param
-- ?agente=), no solo el del captador original.
drop policy if exists "Publico ve datos de contacto del captador" on perfiles;

create policy "Publico ve agentes activos de organizacion con propiedades publicadas"
on perfiles
for select
to anon
using (
  activo = true
  and exists (
    select 1 from propiedades p
    where p.organization_id = perfiles.organization_id
      and p.estado = any (array['disponible', 'reservada'])
  )
);
