-- ============================================================================
-- 20261023120000_mapeo_categoria_local_edificio.sql
-- "Local" y "Edificio" se agregaron a TIPOS_PROPIEDAD y al CHECK de
-- propiedades.tipo_propiedad (20261022120000) pero nunca se agregaron a
-- mapeos_categoria_canal, que el motor de publicación usa para resolver la
-- categoría de Facebook Marketplace antes de encolar un trabajo. Sin fila
-- ahí, cualquier propiedad de esos dos tipos falla la validación con
-- "Faltan campos obligatorios en la propiedad: Categoría." (confirmado con
-- el trabajo real 7fd461d2 de un local en renta).
--
-- Mismo criterio que el resto de tipos ya mapeados (bodega, oficina,
-- ofibodega, terreno, etc.): no existe una categoría comercial separada en
-- este mapeo, todo cae en las dos rutas genéricas según operación.
-- Solo se agrega al adapter activo (marketplace_mobile_v1); los adapters
-- de desktop están inactivos y ya tenían cobertura incompleta antes de
-- este cambio, así que no se tocan aquí.
-- ============================================================================

insert into mapeos_categoria_canal (superficie_id, operacion, tipo_propiedad, ruta_categoria, version_adapter)
select sc.id, v.operacion, v.tipo_propiedad, v.ruta_categoria, 'marketplace_mobile_v1'
from superficies_canal sc
join canales_publicacion c on c.id = sc.canal_id and c.codigo = 'facebook_marketplace'
join (values
  ('venta', 'local',    'Viviendas en venta'),
  ('venta', 'edificio', 'Viviendas en venta'),
  ('renta', 'local',    'Alquileres'),
  ('renta', 'edificio', 'Alquileres')
) as v(operacion, tipo_propiedad, ruta_categoria) on true
where sc.codigo = 'mobile_web'
on conflict (superficie_id, operacion, tipo_propiedad, version_adapter) do nothing;
