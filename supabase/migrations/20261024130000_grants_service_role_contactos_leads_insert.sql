-- ============================================================================
-- 20261024130000_grants_service_role_contactos_leads_insert.sql
-- Ben (asistente IA, Edge Functions con service role key) ahora puede
-- registrar un contacto + lead nuevo por WhatsApp (crear_lead). Hasta ahora
-- nunca había necesitado insertar en contactos, y en leads solo actualizaba
-- la etapa (ver 20261020170000_grants_service_role_actividades_tareas_leads.sql).
-- Sin esto, crearLeadDesdeAsistente falla con 42501 (permission denied).
-- ============================================================================

grant insert on contactos to service_role;
grant insert on leads to service_role;
