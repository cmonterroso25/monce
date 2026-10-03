-- Propiedad evaluada en cada informe. Nullable: los informes anteriores no la tienen.
alter table public.informes_evaluacion
  add column if not exists propiedad_id uuid references public.propiedades(id) on delete set null;

create index if not exists informes_evaluacion_propiedad_id_idx
  on public.informes_evaluacion (propiedad_id);
