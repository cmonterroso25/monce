-- El historial de publicaciones es visible solo para el asesor que hizo el envío y para
-- administradores. Se quita la visibilidad extra que tenía el captador de la propiedad.

drop policy if exists "Ver solicitudes de publicacion propias o como admin" on solicitudes_publicacion;
create policy "Ver solicitudes de publicacion propias o como admin"
  on solicitudes_publicacion for select to authenticated
  using (
    puede_ver_organizacion(organization_id)
    and (asesor_id = auth.uid() or es_administrador())
  );

drop policy if exists "Ver subjobs de publicacion propios o como admin" on trabajos_publicacion;
create policy "Ver subjobs de publicacion propios o como admin"
  on trabajos_publicacion for select to authenticated
  using (
    puede_ver_organizacion(organization_id)
    and (asesor_id = auth.uid() or es_administrador())
  );

drop policy if exists "Ver contenido de subjobs visibles" on contenido_publicacion;
create policy "Ver contenido de subjobs visibles"
  on contenido_publicacion for select to authenticated
  using (exists (
    select 1 from trabajos_publicacion tp
    where tp.id = contenido_publicacion.trabajo_id
      and puede_ver_organizacion(tp.organization_id)
      and (tp.asesor_id = auth.uid() or es_administrador())
  ));

drop policy if exists "Ver assets de subjobs visibles" on activos_publicacion;
create policy "Ver assets de subjobs visibles"
  on activos_publicacion for select to authenticated
  using (exists (
    select 1 from trabajos_publicacion tp
    where tp.id = activos_publicacion.trabajo_id
      and puede_ver_organizacion(tp.organization_id)
      and (tp.asesor_id = auth.uid() or es_administrador())
  ));

drop policy if exists "Ver intentos de subjobs visibles" on intentos_publicacion;
create policy "Ver intentos de subjobs visibles"
  on intentos_publicacion for select to authenticated
  using (exists (
    select 1 from trabajos_publicacion tp
    where tp.id = intentos_publicacion.trabajo_id
      and puede_ver_organizacion(tp.organization_id)
      and (tp.asesor_id = auth.uid() or es_administrador())
  ));

drop policy if exists "Ver logs de solicitudes o subjobs visibles" on logs_publicacion;
create policy "Ver logs de solicitudes o subjobs visibles"
  on logs_publicacion for select to authenticated
  using (
    (solicitud_id is not null and exists (
      select 1 from solicitudes_publicacion sp
      where sp.id = logs_publicacion.solicitud_id
        and puede_ver_organizacion(sp.organization_id)
        and (sp.asesor_id = auth.uid() or es_administrador())
    ))
    or
    (trabajo_id is not null and exists (
      select 1 from trabajos_publicacion tp
      where tp.id = logs_publicacion.trabajo_id
        and puede_ver_organizacion(tp.organization_id)
        and (tp.asesor_id = auth.uid() or es_administrador())
    ))
  );
