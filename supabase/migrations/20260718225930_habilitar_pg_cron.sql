-- pg_cron se habilitó en producción desde el dashboard de Supabase (Database
-- > Extensions), lo cual no genera migración automática. Esta migración
-- replica ese estado para que los entornos locales/nuevos también lo tengan
-- antes de que 20260718225933_timeout_informes_evaluacion.sql use cron.schedule().
create extension if not exists pg_cron with schema cron;
