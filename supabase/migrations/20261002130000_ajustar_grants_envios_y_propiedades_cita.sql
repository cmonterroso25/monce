-- Las tablas nuevas heredaron los privilegios por defecto de Supabase.
-- TRUNCATE no pasa por RLS, y anon no debe tocar estas tablas.
revoke all on public.envios_propiedad_contacto from anon, authenticated;
revoke all on public.actividad_propiedades from anon, authenticated;

-- Solo lo que las políticas RLS realmente permiten.
grant select, insert on public.envios_propiedad_contacto to authenticated;
grant select, insert, delete on public.actividad_propiedades to authenticated;

revoke truncate, references, trigger on public.envios_propiedad_contacto from service_role;
revoke truncate, references, trigger on public.actividad_propiedades from service_role;
