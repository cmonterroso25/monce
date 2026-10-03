-- Nuevo canal 'manual': la propiedad se marcó como notificada sin enviarse desde el CRM.
-- Se busca el CHECK de canal por catálogo para no depender de su nombre autogenerado.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.envios_propiedad_contacto'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%canal%'
  loop
    execute format('alter table public.envios_propiedad_contacto drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.envios_propiedad_contacto
  add constraint envios_propiedad_contacto_canal_check
  check (canal in ('whatsapp','messenger','instagram','tiktok','manual'));
