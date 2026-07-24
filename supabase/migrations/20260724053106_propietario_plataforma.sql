-- ============================================================================
-- Rol de propietario de plataforma (super-admin)
-- Permite a un usuario marcado con es_propietario_plataforma = true crear
-- organizaciones nuevas y ver/operar los datos de TODAS las organizaciones,
-- sin depender del modelo de rol 'administrador' (que sigue acotado a una
-- sola organización).
-- ============================================================================

alter table perfiles
  add column if not exists es_propietario_plataforma boolean not null default false;

create or replace function public.es_propietario_plataforma()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from perfiles
    where id = auth.uid() and es_propietario_plataforma = true
  );
$$;

create or replace function public.puede_ver_organizacion(org_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select org_id = mi_organization_id() or es_propietario_plataforma();
$$;

create or replace function public.es_administrador()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from perfiles
    where id = auth.uid() and rol = 'administrador'
  ) or es_propietario_plataforma();
$$;

alter policy "Agente ve sus actividades, admin ve todas" on actividades
  using (((agente_id = auth.uid()) or es_administrador()) and puede_ver_organizacion(organization_id));
alter policy "Agente crea actividades" on actividades
  with check (((agente_id = auth.uid()) or es_administrador()) and puede_ver_organizacion(organization_id));
alter policy "Agente edita sus actividades, admin edita todas" on actividades
  using (((agente_id = auth.uid()) or es_administrador()) and puede_ver_organizacion(organization_id))
  with check (((agente_id = auth.uid()) or es_administrador()) and puede_ver_organizacion(organization_id));
alter policy "Admin elimina actividades de su organizacion" on actividades
  using (puede_ver_organizacion(organization_id) and es_administrador());

alter policy "Agente ve coincidencias de sus contactos" on coincidencias_propiedad
  using (
    puede_ver_organizacion(organization_id)
    and exists (
      select 1 from contactos
      where contactos.id = coincidencias_propiedad.contacto_id
        and ((contactos.agente_asignado = auth.uid()) or es_administrador())
    )
  );
alter policy "Sistema o admin gestiona coincidencias" on coincidencias_propiedad
  using (
    puede_ver_organizacion(organization_id)
    and exists (
      select 1 from contactos
      where contactos.id = coincidencias_propiedad.contacto_id
        and ((contactos.agente_asignado = auth.uid()) or es_administrador())
    )
  )
  with check (
    puede_ver_organizacion(organization_id)
    and exists (
      select 1 from contactos
      where contactos.id = coincidencias_propiedad.contacto_id
        and ((contactos.agente_asignado = auth.uid()) or es_administrador())
    )
  );

alter policy "Ver colegas de la organizacion" on colegas
  using (puede_ver_organizacion(organization_id));
alter policy "Crear colegas en la organizacion" on colegas
  with check (puede_ver_organizacion(organization_id));

alter policy "Agente ve sus contactos, admin ve todos" on contactos
  using (((agente_asignado = auth.uid()) or es_administrador()) and puede_ver_organizacion(organization_id));
alter policy "Agente crea contactos" on contactos
  with check (((agente_asignado = auth.uid()) or es_administrador()) and puede_ver_organizacion(organization_id));
alter policy "Agente edita sus contactos, admin edita todos" on contactos
  using (((agente_asignado = auth.uid()) or es_administrador()) and puede_ver_organizacion(organization_id))
  with check (((agente_asignado = auth.uid()) or es_administrador()) and puede_ver_organizacion(organization_id));
alter policy "Admin elimina contactos de su organizacion" on contactos
  using (puede_ver_organizacion(organization_id) and es_administrador());

alter policy "Ver contadores de la organizacion" on contadores
  using (puede_ver_organizacion(organization_id));

alter policy "Admin gestiona documentos de su organizacion" on documentos
  using (puede_ver_organizacion(organization_id) and es_administrador())
  with check (puede_ver_organizacion(organization_id) and es_administrador());

alter policy "Agente de la organizacion ve imagenes" on imagenes_propiedad
  using (puede_ver_organizacion(organization_id));

alter policy "Agente ve sus negocios, admin ve todos" on leads
  using (((agente_id = auth.uid()) or es_administrador()) and puede_ver_organizacion(organization_id));
alter policy "Agente crea negocios" on leads
  with check (((agente_id = auth.uid()) or es_administrador()) and puede_ver_organizacion(organization_id));
alter policy "Agente edita sus negocios, admin edita todos" on leads
  using (((agente_id = auth.uid()) or es_administrador()) and puede_ver_organizacion(organization_id))
  with check (((agente_id = auth.uid()) or es_administrador()) and puede_ver_organizacion(organization_id));
alter policy "Admin elimina negocios de su organizacion" on leads
  using (puede_ver_organizacion(organization_id) and es_administrador());

alter policy "Ver municipios de la organizacion" on municipios
  using (puede_ver_organizacion(organization_id));
alter policy "Crear municipios en la organizacion" on municipios
  with check (puede_ver_organizacion(organization_id));

alter policy "Agente ve notificaciones de su organizacion" on notificaciones_whatsapp
  using (puede_ver_organizacion(organization_id));
alter policy "Agente crea notificaciones de su organizacion" on notificaciones_whatsapp
  with check (puede_ver_organizacion(organization_id));
alter policy "Admin gestiona notificaciones" on notificaciones_whatsapp
  using (puede_ver_organizacion(organization_id) and es_administrador())
  with check (puede_ver_organizacion(organization_id) and es_administrador());

alter policy "Ver la propia organizacion" on organizaciones
  using (puede_ver_organizacion(id));
alter policy "Admin modifica su propia organizacion" on organizaciones
  using ((id = mi_organization_id() and es_administrador()) or es_propietario_plataforma())
  with check ((id = mi_organization_id() and es_administrador()) or es_propietario_plataforma());

create policy "Propietario crea organizaciones"
  on organizaciones for insert to authenticated
  with check (es_propietario_plataforma());

alter policy "Ver perfiles de la organizacion" on perfiles
  using (puede_ver_organizacion(organization_id));
alter policy "Admin modifica perfiles de su organizacion" on perfiles
  using ((organization_id = mi_organization_id() and es_administrador()) or es_propietario_plataforma())
  with check ((organization_id = mi_organization_id() and es_administrador()) or es_propietario_plataforma());

alter policy "Agente de la organizacion ve propiedades" on propiedades
  using (puede_ver_organizacion(organization_id));
alter policy "Agente de la organizacion crea propiedades" on propiedades
  with check (puede_ver_organizacion(organization_id));
alter policy "Captador o admin edita propiedades" on propiedades
  using (puede_ver_organizacion(organization_id) and ((captado_por = auth.uid()) or es_administrador()))
  with check (puede_ver_organizacion(organization_id) and ((captado_por = auth.uid()) or es_administrador()));

alter policy "Agente ve sus tareas, admin ve todas" on tareas
  using (((asignado_a = auth.uid()) or es_administrador()) and puede_ver_organizacion(organization_id));
alter policy "Agente o admin crea tareas" on tareas
  with check (((asignado_a = auth.uid()) or es_administrador()) and puede_ver_organizacion(organization_id));
alter policy "Agente edita sus tareas, admin edita todas" on tareas
  using (((asignado_a = auth.uid()) or es_administrador()) and puede_ver_organizacion(organization_id))
  with check (((asignado_a = auth.uid()) or es_administrador()) and puede_ver_organizacion(organization_id));
alter policy "Admin elimina tareas de su organizacion" on tareas
  using (puede_ver_organizacion(organization_id) and es_administrador());
