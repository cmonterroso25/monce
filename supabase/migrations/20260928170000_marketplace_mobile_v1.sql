-- Meta quitó Título del formulario de escritorio "Nueva vivienda". El formulario
-- móvil (Firefox, modo adaptable Cmd+Opt+M) conserva: Categoría, ¿Qué vendes?
-- (título), Precio, Ubicación, Descripción y fotos. Se activa como superficie.
-- IMPORTANTE: solo una superficie activa por canal; la Edge Function toma la
-- primera activa (limit 1).
update superficies_canal
set activa = false
where codigo = 'desktop_web'
  and canal_id = (select id from canales_publicacion where codigo = 'facebook_marketplace');

update superficies_canal
set activa = true, version_adapter_actual = 'marketplace_mobile_v1'
where codigo = 'mobile_web'
  and canal_id = (select id from canales_publicacion where codigo = 'facebook_marketplace');

-- Categorías: venta -> "Viviendas en venta", renta -> "Alquileres", para todos los tipos.
insert into mapeos_categoria_canal (superficie_id, operacion, tipo_propiedad, ruta_categoria, version_adapter)
select sc.id, o.operacion, t.tipo, o.categoria, 'marketplace_mobile_v1'
from superficies_canal sc
join canales_publicacion c on c.id = sc.canal_id and c.codigo = 'facebook_marketplace'
cross join (values ('venta', 'Viviendas en venta'), ('renta', 'Alquileres')) as o(operacion, categoria)
cross join (values ('casa'), ('apartamento'), ('terreno'), ('bodega'),
                   ('oficina'), ('ofibodega'), ('finca'), ('granja')) as t(tipo)
where sc.codigo = 'mobile_web';

-- Campos requeridos antes de enviar al Worker.
insert into definiciones_campos_canal
  (superficie_id, version_adapter, clave_campo, etiqueta_externa, requerido, ruta_origen, orden)
select sc.id, 'marketplace_mobile_v1', v.clave_campo, v.etiqueta_externa, true, v.ruta_origen, v.orden
from superficies_canal sc
join canales_publicacion c on c.id = sc.canal_id and c.codigo = 'facebook_marketplace'
cross join (values
  ('categoria',   'Categoría',      'derivado.categoria',    1),
  ('titulo',      '¿Qué vendes?',   'propiedad.titulo',      2),
  ('precio',      'Precio',         'propiedad.precio',      3),
  ('ubicacion',   'Ubicación',      'propiedad.zona',        4),
  ('descripcion', 'Descripción',    'propiedad.descripcion', 5),
  ('fotos',       'Fotos',          'imagenes_propiedad',    6)
) as v(clave_campo, etiqueta_externa, ruta_origen, orden)
where sc.codigo = 'mobile_web';
