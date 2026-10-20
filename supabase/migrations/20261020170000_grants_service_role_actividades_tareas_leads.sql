-- ============================================================================
-- 20261020170000_grants_service_role_actividades_tareas_leads.sql
-- La migración 20260728232718 solo otorgó SELECT a service_role sobre
-- actividades/tareas/leads (entre otras), pero el agente de seguimiento IA
-- (Edge Functions con service role key) necesita además:
--   - insertar en actividades (agendar la siguiente cita/llamada/firma)
--   - insertar en tareas (recordatorios de seguimiento)
--   - actualizar leads.etapa (mover el lead en el Kanban)
-- Sin esto, moverEtapa/crearTarea/crearSiguienteActividad fallan en
-- silencio (capturado por el try/catch del webhook, que cierra el
-- seguimiento para revisión manual en vez de completar la acción).
-- ============================================================================

grant insert, update on actividades to service_role;
grant insert, update on tareas to service_role;
grant update on leads to service_role;
