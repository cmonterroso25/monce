-- ============================================================================
-- whatsapp_notificaciones_grupos.sql
-- Soporte para notificaciones a grupos de WhatsApp (Ventas, Rentas, Citas)
-- y recordatorios internos al agente, vía Green API + Supabase Edge Functions.
-- Reemplaza la automatización que iba a vivir en n8n/VPS.
-- ============================================================================

alter table organizaciones
  add column if not exists whatsapp_grupo_ventas text,
  add column if not exists whatsapp_grupo_rentas text,
  add column if not exists whatsapp_grupo_citas  text;

-- Cargar los chatId reales de Green API para la organización actual
-- (mono-tenant por ahora, vía organizacion_por_defecto()).
update organizaciones
set
  whatsapp_grupo_ventas = '120363410877338314@g.us',
  whatsapp_grupo_rentas = '120363429648077427@g.us',
  whatsapp_grupo_citas  = '120363425913308556@g.us'
where id = organizacion_por_defecto();

alter table notificaciones_whatsapp
  add column if not exists chat_id           text,
  add column if not exists tipo_notificacion text,
  add column if not exists agente_id         uuid references perfiles(id);

comment on column notificaciones_whatsapp.chat_id is
  'Chat ID completo de Green API (@c.us individual o @g.us grupo). Si está presente, se usa directo y se ignora "telefono".';
comment on column notificaciones_whatsapp.tipo_notificacion is
  'Ej: recordatorio_cliente, recordatorio_agente_24h, recordatorio_agente_2h, nueva_propiedad, cambio_propiedad, propiedad_no_disponible, nueva_cita, cambio_cita.';

alter table notificaciones_whatsapp
  add constraint notificaciones_whatsapp_destino_check
  check (telefono is not null or chat_id is not null);

create index if not exists idx_notificaciones_whatsapp_pendientes
  on notificaciones_whatsapp (programado_para)
  where enviado = false;

-- El proyecto ya tiene precedente de otorgar GRANTs explícitos a
-- service_role (ver 20260716225444 y 20260723060229). Se sigue el mismo
-- patrón para que las Edge Functions (que usan la service role key)
-- puedan leer/escribir lo que necesitan.
grant select, insert, update on notificaciones_whatsapp to service_role;
grant select on organizaciones, propiedades, actividades, tareas, perfiles, contactos to service_role;
