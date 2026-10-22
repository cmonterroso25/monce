-- ============================================================================
-- 20261021120000_asistente_ia_general.sql
-- Expansión de Ben a "asistente inmobiliario interno": consultas de leads/
-- citas, búsqueda de propiedades y creación de tareas por WhatsApp, fuera
-- del árbol de fases de seguimiento de citas (seguimientos_ia).
--
-- asistente_ia_pendientes: una aclaración de fecha de "crear_tarea" en
-- curso (no puede reusar seguimientos_ia porque esa tabla exige
-- actividad_id/lead_id not null, y esta conversación no está ligada a
-- ninguna cita).
-- asistente_ia_mensajes_procesados: dedup de reentregas de Green API para
-- turnos que SÍ resuelven todo en el primer mensaje (sin fila previa que
-- reclamar vía CAS, a diferencia del flujo de citas).
-- ============================================================================

create table asistente_ia_pendientes (
  id                   uuid primary key default gen_random_uuid(),
  chat_id_asesor       text not null,
  perfil_id            uuid not null references perfiles(id),
  organization_id      uuid not null default organizacion_por_defecto() references organizaciones(id),
  intencion            text not null check (intencion in ('crear_tarea')),
  contexto             jsonb not null,
  pregunta_texto       text not null,
  green_api_message_id text,
  estado               text not null default 'pendiente'
                          check (estado in ('pendiente', 'respondido', 'cerrado')),
  creado_en            timestamptz not null default now(),
  actualizado_en       timestamptz not null default now()
);

create unique index idx_asistente_ia_pendientes_chat_pendiente
  on asistente_ia_pendientes(chat_id_asesor)
  where estado = 'pendiente';

alter table asistente_ia_pendientes enable row level security;

create policy "Administradores ven pendientes del asistente IA"
on asistente_ia_pendientes
for select
to authenticated
using (es_administrador());

grant select, insert, update on asistente_ia_pendientes to service_role;

create table asistente_ia_mensajes_procesados (
  id                   uuid primary key default gen_random_uuid(),
  green_api_message_id text not null unique,
  creado_en            timestamptz not null default now()
);

alter table asistente_ia_mensajes_procesados enable row level security;

create policy "Administradores ven mensajes procesados del asistente IA"
on asistente_ia_mensajes_procesados
for select
to authenticated
using (es_administrador());

grant select, insert on asistente_ia_mensajes_procesados to service_role;
