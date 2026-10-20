-- ============================================================================
-- 20261020160000_seguimiento_ia_recurrente_y_firma.sql
-- Dos fases nuevas para el agente de seguimiento IA:
--   - seguimiento_recurrente: hub al que llegan todos los desenlaces que
--     dejan al lead en un estado no terminal SIN una actividad futura con
--     fecha ya agendada (reservo pendiente de gestionar, documentación en
--     revisión, "ninguno por ahora", etc.). Pregunta cada 24h si agendan
--     firma de contrato, se ganó, se perdió, o siguen esperando — sin
--     límite de reintentos mientras el lead no llegue a un estado terminal.
--   - resultado_firma: punto de entrada cuando se dispara una actividad
--     tipo firma_contrato (agregada a los tipos que sigue el cron).
-- ============================================================================

alter table seguimientos_ia drop constraint seguimientos_ia_fase_check;
alter table seguimientos_ia add constraint seguimientos_ia_fase_check
  check (fase in (
    'resultado_visita', 'reprogramar', 'ofrecer_siguiente_paso',
    'confirmar_reintento_24h', 'confirmar_envio_propiedades',
    'seguimiento_recurrente', 'resultado_firma'
  ));
