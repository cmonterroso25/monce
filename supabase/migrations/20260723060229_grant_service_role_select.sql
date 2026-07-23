-- Otorga SELECT a service_role sobre las tablas que el endpoint
-- /api/webhooks/informe-resultado consulta con supabaseAdmin (service role
-- key) para enriquecer el PDF del informe de evaluación. service_role
-- bypasea RLS pero NO bypasea GRANTs de tabla: sin estos permisos
-- explícitos, las consultas fallan con "permission denied" (42501) y,
-- al no capturarse el error en el código, el informe se genera con todos
-- los campos de enriquecimiento en "N/D" sin ningún error visible.
grant select on public.contactos to service_role;
grant select on public.leads to service_role;
grant select on public.perfiles to service_role;
grant select on public.propiedades to service_role;
