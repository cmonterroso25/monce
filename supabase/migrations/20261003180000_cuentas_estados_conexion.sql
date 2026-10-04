-- Estados nuevos para conectar la sesión de Facebook desde el CRM:
-- CONNECT_REQUESTED: el asesor pidió conectar; el Worker aún no la toma.
-- CONNECTING: el Worker abrió la ventana de inicio de sesión.
alter table cuentas_sociales drop constraint if exists cuentas_sociales_estado_check;
alter table cuentas_sociales add constraint cuentas_sociales_estado_check
  check (estado in (
    'PENDING_SETUP', 'AUTH_REQUIRED', 'READY', 'BUSY', 'LOCKED', 'DISABLED', 'ERROR',
    'CONNECT_REQUESTED', 'CONNECTING'
  ));
