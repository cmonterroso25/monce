-- =====================================================================
-- Content Engine — tablas nuevas sobre el esquema real de crm_monce
-- Convención de encolado: Edge Function dedicada por tipo de trabajo,
-- invocada directo (fetch + EdgeRuntime.waitUntil) desde un Server Action,
-- con callback a un webhook autenticado por header secreto — igual al
-- patrón existente de generar-informe / informe-resultado. Sin tabla de
-- cola genérica.
-- =====================================================================

-- ---------------------------------------------------------------------
-- INFORMES DE MERCADO (CMA) — sección 4
-- Mismo shape que informes_evaluacion: estado + resultado + error_mensaje.
-- ---------------------------------------------------------------------

create table if not exists public.informes_mercado (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizaciones(id),
  propiedad_id uuid not null references public.propiedades(id) on delete cascade,

  estado text not null default 'generando', -- 'generando' | 'completado' | 'error'
  proveedor text not null default 'perplexity-sonar',
  modelo text, -- 'sonar' | 'sonar-pro'

  precio_m2 numeric,
  precio_m2_promedio_zona numeric,
  precio_m2_mediana_zona numeric,
  posicionamiento text check (posicionamiento in ('por_encima', 'en_linea', 'por_debajo')),

  comparables jsonb not null default '[]'::jsonb,
  narrativa text,
  fuentes jsonb not null default '[]'::jsonb,

  costo_usd numeric(8,4),
  error_mensaje text,

  creado_por uuid not null references public.perfiles(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists idx_informes_mercado_propiedad on public.informes_mercado(propiedad_id);
create index if not exists idx_informes_mercado_org on public.informes_mercado(organization_id);

alter table public.informes_mercado enable row level security;

create policy "agente_ve_informes_mercado_de_sus_propiedades"
  on public.informes_mercado for select
  to authenticated
  using (
    organization_id = mi_organization_id()
    and (
      es_administrador()
      or exists (
        select 1 from public.propiedades p
        where p.id = informes_mercado.propiedad_id
          and p.captado_por = auth.uid()
      )
    )
  );

create policy "agente_crea_informes_mercado_de_sus_propiedades"
  on public.informes_mercado for insert
  to authenticated
  with check (
    organization_id = mi_organization_id()
    and (
      es_administrador()
      or exists (
        select 1 from public.propiedades p
        where p.id = informes_mercado.propiedad_id
          and p.captado_por = auth.uid()
      )
    )
  );

-- RPCs para el callback de la Edge Function (mismo patrón que
-- informe_marcar_completado / informe_marcar_error, security definer
-- porque el webhook usa supabaseAdmin con el secreto, no un JWT de usuario)

create or replace function public.cma_marcar_completado(
  p_informe_id uuid,
  p_precio_m2 numeric,
  p_precio_m2_promedio_zona numeric,
  p_precio_m2_mediana_zona numeric,
  p_posicionamiento text,
  p_comparables jsonb,
  p_narrativa text,
  p_fuentes jsonb,
  p_costo_usd numeric,
  p_modelo text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update informes_mercado
  set estado = 'completado',
      precio_m2 = p_precio_m2,
      precio_m2_promedio_zona = p_precio_m2_promedio_zona,
      precio_m2_mediana_zona = p_precio_m2_mediana_zona,
      posicionamiento = p_posicionamiento,
      comparables = coalesce(p_comparables, '[]'::jsonb),
      narrativa = p_narrativa,
      fuentes = coalesce(p_fuentes, '[]'::jsonb),
      costo_usd = p_costo_usd,
      modelo = p_modelo,
      actualizado_en = now()
  where id = p_informe_id;
end;
$$;

create or replace function public.cma_marcar_error(
  p_informe_id uuid,
  p_mensaje text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update informes_mercado
  set estado = 'error',
      error_mensaje = p_mensaje,
      actualizado_en = now()
  where id = p_informe_id;
end;
$$;

-- ---------------------------------------------------------------------
-- KITS — El Kit de Marketing, secciones 3 y 7
-- ---------------------------------------------------------------------

create table if not exists public.kits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizaciones(id),
  propiedad_id uuid not null references public.propiedades(id) on delete cascade,

  nivel text not null check (nivel in ('basico', 'estandar', 'premium')),
  estado text not null default 'generando' check (estado in (
    'generando', 'pendiente_revision', 'aprobado', 'rechazado', 'publicado', 'fallido'
  )),

  proveedor_video text, -- 'kling' | 'runway' | 'veo', solo estandar/premium

  aprobado_sin_ediciones boolean, -- KPI sección 14
  aprobado_por uuid references public.perfiles(id),
  aprobado_en timestamptz,

  costo_total_usd numeric(8,4),

  creado_por uuid not null references public.perfiles(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists idx_kits_propiedad on public.kits(propiedad_id);
create index if not exists idx_kits_estado on public.kits(estado);
create index if not exists idx_kits_org on public.kits(organization_id);

alter table public.kits enable row level security;

create policy "agente_ve_kits_de_sus_propiedades"
  on public.kits for select
  to authenticated
  using (
    organization_id = mi_organization_id()
    and (
      es_administrador()
      or exists (select 1 from public.propiedades p where p.id = kits.propiedad_id and p.captado_por = auth.uid())
    )
  );

create policy "agente_crea_kits_de_sus_propiedades"
  on public.kits for insert
  to authenticated
  with check (
    organization_id = mi_organization_id()
    and (
      es_administrador()
      or exists (select 1 from public.propiedades p where p.id = kits.propiedad_id and p.captado_por = auth.uid())
    )
  );

create policy "agente_aprueba_kits_de_sus_propiedades"
  on public.kits for update
  to authenticated
  using (
    organization_id = mi_organization_id()
    and (
      es_administrador()
      or exists (select 1 from public.propiedades p where p.id = kits.propiedad_id and p.captado_por = auth.uid())
    )
  )
  with check (
    organization_id = mi_organization_id()
    and (
      es_administrador()
      or exists (select 1 from public.propiedades p where p.id = kits.propiedad_id and p.captado_por = auth.uid())
    )
  );

-- ---------------------------------------------------------------------
-- KIT_PIEZAS — cada pieza generada dentro de un kit, checkpoint sección 7.3
-- ---------------------------------------------------------------------

create table if not exists public.kit_piezas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizaciones(id),
  kit_id uuid not null references public.kits(id) on delete cascade,

  tipo text not null check (tipo in (
    'foto_mejorada', 'historia', 'post_social', 'descripcion',
    'traduccion', 'reel', 'video_cinematografico', 'narracion'
  )),
  modo_origen text not null check (modo_origen in ('plantilla', 'generativa')), -- sección 3.3

  estado text not null default 'pendiente' check (estado in (
    'pendiente', 'generando', 'listo', 'aprobado', 'rechazado', 'regenerando', 'fallido'
  )),

  ruta_almacenamiento text, -- R2, para foto/video
  contenido_texto text,      -- descripción/traducción/slogan

  proveedor_ia text, -- 'gemini' | 'kling' | 'runway' | 'veo' | 'elevenlabs' | null si plantilla
  costo_usd numeric(8,4),

  veces_regenerada int not null default 0,
  nota_revisor text,

  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists idx_kit_piezas_kit on public.kit_piezas(kit_id);

alter table public.kit_piezas enable row level security;

create policy "agente_ve_piezas_de_sus_kits"
  on public.kit_piezas for select
  to authenticated
  using (
    organization_id = mi_organization_id()
    and (
      es_administrador()
      or exists (
        select 1 from public.kits k
        join public.propiedades p on p.id = k.propiedad_id
        where k.id = kit_piezas.kit_id and p.captado_por = auth.uid()
      )
    )
  );

create policy "agente_revisa_piezas_de_sus_kits"
  on public.kit_piezas for update
  to authenticated
  using (
    organization_id = mi_organization_id()
    and (
      es_administrador()
      or exists (
        select 1 from public.kits k
        join public.propiedades p on p.id = k.propiedad_id
        where k.id = kit_piezas.kit_id and p.captado_por = auth.uid()
      )
    )
  )
  with check (
    organization_id = mi_organization_id()
    and (
      es_administrador()
      or exists (
        select 1 from public.kits k
        join public.propiedades p on p.id = k.propiedad_id
        where k.id = kit_piezas.kit_id and p.captado_por = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------
-- CONVERSACIONES_CALIFICACION — Chatbot de calificación, sección 5
-- Línea central Meta Cloud API. No usa contactos/leads hasta el handoff
-- (paso 5, sección 5.3): ahí se crea la fila real en `contactos`.
-- ---------------------------------------------------------------------

create table if not exists public.conversaciones_calificacion (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizaciones(id),
  propiedad_id uuid not null references public.propiedades(id),

  telefono_lead text not null, -- formato normalizado 502########
  nombre_contacto text,

  etapa text not null default 'iniciada' check (etapa in (
    'iniciada', 'propiedad_confirmada', 'calificando',
    'contacto_capturado', 'derivada', 'abandonada'
  )),

  intencion text check (intencion in ('comprar', 'alquilar')),
  rango_presupuesto text,
  financiamiento_gestionado boolean,
  preferencia_visita text,

  contacto_id uuid references public.contactos(id), -- se llena en el handoff
  agente_asignado_id uuid references public.perfiles(id),
  notificado_en timestamptz,
  respondido_en timestamptz, -- SLA 15-30 min, sección 5.5

  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists idx_conv_calif_propiedad on public.conversaciones_calificacion(propiedad_id);
create index if not exists idx_conv_calif_telefono on public.conversaciones_calificacion(telefono_lead);
create unique index if not exists idx_conv_calif_activa
  on public.conversaciones_calificacion(telefono_lead, propiedad_id)
  where etapa not in ('derivada', 'abandonada');

alter table public.conversaciones_calificacion enable row level security;

create policy "agente_ve_conversaciones_de_sus_propiedades"
  on public.conversaciones_calificacion for select
  to authenticated
  using (
    organization_id = mi_organization_id()
    and (
      es_administrador()
      or agente_asignado_id = auth.uid()
      or exists (select 1 from public.propiedades p where p.id = conversaciones_calificacion.propiedad_id and p.captado_por = auth.uid())
    )
  );

-- Sin policy de INSERT/UPDATE para 'authenticated': esta tabla la escribe
-- únicamente el webhook de Meta vía supabaseAdmin (service role, bypassa RLS).

-- ---------------------------------------------------------------------
-- MENSAJES_CALIFICACION — historial crudo de la conversación con Meta
-- ---------------------------------------------------------------------

create table if not exists public.mensajes_calificacion (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.conversaciones_calificacion(id) on delete cascade,
  direccion text not null check (direccion in ('entrante', 'saliente')),
  wa_message_id text,
  tipo_mensaje text, -- 'text' | 'button' | 'interactive'
  contenido jsonb not null,
  creado_en timestamptz not null default now()
);

create index if not exists idx_mensajes_calif_conversacion on public.mensajes_calificacion(conversacion_id);

alter table public.mensajes_calificacion enable row level security;

create policy "agente_ve_mensajes_de_sus_conversaciones"
  on public.mensajes_calificacion for select
  to authenticated
  using (
    exists (
      select 1 from public.conversaciones_calificacion c
      where c.id = mensajes_calificacion.conversacion_id
        and c.organization_id = mi_organization_id()
        and (
          es_administrador()
          or c.agente_asignado_id = auth.uid()
          or exists (select 1 from public.propiedades p where p.id = c.propiedad_id and p.captado_por = auth.uid())
        )
    )
  );

-- ---------------------------------------------------------------------
-- PUBLICACIONES — Publishing Service, sección 8
-- ---------------------------------------------------------------------

create table if not exists public.publicaciones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizaciones(id),
  kit_id uuid not null references public.kits(id) on delete cascade,
  kit_pieza_id uuid references public.kit_piezas(id) on delete set null,

  plataforma text not null check (plataforma in ('instagram', 'facebook', 'tiktok', 'whatsapp')),
  estado text not null default 'en_cola' check (estado in ('en_cola', 'publicado', 'fallido', 'limite_de_tasa')),

  external_post_id text,
  utm_url text,

  error_mensaje text,
  publicado_en timestamptz,
  creado_en timestamptz not null default now()
);

create index if not exists idx_publicaciones_kit on public.publicaciones(kit_id);

alter table public.publicaciones enable row level security;

create policy "agente_ve_publicaciones_de_sus_kits"
  on public.publicaciones for select
  to authenticated
  using (
    organization_id = mi_organization_id()
    and (
      es_administrador()
      or exists (
        select 1 from public.kits k
        join public.propiedades p on p.id = k.propiedad_id
        where k.id = publicaciones.kit_id and p.captado_por = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------
-- EVENTOS_ANALITICA — Nivel 1, sección 10.2
-- ---------------------------------------------------------------------

create table if not exists public.eventos_analitica (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizaciones(id),
  publicacion_id uuid references public.publicaciones(id) on delete cascade,
  propiedad_id uuid references public.propiedades(id) on delete cascade,

  tipo_evento text not null check (tipo_evento in (
    'impresion', 'alcance', 'clic_whatsapp', 'clic_qr', 'guardado', 'tiempo_visualizacion', 'lead_generado'
  )),
  valor numeric,
  raw jsonb,
  ocurrido_en timestamptz not null default now()
);

create index if not exists idx_eventos_publicacion on public.eventos_analitica(publicacion_id);
create index if not exists idx_eventos_propiedad on public.eventos_analitica(propiedad_id);

alter table public.eventos_analitica enable row level security;

create policy "agente_ve_analitica_de_sus_propiedades"
  on public.eventos_analitica for select
  to authenticated
  using (
    organization_id = mi_organization_id()
    and (
      es_administrador()
      or exists (select 1 from public.propiedades p where p.id = eventos_analitica.propiedad_id and p.captado_por = auth.uid())
    )
  );
