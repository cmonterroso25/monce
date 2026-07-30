alter table propiedades
  add column if not exists notificado_nueva_propiedad boolean not null default false;

comment on column propiedades.notificado_nueva_propiedad is
  'true una vez que se envió la notificación de "nueva propiedad" a WhatsApp (se dispara con la primera foto subida, no al crear el registro, para asegurar que la miniatura del enlace ya tenga imagen).';
