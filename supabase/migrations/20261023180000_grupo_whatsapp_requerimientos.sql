-- ============================================================================
-- 20261023180000_grupo_whatsapp_requerimientos.sql
-- Nuevo grupo de WhatsApp dedicado para avisos de "Requerimientos" (distinto
-- del grupo de citas) — mismo patrón que whatsapp_grupo_ventas/rentas/citas.
-- Queda null hasta que se agregue el número de Ben al grupo real
-- "Requerimientos y avisos MONCE" y se pueda obtener su chatId.
-- ============================================================================

alter table organizaciones add column whatsapp_grupo_requerimientos text;
