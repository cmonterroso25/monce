-- =====================================================================
-- Motor de Publicación Multicanal — Monce
-- Basado en: Monce_Publication_Engine_Arquitectura_Tecnica_v1.1
--   §27 Servicio de contenido · §29 Secuencia · §31 Idempotencia
--   §50-52 Evolución multicanal / subjobs · Adenda v1.1 (§58: lock,
--   circuit breaker, pgmq/aprobación, observabilidad)
--
-- Diseño: 1 solicitud del asesor (checkboxes de canal) → N subjobs,
-- uno por canal seleccionado. Primera implementación activa: solo
-- Facebook Marketplace Desktop Web (§48 MVP mínimo). El resto de
-- canales queda en el catálogo, inactivo, listo para encenderse
-- sin cambiar el schema.
--
-- Sistema NUEVO, separado del content engine existente
-- (kits / kit_piezas / publicaciones), que sigue intacto.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Catálogo de canales (§50)
-- ---------------------------------------------------------------------
create table canales_publicacion (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  plataforma text not null, -- facebook | instagram | whatsapp | website | portal | google
  metodo_ejecucion text not null
    check (metodo_ejecucion in ('browser_automation','api','sistema_interno')),
  requiere_cuenta_social boolean not null default true,
  requiere_categoria boolean not null default false,
  activo boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

insert into canales_publicacion (codigo, nombre, plataforma, metodo_ejecucion, requiere_cuenta_social, requiere_categoria, activo) values
  ('facebook_marketplace', 'Facebook Marketplace',      'facebook',  'browser_automation', true,  true,  true),  -- MVP activo
  ('facebook_page',        'Página de Facebook',        'facebook',  'api',                 true,  false, false),
  ('instagram',            'Instagram',                 'instagram', 'api',                 true,  false, false),
  ('whatsapp',             'WhatsApp',                  'whatsapp',  'sistema_interno',     false, false, false), -- ya cubierto por notificaciones_whatsapp
  ('website',              'Sitio web Monce',           'website',   'sistema_interno',     false, false, false), -- ya cubierto por propiedades.publicable
  ('viveguate',            'ViveGuate',                 'portal',    'browser_automation',  true,  true,  false),
  ('portal_generico',      'Otro portal inmobiliario',  'portal',    'browser_automation',  true,  true,  false),
  ('google_business',      'Google Business / otros',   'google',    'api',                 false, false, false);

-- ---------------------------------------------------------------------
-- 2. Superficies por canal (§8.2) — ej. Marketplace Desktop vs Mobile
-- ---------------------------------------------------------------------
create table superficies_canal (
  id uuid primary key default gen_random_uuid(),
  canal_id uuid not null references canales_publicacion(id) on delete cascade,
  codigo text not null, -- desktop_web | mobile_web | android_app | ios_app | api_v1 | interno
  activa boolean not null default false,
  version_adapter_actual text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (canal_id, codigo)
);

insert into superficies_canal (canal_id, codigo, activa)
select cp.id, v.codigo, v.activa
from canales_publicacion cp, (values
  ('desktop_web', true),
  ('mobile_web',  false),
  ('android_app', false),
  ('ios_app',     false)
) as v(codigo, activa)
where cp.codigo = 'facebook_marketplace';

-- ---------------------------------------------------------------------
-- 3. Definiciones de campos por superficie (§8.2)
-- ---------------------------------------------------------------------
create table definiciones_campos_canal (
  id uuid primary key default gen_random_uuid(),
  superficie_id uuid not null references superficies_canal(id) on delete cascade,
  version_adapter text not null,
  clave_campo text not null,
  etiqueta_externa text,
  requerido boolean not null default false,
  ruta_origen text,
  regla_transformacion text,
  estrategia_selector text,
  regla_validacion text,
  orden int4 not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (superficie_id, version_adapter, clave_campo)
);

-- ---------------------------------------------------------------------
-- 4. Mapeo de categorías por superficie (§9) — solo canales con categoría
-- ---------------------------------------------------------------------
create table mapeos_categoria_canal (
  id uuid primary key default gen_random_uuid(),
  superficie_id uuid not null references superficies_canal(id) on delete cascade,
  operacion text not null,
  tipo_propiedad text not null,
  ruta_categoria text not null,
  categoria_externa_id text,
  version_adapter text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (superficie_id, operacion, tipo_propiedad, version_adapter)
);

insert into mapeos_categoria_canal (superficie_id, operacion, tipo_propiedad, ruta_categoria, version_adapter)
select sc.id, v.operacion, v.tipo_propiedad, v.ruta_categoria, 'marketplace_desktop_v1'
from superficies_canal sc
join canales_publicacion c on c.id = sc.canal_id and c.codigo = 'facebook_marketplace'
join (values
  ('venta',    'casa',        'Propiedades → Viviendas en venta'),
  ('venta',    'apartamento', 'Propiedades → Viviendas en venta'),
  ('venta',    'condominio',  'Propiedades → Viviendas en venta'),
  ('alquiler', 'casa',        'Propiedades → Alquileres'),
  ('alquiler', 'apartamento', 'Propiedades → Alquileres'),
  ('alquiler', 'condominio',  'Propiedades → Alquileres')
) as v(operacion, tipo_propiedad, ruta_categoria) on true
where sc.codigo = 'desktop_web';

-- ---------------------------------------------------------------------
-- 5. Nodos Worker (§17) — infraestructura, no dato de tenant
-- ---------------------------------------------------------------------
create table nodos_worker (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  hostname text,
  estado text not null default 'STARTING'
    check (estado in ('STARTING','READY','BUSY','DRAINING','OFFLINE','ERROR')),
  version text,
  canales_soportados text[] not null default array['facebook_marketplace'],
  capacidad int4 not null default 1,
  jobs_activos int4 not null default 0,
  ultimo_heartbeat_en timestamptz,
  ultimo_error_en timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. Cuentas sociales (§14) — sensible: equivalente a credencial viva.
--    Una cuenta es por PLATAFORMA (ej. login de Facebook), no por canal:
--    la misma cuenta de Facebook sirve para Marketplace y para Page.
-- ---------------------------------------------------------------------
create table cuentas_sociales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizaciones(id),
  asesor_id uuid not null references perfiles(id),
  plataforma text not null check (plataforma in ('facebook','instagram','whatsapp','google','website','portal')),
  tipo_cuenta text not null default 'personal',
  etiqueta text,
  superficie_preferida_id uuid references superficies_canal(id),
  estado text not null default 'PENDING_SETUP'
    check (estado in ('PENDING_SETUP','AUTH_REQUIRED','READY','BUSY','LOCKED','DISABLED','ERROR')),
  referencia_sesion text, -- puntero al perfil de navegador en el Worker; NUNCA credenciales
  autenticada_en timestamptz,
  usada_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index idx_cuentas_sociales_org on cuentas_sociales (organization_id);
create index idx_cuentas_sociales_asesor on cuentas_sociales (asesor_id);

-- ---------------------------------------------------------------------
-- 7. Solicitud de publicación (§50) — el clic [PUBLICAR] con checkboxes.
--    Es el padre; se abre en N subjobs, uno por canal marcado.
-- ---------------------------------------------------------------------
create table solicitudes_publicacion (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizaciones(id),
  propiedad_id uuid not null references propiedades(id),
  asesor_id uuid not null references perfiles(id),
  estado text not null default 'PENDIENTE'
    check (estado in ('PENDIENTE','EN_PROCESO','PARCIALMENTE_PUBLICADA','PUBLICADA','CON_ERRORES','CANCELADA')),
  version_payload int4 not null default 1,
  trace_id uuid not null default gen_random_uuid(),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index idx_solicitudes_pub_org on solicitudes_publicacion (organization_id);
create index idx_solicitudes_pub_propiedad on solicitudes_publicacion (propiedad_id);

-- ---------------------------------------------------------------------
-- 8. Trabajos de publicación = SUBJOB por canal (§18, §23, §51)
-- ---------------------------------------------------------------------
create table trabajos_publicacion (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references solicitudes_publicacion(id) on delete cascade,
  organization_id uuid not null references organizaciones(id), -- denormalizado para RLS/índices
  propiedad_id uuid not null references propiedades(id),       -- denormalizado
  asesor_id uuid not null references perfiles(id),              -- denormalizado
  canal_id uuid not null references canales_publicacion(id),
  superficie_id uuid references superficies_canal(id), -- null si metodo_ejecucion no usa navegador
  cuenta_social_id uuid references cuentas_sociales(id), -- null si el canal no requiere cuenta (ej. website)
  version_adapter text,
  estado text not null default 'PENDIENTE'
    check (estado in (
      'PENDIENTE','VALIDANDO','PREPARANDO','CONTENIDO_LISTO','ASSETS_LISTOS',
      'LISTO_MARKETPLACE','QUEUED','PUBLICANDO','WAITING_APPROVAL','APPROVED',
      'VERIFICANDO','PUBLICADO',
      'VALIDATION_ERROR','RETRY_WAITING','AUTH_REQUIRED',
      'HUMAN_INTERVENTION_REQUIRED','APPROVAL_EXPIRED','CANCELLED','FAILED'
    )),
  prioridad int4 not null default 0,
  version_payload int4 not null default 1,
  intentos int4 not null default 0,
  max_intentos int4 not null default 3,
  encolado_en timestamptz,
  iniciado_en timestamptz,
  esperando_aprobacion_en timestamptz,
  aprobado_en timestamptz,
  publicado_en timestamptz,
  completado_en timestamptz,
  expira_en timestamptz,
  worker_id uuid references nodos_worker(id),
  codigo_error text,
  mensaje_error text,
  referencia_externa text,
  url_externa text,
  trace_id uuid not null default gen_random_uuid(), -- §58.6 observabilidad
  -- Clave de idempotencia §31: property_id + channel + social_account_id + revision
  publication_key text generated always as (
    propiedad_id::text || ':' || canal_id::text || ':' ||
    coalesce(cuenta_social_id::text, 'sin_cuenta') || ':' || version_payload::text
  ) stored,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (publication_key)
);

create index idx_trabajos_pub_org on trabajos_publicacion (organization_id);
create index idx_trabajos_pub_solicitud on trabajos_publicacion (solicitud_id);
create index idx_trabajos_pub_propiedad on trabajos_publicacion (propiedad_id);
create index idx_trabajos_pub_canal on trabajos_publicacion (canal_id);
create index idx_trabajos_pub_cuenta on trabajos_publicacion (cuenta_social_id);
create index idx_trabajos_pub_estado on trabajos_publicacion (estado);
create index idx_trabajos_pub_worker on trabajos_publicacion (worker_id);

-- ---------------------------------------------------------------------
-- 9. Contenido de publicación (§19, §27) — 1 versión por subjob/canal
-- ---------------------------------------------------------------------
create table contenido_publicacion (
  id uuid primary key default gen_random_uuid(),
  trabajo_id uuid not null references trabajos_publicacion(id) on delete cascade,
  titulo text,
  precio numeric,
  moneda text,
  ubicacion jsonb,
  categoria text,
  condicion text,
  descripcion text,
  campos_estructurados jsonb,
  version_contenido int4 not null default 1,
  metodo_generacion text check (metodo_generacion in ('TEMPLATE','AI','MANUAL','HYBRID')),
  proveedor_ia text,
  modelo_ia text,
  aprobado_por uuid references perfiles(id),
  aprobado_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index idx_contenido_pub_trabajo on contenido_publicacion (trabajo_id);

-- ---------------------------------------------------------------------
-- 10. Assets de publicación (§20)
-- ---------------------------------------------------------------------
create table activos_publicacion (
  id uuid primary key default gen_random_uuid(),
  trabajo_id uuid not null references trabajos_publicacion(id) on delete cascade,
  propiedad_id uuid not null references propiedades(id),
  proveedor_almacenamiento text not null default 'r2',
  clave_almacenamiento text not null,
  referencia_url_publica text,
  tipo_activo text not null check (tipo_activo in ('photo','screenshot','evidence')),
  secuencia int4,
  checksum text,
  tipo_mime text,
  tamano_bytes int8,
  estado text not null default 'PENDING',
  creado_en timestamptz not null default now()
);

create index idx_activos_pub_trabajo on activos_publicacion (trabajo_id);

-- ---------------------------------------------------------------------
-- 11. Intentos de publicación (§21)
-- ---------------------------------------------------------------------
create table intentos_publicacion (
  id uuid primary key default gen_random_uuid(),
  trabajo_id uuid not null references trabajos_publicacion(id) on delete cascade,
  worker_id uuid references nodos_worker(id),
  numero_intento int4 not null,
  iniciado_en timestamptz not null default now(),
  finalizado_en timestamptz,
  resultado text,
  codigo_error text,
  mensaje_error text,
  referencia_screenshot text,
  version_navegador text,
  version_adapter text,
  metadata jsonb not null default '{}'::jsonb
);

create index idx_intentos_pub_trabajo on intentos_publicacion (trabajo_id);

-- ---------------------------------------------------------------------
-- 12. Logs de publicación / auditoría (§22) — a nivel solicitud o subjob
-- ---------------------------------------------------------------------
create table logs_publicacion (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid references solicitudes_publicacion(id) on delete cascade,
  trabajo_id uuid references trabajos_publicacion(id) on delete cascade,
  tipo_evento text not null check (tipo_evento in (
    'SOLICITUD_CREATED','SUBJOB_CREATED',
    'JOB_CREATED','VALIDATION_PASSED','VALIDATION_FAILED','CONTENT_READY',
    'ASSETS_READY','QUEUE_ENQUEUED','WORKER_CLAIMED','SESSION_OPENED',
    'MARKETPLACE_OPENED','CATEGORY_SELECTED','FORM_FILLED','PHOTOS_UPLOADED',
    'EVIDENCE_CAPTURED','WAITING_APPROVAL','APPROVED','PUBLISH_CLICKED',
    'PUBLICATION_VERIFIED','FAILED','HUMAN_INTERVENTION_REQUIRED','CIRCUIT_PAUSED'
  )),
  detalle jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now(),
  check (solicitud_id is not null or trabajo_id is not null)
);

create index idx_logs_pub_solicitud on logs_publicacion (solicitud_id);
create index idx_logs_pub_trabajo on logs_publicacion (trabajo_id);

-- ---------------------------------------------------------------------
-- 13. Circuit breaker por organización + canal (§58.5)
--     Facebook Marketplace puede pausarse sin afectar Website/Whatsapp.
-- ---------------------------------------------------------------------
create table circuito_publicacion (
  organization_id uuid not null references organizaciones(id),
  canal_id uuid not null references canales_publicacion(id),
  pausado boolean not null default false,
  motivo_pausa text,
  tasa_error_actual numeric not null default 0,
  ventana_errores jsonb not null default '[]'::jsonb,
  pausado_en timestamptz,
  reanudado_en timestamptz,
  actualizado_en timestamptz not null default now(),
  primary key (organization_id, canal_id)
);

-- =====================================================================
-- Trigger genérico actualizado_en
-- =====================================================================
create or replace function tocar_actualizado_en_publicacion()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

create trigger trg_touch_canales before update on canales_publicacion
  for each row execute function tocar_actualizado_en_publicacion();
create trigger trg_touch_superficies_canal before update on superficies_canal
  for each row execute function tocar_actualizado_en_publicacion();
create trigger trg_touch_nodos_worker before update on nodos_worker
  for each row execute function tocar_actualizado_en_publicacion();
create trigger trg_touch_cuentas_sociales before update on cuentas_sociales
  for each row execute function tocar_actualizado_en_publicacion();
create trigger trg_touch_solicitudes_publicacion before update on solicitudes_publicacion
  for each row execute function tocar_actualizado_en_publicacion();
create trigger trg_touch_trabajos_publicacion before update on trabajos_publicacion
  for each row execute function tocar_actualizado_en_publicacion();
create trigger trg_touch_contenido_publicacion before update on contenido_publicacion
  for each row execute function tocar_actualizado_en_publicacion();

-- =====================================================================
-- Trigger: la solicitud padre recalcula su estado según sus subjobs
-- =====================================================================
create or replace function actualizar_estado_solicitud_publicacion()
returns trigger
language plpgsql
as $$
declare
  v_total int;
  v_publicados int;
  v_fallidos int;
  v_pendientes int;
  v_nuevo_estado text;
begin
  select
    count(*),
    count(*) filter (where estado = 'PUBLICADO'),
    count(*) filter (where estado in ('FAILED','VALIDATION_ERROR','HUMAN_INTERVENTION_REQUIRED','APPROVAL_EXPIRED')),
    count(*) filter (where estado not in ('PUBLICADO','FAILED','VALIDATION_ERROR','HUMAN_INTERVENTION_REQUIRED','APPROVAL_EXPIRED','CANCELLED'))
  into v_total, v_publicados, v_fallidos, v_pendientes
  from trabajos_publicacion
  where solicitud_id = new.solicitud_id;

  if v_pendientes > 0 then
    v_nuevo_estado := 'EN_PROCESO';
  elsif v_publicados = v_total and v_total > 0 then
    v_nuevo_estado := 'PUBLICADA';
  elsif v_publicados > 0 and v_fallidos > 0 then
    v_nuevo_estado := 'PARCIALMENTE_PUBLICADA';
  elsif v_fallidos = v_total and v_total > 0 then
    v_nuevo_estado := 'CON_ERRORES';
  else
    v_nuevo_estado := 'EN_PROCESO';
  end if;

  update solicitudes_publicacion
  set estado = v_nuevo_estado
  where id = new.solicitud_id and estado is distinct from v_nuevo_estado;

  return new;
end;
$$;

create trigger trg_actualizar_estado_solicitud
  after update of estado on trabajos_publicacion
  for each row execute function actualizar_estado_solicitud_publicacion();

-- =====================================================================
-- Función: reclamo atómico de un subjob por Worker (§16.2 + §58.8)
--
-- - Filtra por los canales que el Worker soporta (p_canales_soportados).
--   Un Worker con Playwright puede pasar ['facebook_marketplace'];
--   un futuro Worker de API puede pasar ['facebook_page','instagram'].
-- - Respeta el circuit breaker por (organization_id, canal_id).
-- - Bloquea la fila del subjob y, si aplica, la de la cuenta social,
--   con FOR UPDATE SKIP LOCKED (no advisory lock de sesión — más
--   seguro detrás de un connection pooler).
-- - Si el canal no requiere cuenta (ej. website), cuenta_social_id
--   es null y simplemente no se bloquea ni se actualiza cuenta alguna.
--
-- IMPORTANTE (§58.4): el mensaje de pgmq debe eliminarse/archivarse en
-- el Edge Function que llama a esta RPC, en el momento del claim, no
-- al terminar el flujo completo. `estado` en esta tabla es la única
-- fuente de verdad a partir de aquí, no la cola.
-- =====================================================================
create or replace function reclamar_trabajo_publicacion(
  p_worker_id uuid,
  p_canales_soportados text[] default null
)
returns trabajos_publicacion
language plpgsql
security definer
as $$
declare
  v_job_id uuid;
  v_cuenta_id uuid;
  v_job trabajos_publicacion;
begin
  select tp.id, tp.cuenta_social_id
  into v_job_id, v_cuenta_id
  from trabajos_publicacion tp
  join canales_publicacion c on c.id = tp.canal_id
  left join cuentas_sociales cs on cs.id = tp.cuenta_social_id
  where tp.estado = 'QUEUED'
    and (p_canales_soportados is null or c.codigo = any(p_canales_soportados))
    and (tp.cuenta_social_id is null or cs.estado = 'READY')
    and not exists (
      select 1 from circuito_publicacion cb
      where cb.organization_id = tp.organization_id
        and cb.canal_id = tp.canal_id
        and cb.pausado = true
    )
  order by tp.prioridad desc, tp.encolado_en asc
  for update of tp, cs skip locked
  limit 1;

  if v_job_id is null then
    return null;
  end if;

  if v_cuenta_id is not null then
    update cuentas_sociales
    set estado = 'BUSY', usada_en = now()
    where id = v_cuenta_id;
  end if;

  update trabajos_publicacion
  set estado = 'PUBLICANDO', worker_id = p_worker_id, iniciado_en = now()
  where id = v_job_id
  returning * into v_job;

  insert into logs_publicacion (trabajo_id, tipo_evento, detalle)
  values (v_job.id, 'WORKER_CLAIMED',
          jsonb_build_object('worker_id', p_worker_id, 'cuenta_social_id', v_cuenta_id));

  return v_job;
end;
$$;

-- =====================================================================
-- Función: liberar cuenta al terminar/fallar un subjob
-- =====================================================================
create or replace function liberar_cuenta_publicacion(p_trabajo_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  update cuentas_sociales
  set estado = 'READY'
  where id = (select cuenta_social_id from trabajos_publicacion where id = p_trabajo_id)
    and estado = 'BUSY';
end;
$$;

-- =====================================================================
-- RLS
-- =====================================================================
alter table canales_publicacion enable row level security;
alter table superficies_canal enable row level security;
alter table definiciones_campos_canal enable row level security;
alter table mapeos_categoria_canal enable row level security;
alter table nodos_worker enable row level security;
alter table cuentas_sociales enable row level security;
alter table solicitudes_publicacion enable row level security;
alter table trabajos_publicacion enable row level security;
alter table contenido_publicacion enable row level security;
alter table activos_publicacion enable row level security;
alter table intentos_publicacion enable row level security;
alter table logs_publicacion enable row level security;
alter table circuito_publicacion enable row level security;

-- Config de plataforma: global, no ligada a organization_id (igual que propiedades_externas)
create policy "Autenticados ven canales de publicacion"
  on canales_publicacion for select to authenticated using (true);
create policy "Propietario gestiona canales de publicacion"
  on canales_publicacion for all to authenticated
  using (es_propietario_plataforma()) with check (es_propietario_plataforma());

create policy "Autenticados ven superficies de canal"
  on superficies_canal for select to authenticated using (true);
create policy "Propietario gestiona superficies de canal"
  on superficies_canal for all to authenticated
  using (es_propietario_plataforma()) with check (es_propietario_plataforma());

create policy "Autenticados ven definiciones de campos"
  on definiciones_campos_canal for select to authenticated using (true);
create policy "Propietario gestiona definiciones de campos"
  on definiciones_campos_canal for all to authenticated
  using (es_propietario_plataforma()) with check (es_propietario_plataforma());

create policy "Autenticados ven mapeos de categoria"
  on mapeos_categoria_canal for select to authenticated using (true);
create policy "Propietario gestiona mapeos de categoria"
  on mapeos_categoria_canal for all to authenticated
  using (es_propietario_plataforma()) with check (es_propietario_plataforma());

-- Infraestructura: solo el propietario de plataforma la ve/gestiona
create policy "Propietario ve nodos worker"
  on nodos_worker for select to authenticated using (es_propietario_plataforma());
create policy "Propietario gestiona nodos worker"
  on nodos_worker for all to authenticated
  using (es_propietario_plataforma()) with check (es_propietario_plataforma());

-- Cuentas sociales: sensibles. El propio asesor ve la suya; admin ve todas de su org.
-- Solo admin/propietario puede crear, editar o eliminar (§58.2: gobernanza).
create policy "Ver cuentas sociales propias o como admin"
  on cuentas_sociales for select to authenticated
  using (
    puede_ver_organizacion(organization_id)
    and (asesor_id = auth.uid() or es_administrador() or es_propietario_plataforma())
  );
create policy "Admin crea cuentas sociales"
  on cuentas_sociales for insert to authenticated
  with check (
    puede_ver_organizacion(organization_id)
    and (es_administrador() or es_propietario_plataforma())
  );
create policy "Admin edita cuentas sociales"
  on cuentas_sociales for update to authenticated
  using (
    puede_ver_organizacion(organization_id)
    and (es_administrador() or es_propietario_plataforma())
  )
  with check (
    puede_ver_organizacion(organization_id)
    and (es_administrador() or es_propietario_plataforma())
  );
create policy "Admin elimina cuentas sociales"
  on cuentas_sociales for delete to authenticated
  using (
    puede_ver_organizacion(organization_id)
    and (es_administrador() or es_propietario_plataforma())
  );

-- Solicitudes de publicación: el asesor dueño, el captador de la propiedad, o admin.
create policy "Ver solicitudes de publicacion propias o como admin"
  on solicitudes_publicacion for select to authenticated
  using (
    puede_ver_organizacion(organization_id)
    and (
      asesor_id = auth.uid()
      or es_administrador()
      or exists (select 1 from propiedades p where p.id = solicitudes_publicacion.propiedad_id and p.captado_por = auth.uid())
    )
  );
create policy "Agente crea solicitudes de publicacion de sus propiedades"
  on solicitudes_publicacion for insert to authenticated
  with check (
    puede_ver_organizacion(organization_id)
    and (asesor_id = auth.uid() or es_administrador())
  );
create policy "Agente cancela sus solicitudes, admin todas"
  on solicitudes_publicacion for update to authenticated
  using (
    puede_ver_organizacion(organization_id)
    and (asesor_id = auth.uid() or es_administrador())
  )
  with check (
    puede_ver_organizacion(organization_id)
    and (asesor_id = auth.uid() or es_administrador())
  );

-- Subjobs (trabajos_publicacion): los crea el Publication Engine (service_role),
-- no el usuario directamente. El usuario solo los ve y los aprueba/cancela.
create policy "Ver subjobs de publicacion propios o como admin"
  on trabajos_publicacion for select to authenticated
  using (
    puede_ver_organizacion(organization_id)
    and (
      asesor_id = auth.uid()
      or es_administrador()
      or exists (select 1 from propiedades p where p.id = trabajos_publicacion.propiedad_id and p.captado_por = auth.uid())
    )
  );
create policy "Agente aprueba o cancela sus subjobs, admin todos"
  on trabajos_publicacion for update to authenticated
  using (
    puede_ver_organizacion(organization_id)
    and (asesor_id = auth.uid() or es_administrador())
  )
  with check (
    puede_ver_organizacion(organization_id)
    and (asesor_id = auth.uid() or es_administrador())
  );

-- Contenido/Assets/Intentos: visibles si el usuario puede ver el subjob padre.
-- Los INSERT/UPDATE reales los hace el Worker/Edge Function con service_role
-- (que ignora RLS), por eso aquí solo se define SELECT.
create policy "Ver contenido de subjobs visibles"
  on contenido_publicacion for select to authenticated
  using (exists (
    select 1 from trabajos_publicacion tp
    where tp.id = contenido_publicacion.trabajo_id
      and puede_ver_organizacion(tp.organization_id)
      and (tp.asesor_id = auth.uid() or es_administrador()
           or exists (select 1 from propiedades p where p.id = tp.propiedad_id and p.captado_por = auth.uid()))
  ));

create policy "Ver assets de subjobs visibles"
  on activos_publicacion for select to authenticated
  using (exists (
    select 1 from trabajos_publicacion tp
    where tp.id = activos_publicacion.trabajo_id
      and puede_ver_organizacion(tp.organization_id)
      and (tp.asesor_id = auth.uid() or es_administrador()
           or exists (select 1 from propiedades p where p.id = tp.propiedad_id and p.captado_por = auth.uid()))
  ));

create policy "Ver intentos de subjobs visibles"
  on intentos_publicacion for select to authenticated
  using (exists (
    select 1 from trabajos_publicacion tp
    where tp.id = intentos_publicacion.trabajo_id
      and puede_ver_organizacion(tp.organization_id)
      and (tp.asesor_id = auth.uid() or es_administrador()
           or exists (select 1 from propiedades p where p.id = tp.propiedad_id and p.captado_por = auth.uid()))
  ));

-- Logs: visibles vía la solicitud o vía el subjob, lo que aplique.
create policy "Ver logs de solicitudes o subjobs visibles"
  on logs_publicacion for select to authenticated
  using (
    (solicitud_id is not null and exists (
      select 1 from solicitudes_publicacion sp
      where sp.id = logs_publicacion.solicitud_id
        and puede_ver_organizacion(sp.organization_id)
        and (sp.asesor_id = auth.uid() or es_administrador()
             or exists (select 1 from propiedades p where p.id = sp.propiedad_id and p.captado_por = auth.uid()))
    ))
    or
    (trabajo_id is not null and exists (
      select 1 from trabajos_publicacion tp
      where tp.id = logs_publicacion.trabajo_id
        and puede_ver_organizacion(tp.organization_id)
        and (tp.asesor_id = auth.uid() or es_administrador()
             or exists (select 1 from propiedades p where p.id = tp.propiedad_id and p.captado_por = auth.uid()))
    ))
  );

-- Circuit breaker: admin de la organizacion lo ve y lo reanuda manualmente (§58.5)
create policy "Admin ve circuito de publicacion de su organizacion"
  on circuito_publicacion for select to authenticated
  using (puede_ver_organizacion(organization_id) and (es_administrador() or es_propietario_plataforma()));
create policy "Admin gestiona circuito de publicacion de su organizacion"
  on circuito_publicacion for all to authenticated
  using (puede_ver_organizacion(organization_id) and (es_administrador() or es_propietario_plataforma()))
  with check (puede_ver_organizacion(organization_id) and (es_administrador() or es_propietario_plataforma()));
