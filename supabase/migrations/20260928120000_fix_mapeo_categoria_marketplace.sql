-- Los valores reales de propiedades.tipo_operacion son 'venta' | 'renta'
-- (no 'alquiler'), y 'condominio' no existe en TIPOS_PROPIEDAD.
update mapeos_categoria_canal
set operacion = 'renta'
where operacion = 'alquiler';

delete from mapeos_categoria_canal
where tipo_propiedad = 'condominio';
