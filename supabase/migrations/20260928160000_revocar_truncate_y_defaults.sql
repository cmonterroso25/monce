-- TRUNCATE no pasa por RLS. anon/authenticated no lo necesitan en ninguna tabla.
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke truncate on public.%I from anon, authenticated', t.tablename);
  end loop;
end $$;

-- Tablas futuras creadas por el rol que corre las migraciones: service_role
-- ya nace con acceso de lectura/escritura (las tablas nuevas no lo heredan).
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
