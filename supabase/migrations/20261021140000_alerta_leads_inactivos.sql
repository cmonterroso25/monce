-- ============================================================================
-- 20261021140000_alerta_leads_inactivos.sql
-- Si un lead no terminal lleva 7+ días sin ningún cambio (leads.actualizado_en
-- se actualiza en cada moverEtapa o edición), Ben le pregunta al asesor
-- dueño qué ha pasado. alerta_inactividad_enviada_en evita reenviar la
-- misma alerta en cada corrida del cron (cada 15 min) — si el lead sigue
-- sin moverse, se vuelve a preguntar cada 7 días (nunca dos veces seguidas
-- por el mismo período de inactividad).
-- ============================================================================

alter table leads add column alerta_inactividad_enviada_en timestamptz;
