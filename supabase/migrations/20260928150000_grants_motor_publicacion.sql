-- service_role (Edge Function y futuro Worker) necesita acceso completo a las
-- tablas del motor: no heredan permisos por defecto en este proyecto.
grant select, insert, update, delete on
  canales_publicacion,
  superficies_canal,
  definiciones_campos_canal,
  mapeos_categoria_canal,
  nodos_worker,
  cuentas_sociales,
  solicitudes_publicacion,
  trabajos_publicacion,
  contenido_publicacion,
  activos_publicacion,
  intentos_publicacion,
  logs_publicacion,
  circuito_publicacion
to service_role;

-- TRUNCATE no está sujeto a RLS: un usuario autenticado no debe tenerlo.
revoke truncate on
  canales_publicacion,
  superficies_canal,
  definiciones_campos_canal,
  mapeos_categoria_canal,
  nodos_worker,
  cuentas_sociales,
  solicitudes_publicacion,
  trabajos_publicacion,
  contenido_publicacion,
  activos_publicacion,
  intentos_publicacion,
  logs_publicacion,
  circuito_publicacion
from authenticated, anon;
