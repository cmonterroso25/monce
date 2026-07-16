insert into organizaciones (nombre)
select 'Inmobiliaria Monce'
where not exists (
  select 1 from organizaciones where nombre = 'Inmobiliaria Monce'
);
