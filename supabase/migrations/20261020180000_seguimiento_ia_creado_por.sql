-- ============================================================================
-- 20261020180000_seguimiento_ia_creado_por.sql
-- Un asesor puede agendar una cita y otro cubrirla (actividades.agente_id ya
-- es "quien atiende/cubre"; actividades.creado_por es "quien la registró").
-- Ben ya le pregunta siempre al que cubre (agente_id). Esta columna permite
-- que, además, se le mande un resumen cálido al que agendó (creado_por)
-- cada vez que el lead cambia de etapa, sin tener que volver a consultar
-- "actividades" en cada paso del seguimiento.
-- ============================================================================

alter table seguimientos_ia add column creado_por uuid references perfiles(id);
