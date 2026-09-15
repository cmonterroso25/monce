alter table documentos
  add column informe_id uuid references informes_evaluacion(id) on delete set null;

create index if not exists documentos_informe_id_idx on documentos (informe_id);
