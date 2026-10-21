-- ============================================================================
-- 20261020190000_tareas_recordatorio_ia.sql
-- Las tareas que crea el agente de seguimiento IA (ej. "Llamar a X para
-- gestionar la reserva") hoy quedan como un simple pendiente visual en el
-- CRM, sin ningún aviso. Ben debe recordárselas al asesor por WhatsApp al
-- vencer la fecha límite, preguntando si ya se hizo, e insistir cada cierto
-- tiempo (sin límite) hasta que el asesor confirme — nunca se cierra sola.
--
-- recordatorio_proximo_en funciona igual que seguimientos_ia.proximo_reintento_en:
-- se siembra con la fecha_limite de la tarea al crearla, y cada envío la
-- recorre +4h. recordatorio_proximo_en = null funciona como "lock" mientras
-- se procesa una respuesta entrante (evita reprocesar reentregas de Green
-- API) y también como señal de "ciclo cerrado" una vez la tarea se marca
-- completada.
-- ============================================================================

alter table tareas
  add column creado_por_ia boolean not null default false,
  add column recordatorio_chat_id text,
  add column recordatorio_green_api_message_id text,
  add column recordatorio_proximo_en timestamptz,
  add column recordatorio_enviado_en timestamptz;

create index idx_tareas_recordatorio_cron
  on tareas(recordatorio_proximo_en)
  where creado_por_ia = true and estado = 'pendiente';

create index idx_tareas_recordatorio_chat
  on tareas(recordatorio_chat_id)
  where creado_por_ia = true and estado = 'pendiente';
