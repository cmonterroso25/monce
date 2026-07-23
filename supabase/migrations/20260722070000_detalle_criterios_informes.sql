-- Almacena el desglose estructurado por criterio (consistencia de datos,
-- capacidad de pago, etc.) que ahora regresa Gemini, para poder mostrarlo
-- en el PDF del informe de forma detallada en vez de solo texto libre.
alter table informes_evaluacion
  add column if not exists detalle_criterios jsonb;
