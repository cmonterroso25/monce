-- ============================================================================
-- 20261020130000_comentarios_actividad_creado_por_nullable.sql
-- Permite creado_por nulo en comentarios_actividad: el agente de seguimiento
-- IA necesita registrar comentarios sin un usuario de auth real detrás.
-- perfiles.id tiene FK a auth.users, así que un "perfil sintético" exigiría
-- crear también un usuario de auth falso; en vez de eso se deja creado_por
-- nulo para estos comentarios (el frontend ya maneja creado_por nulo con un
-- texto de respaldo en src/app/dashboard/seguimientos/tarjeta-cita.tsx).
-- ============================================================================

-- service_role bypasa RLS por completo, así que la policy de insert para
-- "authenticated" (que exige creado_por = auth.uid()) no aplica a los
-- inserts del agente de seguimiento IA; no hace falta tocarla.
alter table comentarios_actividad alter column creado_por drop not null;
