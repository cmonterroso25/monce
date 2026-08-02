-- Cambia el rol de las políticas de informes_evaluacion de `public`
-- (incluye anon) a `authenticated`, igual que el resto del schema.

BEGIN;

ALTER POLICY "Agente ve informes de sus leads" ON public.informes_evaluacion
TO authenticated;

ALTER POLICY "Agente crea informes de sus leads" ON public.informes_evaluacion
TO authenticated;

ALTER POLICY "Admin gestiona informes" ON public.informes_evaluacion
TO authenticated;

COMMIT;

-- Verificación (las 3 filas deben mostrar {authenticated}):
-- SELECT policyname, roles FROM pg_policies WHERE tablename = 'informes_evaluacion';
