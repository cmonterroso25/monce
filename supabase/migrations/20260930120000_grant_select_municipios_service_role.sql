-- El Worker (service_role) necesita resolver el nombre del municipio para
-- elegir la ubicación en Marketplace. Sin este permiso la consulta fallaba con
-- "permission denied for table municipios".
grant select on table public.municipios to service_role;
