-- ============================================================================
-- 0005_rls_policies.sql
-- Activa RLS explícitamente en las 14 tablas (por robustez, aunque el event
-- trigger de 0001 ya debería haberlo hecho al crearlas) y recrea las
-- políticas tal cual existen en producción, verificado con pg_policies.
-- ============================================================================

alter table actividades              enable row level security;
alter table coincidencias_propiedad  enable row level security;
alter table colegas                  enable row level security;
alter table contactos                enable row level security;
alter table contadores                enable row level security;
alter table documentos               enable row level security;
alter table imagenes_propiedad       enable row level security;
alter table leads                    enable row level security;
alter table municipios               enable row level security;
alter table notificaciones_whatsapp  enable row level security;
alter table organizaciones           enable row level security;
alter table perfiles                 enable row level security;
alter table propiedades              enable row level security;
alter table tareas                   enable row level security;

-- ----------------------------------------------------------------------------
-- actividades
-- ----------------------------------------------------------------------------
create policy "Agente ve sus actividades, admin ve todas"
  on actividades for select to authenticated
  using (((agente_id = auth.uid()) or es_administrador()) and (organization_id = mi_organization_id()));

create policy "Agente crea actividades"
  on actividades for insert to authenticated
  with check (((agente_id = auth.uid()) or es_administrador()) and (organization_id = mi_organization_id()));

create policy "Agente edita sus actividades, admin edita todas"
  on actividades for update to authenticated
  using (((agente_id = auth.uid()) or es_administrador()) and (organization_id = mi_organization_id()))
  with check (((agente_id = auth.uid()) or es_administrador()) and (organization_id = mi_organization_id()));

create policy "Admin elimina actividades de su organizacion"
  on actividades for delete to authenticated
  using ((organization_id = mi_organization_id()) and es_administrador());

-- ----------------------------------------------------------------------------
-- coincidencias_propiedad
-- ----------------------------------------------------------------------------
create policy "Agente ve coincidencias de sus contactos"
  on coincidencias_propiedad for select to authenticated
  using (
    (organization_id = mi_organization_id())
    and exists (
      select 1 from contactos
      where contactos.id = coincidencias_propiedad.contacto_id
        and ((contactos.agente_asignado = auth.uid()) or es_administrador())
    )
  );

create policy "Sistema o admin gestiona coincidencias"
  on coincidencias_propiedad for all to authenticated
  using (
    (organization_id = mi_organization_id())
    and exists (
      select 1 from contactos
      where contactos.id = coincidencias_propiedad.contacto_id
        and ((contactos.agente_asignado = auth.uid()) or es_administrador())
    )
  )
  with check (
    (organization_id = mi_organization_id())
    and exists (
      select 1 from contactos
      where contactos.id = coincidencias_propiedad.contacto_id
        and ((contactos.agente_asignado = auth.uid()) or es_administrador())
    )
  );

-- ----------------------------------------------------------------------------
-- colegas
-- ----------------------------------------------------------------------------
create policy "Ver colegas de la organizacion"
  on colegas for select to authenticated
  using (organization_id = mi_organization_id());

create policy "Crear colegas en la organizacion"
  on colegas for insert to authenticated
  with check (organization_id = mi_organization_id());

create policy "Solo admin edita colegas"
  on colegas for update to authenticated
  using (es_administrador());

create policy "Solo admin elimina colegas"
  on colegas for delete to authenticated
  using (es_administrador());

-- ----------------------------------------------------------------------------
-- contactos
-- ----------------------------------------------------------------------------
create policy "Agente ve sus contactos, admin ve todos"
  on contactos for select to authenticated
  using (((agente_asignado = auth.uid()) or es_administrador()) and (organization_id = mi_organization_id()));

create policy "Agente crea contactos"
  on contactos for insert to authenticated
  with check (((agente_asignado = auth.uid()) or es_administrador()) and (organization_id = mi_organization_id()));

create policy "Agente edita sus contactos, admin edita todos"
  on contactos for update to authenticated
  using (((agente_asignado = auth.uid()) or es_administrador()) and (organization_id = mi_organization_id()))
  with check (((agente_asignado = auth.uid()) or es_administrador()) and (organization_id = mi_organization_id()));

create policy "Admin elimina contactos de su organizacion"
  on contactos for delete to authenticated
  using ((organization_id = mi_organization_id()) and es_administrador());

-- ----------------------------------------------------------------------------
-- contadores
-- ----------------------------------------------------------------------------
create policy "Ver contadores de la organizacion"
  on contadores for select to authenticated
  using (organization_id = mi_organization_id());

-- ----------------------------------------------------------------------------
-- documentos
-- ----------------------------------------------------------------------------
create policy "Admin gestiona documentos de su organizacion"
  on documentos for all to authenticated
  using ((organization_id = mi_organization_id()) and es_administrador())
  with check ((organization_id = mi_organization_id()) and es_administrador());

-- ----------------------------------------------------------------------------
-- imagenes_propiedad
-- ----------------------------------------------------------------------------
create policy "Agente de la organizacion ve imagenes"
  on imagenes_propiedad for select to authenticated
  using (organization_id = mi_organization_id());

create policy "Captador o admin gestiona imagenes"
  on imagenes_propiedad for all to authenticated
  using (
    exists (
      select 1 from propiedades
      where propiedades.id = imagenes_propiedad.propiedad_id
        and ((propiedades.captado_por = auth.uid()) or es_administrador())
    )
  )
  with check (
    exists (
      select 1 from propiedades
      where propiedades.id = imagenes_propiedad.propiedad_id
        and ((propiedades.captado_por = auth.uid()) or es_administrador())
    )
  );

create policy "Publico ve imagenes de propiedades publicables"
  on imagenes_propiedad for select to anon
  using (
    exists (
      select 1 from propiedades
      where propiedades.id = imagenes_propiedad.propiedad_id
        and propiedades.estado = any (array['disponible','reservada'])
    )
  );

-- ----------------------------------------------------------------------------
-- leads
-- ----------------------------------------------------------------------------
create policy "Agente ve sus negocios, admin ve todos"
  on leads for select to authenticated
  using (((agente_id = auth.uid()) or es_administrador()) and (organization_id = mi_organization_id()));

create policy "Agente crea negocios"
  on leads for insert to authenticated
  with check (((agente_id = auth.uid()) or es_administrador()) and (organization_id = mi_organization_id()));

create policy "Agente edita sus negocios, admin edita todos"
  on leads for update to authenticated
  using (((agente_id = auth.uid()) or es_administrador()) and (organization_id = mi_organization_id()))
  with check (((agente_id = auth.uid()) or es_administrador()) and (organization_id = mi_organization_id()));

create policy "Admin elimina negocios de su organizacion"
  on leads for delete to authenticated
  using ((organization_id = mi_organization_id()) and es_administrador());

-- ----------------------------------------------------------------------------
-- municipios
-- ----------------------------------------------------------------------------
create policy "Ver municipios de la organizacion"
  on municipios for select to authenticated
  using (organization_id = mi_organization_id());

create policy "Crear municipios en la organizacion"
  on municipios for insert to authenticated
  with check (organization_id = mi_organization_id());

create policy "Solo admin edita municipios"
  on municipios for update to authenticated
  using (es_administrador());

create policy "Solo admin elimina municipios"
  on municipios for delete to authenticated
  using (es_administrador());

create policy "Publico ve municipios"
  on municipios for select to anon
  using (true);

-- ----------------------------------------------------------------------------
-- notificaciones_whatsapp
-- Nota: en producción estas políticas están asignadas al rol {public}, no
-- {authenticated}. Se preserva tal cual, aunque vale la pena revisar si
-- esto fue intencional (permitiría, en teoría, que el rol "anon" también
-- caiga bajo estas políticas si llegara a tener sesión pública sin
-- autenticar del todo). Ver nota en la respuesta del chat.
-- ----------------------------------------------------------------------------
create policy "Agente ve notificaciones de su organizacion"
  on notificaciones_whatsapp for select to public
  using (organization_id = mi_organization_id());

create policy "Agente crea notificaciones de su organizacion"
  on notificaciones_whatsapp for insert to public
  with check (organization_id = mi_organization_id());

create policy "Admin gestiona notificaciones"
  on notificaciones_whatsapp for all to public
  using ((organization_id = mi_organization_id()) and es_administrador())
  with check ((organization_id = mi_organization_id()) and es_administrador());

-- ----------------------------------------------------------------------------
-- organizaciones
-- ----------------------------------------------------------------------------
create policy "Ver la propia organizacion"
  on organizaciones for select to authenticated
  using (id = mi_organization_id());

create policy "Admin modifica su propia organizacion"
  on organizaciones for all to authenticated
  using ((id = mi_organization_id()) and es_administrador())
  with check ((id = mi_organization_id()) and es_administrador());

-- ----------------------------------------------------------------------------
-- perfiles
-- ----------------------------------------------------------------------------
create policy "Ver perfiles de la organizacion"
  on perfiles for select to authenticated
  using (organization_id = mi_organization_id());

create policy "Admin modifica perfiles de su organizacion"
  on perfiles for all to authenticated
  using ((organization_id = mi_organization_id()) and es_administrador())
  with check ((organization_id = mi_organization_id()) and es_administrador());

create policy "Publico ve datos de contacto del captador"
  on perfiles for select to anon
  using (
    exists (
      select 1 from propiedades
      where propiedades.captado_por = perfiles.id
        and propiedades.estado = any (array['disponible','reservada'])
    )
  );

-- ----------------------------------------------------------------------------
-- propiedades
-- ----------------------------------------------------------------------------
create policy "Agente de la organizacion ve propiedades"
  on propiedades for select to authenticated
  using (organization_id = mi_organization_id());

-- Nota: esta política en producción NO usa mi_organization_id(), usa un
-- subselect equivalente escrito a mano. Se preserva tal cual para que el
-- baseline coincida exactamente; funcionalmente es idéntica a usar
-- mi_organization_id(), pero si en el futuro decides unificarlas, aquí es
-- donde está la inconsistencia de estilo.
create policy "Agente de la organizacion crea propiedades"
  on propiedades for insert to authenticated
  with check (organization_id = (select perfiles.organization_id from perfiles where perfiles.id = auth.uid()));

create policy "Captador o admin edita propiedades"
  on propiedades for update to authenticated
  using ((organization_id = mi_organization_id()) and ((captado_por = auth.uid()) or es_administrador()))
  with check ((organization_id = mi_organization_id()) and ((captado_por = auth.uid()) or es_administrador()));

create policy "Solo administrador elimina propiedades"
  on propiedades for delete to authenticated
  using (es_administrador());

create policy "Publico ve propiedades disponibles"
  on propiedades for select to anon
  using (estado = any (array['disponible','reservada']));

-- ----------------------------------------------------------------------------
-- tareas
-- ----------------------------------------------------------------------------
create policy "Agente ve sus tareas, admin ve todas"
  on tareas for select to authenticated
  using (((asignado_a = auth.uid()) or es_administrador()) and (organization_id = mi_organization_id()));

create policy "Agente o admin crea tareas"
  on tareas for insert to authenticated
  with check (((asignado_a = auth.uid()) or es_administrador()) and (organization_id = mi_organization_id()));

create policy "Agente edita sus tareas, admin edita todas"
  on tareas for update to authenticated
  using (((asignado_a = auth.uid()) or es_administrador()) and (organization_id = mi_organization_id()))
  with check (((asignado_a = auth.uid()) or es_administrador()) and (organization_id = mi_organization_id()));

create policy "Admin elimina tareas de su organizacion"
  on tareas for delete to authenticated
  using ((organization_id = mi_organization_id()) and es_administrador());
