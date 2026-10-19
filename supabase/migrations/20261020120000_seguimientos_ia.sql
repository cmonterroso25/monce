-- ============================================================================
-- 20261020120000_seguimientos_ia.sql
-- Estado de la conversación de seguimiento por WhatsApp entre el agente de
-- IA y el asesor, una fila por actividad (cita/llamada) bajo seguimiento.
-- ============================================================================

create table seguimientos_ia (
  id                   uuid primary key default gen_random_uuid(),
  actividad_id         uuid not null references actividades(id) on delete cascade,
  lead_id              uuid not null references leads(id) on delete cascade,
  agente_id            uuid not null references perfiles(id),
  organization_id      uuid not null default organizacion_por_defecto() references organizaciones(id),

  fase                 text not null check (fase in (
                          'resultado_visita', 'reprogramar', 'ofrecer_siguiente_paso'
                        )),
  estado               text not null default 'pendiente'
                          check (estado in ('pendiente', 'respondido', 'cerrado', 'vencido')),
  -- true cuando ya se pidió una aclaración en esta fase (fecha/resultado
  -- ambiguo) y se está esperando la segunda respuesta. Si la segunda
  -- respuesta sigue sin ser clara, se cierra para revisión manual en vez
  -- de insistir una tercera vez.
  es_reintento_aclaracion boolean not null default false,

  pregunta_texto       text not null,
  chat_id_asesor       text not null,
  green_api_message_id text,

  intento              int not null default 1,
  proximo_reintento_en timestamptz,

  respuesta_texto      text,
  respondido_en        timestamptz,

  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now()
);

-- Solo una conversación abierta por actividad a la vez (evita que el cron
-- duplique el envío de la pregunta inicial si corre dos veces por error).
create unique index idx_seguimientos_ia_actividad_pendiente
  on seguimientos_ia(actividad_id)
  where estado = 'pendiente';

create index idx_seguimientos_ia_cron_reintentos
  on seguimientos_ia(estado, proximo_reintento_en)
  where estado = 'pendiente';

create index idx_seguimientos_ia_chat_id
  on seguimientos_ia(chat_id_asesor, estado);

create index idx_seguimientos_ia_lead_id
  on seguimientos_ia(lead_id);

alter table seguimientos_ia enable row level security;

-- Bitácora de solo lectura para administradores (igual que comentarios_actividad).
-- Toda escritura es vía service role desde las Edge Functions, no hay policy
-- de insert/update para "authenticated".
create policy "Administradores ven seguimientos de IA"
on seguimientos_ia
for select
to authenticated
using (es_administrador());

grant select, insert, update on seguimientos_ia to service_role;
