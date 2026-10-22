-- ============================================================================
-- 20261021130000_recordatorios_cita_asesor.sql
-- Recordatorio por WhatsApp al asesor que CUBRE la cita (actividades.agente_id),
-- 24h y 2h antes de que ocurra — hoy no existía ningún recordatorio real
-- antes de la cita (solo quedó documentado en un comentario de columna,
-- nunca implementado; y el único intento parcial, al cliente, no tiene
-- cron que lo dispare — fuera de alcance por ahora, no se toca).
--
-- *_enviado_en nulo = pendiente de enviar; se siembra con el timestamp real
-- de envío para no reenviar en cada corrida del cron (cada 15 min). Si la
-- cita se reprograma, src/app/dashboard/leads/acciones.ts (actualizarActividad)
-- debe resetear ambos campos a null para que el recordatorio se recalcule
-- sobre la nueva fecha.
-- ============================================================================

alter table actividades
  add column recordatorio_agente_24h_enviado_en timestamptz,
  add column recordatorio_agente_2h_enviado_en timestamptz;

create index idx_actividades_recordatorio_agente
  on actividades(programada_en)
  where completada_en is null;
