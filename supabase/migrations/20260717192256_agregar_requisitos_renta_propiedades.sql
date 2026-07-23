-- Paquete de requisitos de renta aplicable a la propiedad.
-- El contenido completo de cada paquete (A/B/C) vive en la capa de aplicación:
-- src/app/dashboard/propiedades/requisitos-renta.ts
alter table propiedades
  add column if not exists requisitos_renta text
    check (requisitos_renta in ('A', 'B', 'C'));
