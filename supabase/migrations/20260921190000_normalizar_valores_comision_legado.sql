-- Normaliza valores legados del campo `comision` en `propiedades` al nuevo
-- formato de opciones fijas por tipo de operacion (ver
-- formulario-nueva-propiedad.tsx / formulario-editar-propiedad.tsx):
--   Renta:  'Primera renta' -> '100%'
--   Renta:  '1/2 renta'     -> '50%'
--   Venta:  '2.5'           -> '2.5%'
update propiedades set comision = '100%' where comision = 'Primera renta';
update propiedades set comision = '50%' where comision = '1/2 renta';
update propiedades set comision = '2.5%' where comision = '2.5';
