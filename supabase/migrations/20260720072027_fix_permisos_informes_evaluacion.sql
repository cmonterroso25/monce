-- El rol service_role no tenía GRANT explícito de SELECT/UPDATE sobre
-- informes_evaluacion, causando "permission denied for table
-- informes_evaluacion" (código 42501) al intentar actualizar el informe
-- desde el endpoint de callback de n8n (/api/webhooks/informe-resultado).
-- Esto es un permiso de PostgreSQL a nivel de tabla, distinto de RLS.
GRANT SELECT, UPDATE ON public.informes_evaluacion TO service_role;
