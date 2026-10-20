-- ============================================================================
-- 20261020150000_seguimiento_ia_ajustes.sql
-- Ajustes al agente de seguimiento IA tras pruebas manuales:
--   - Nuevas fases: confirmar_reintento_24h (cuando no quieren reprogramar
--     ahora, pero sí que se les consulte de nuevo en 24h) y
--     confirmar_envio_propiedades (seguimiento de un recordatorio de enviar
--     más opciones al cliente).
--   - contacto_id denormalizado: varios mensajes de seguimiento necesitan
--     el nombre del contacto sin tener que volver a unir con actividades
--     cada vez.
-- ============================================================================

alter table seguimientos_ia drop constraint seguimientos_ia_fase_check;
alter table seguimientos_ia add constraint seguimientos_ia_fase_check
  check (fase in (
    'resultado_visita', 'reprogramar', 'ofrecer_siguiente_paso',
    'confirmar_reintento_24h', 'confirmar_envio_propiedades'
  ));

alter table seguimientos_ia add column contacto_id uuid references contactos(id);
