-- Permisos que necesita el bucle del Worker (service_role).
grant select, insert, update on table public.nodos_worker to service_role;
grant select, insert, update on table public.intentos_publicacion to service_role;
grant select, insert on table public.logs_publicacion to service_role;
grant select, update on table public.trabajos_publicacion to service_role;
