-- =====================================================================
-- Siembra: campos requeridos por §24 del documento base para
-- facebook_marketplace / desktop_web / marketplace_desktop_v1.
--
-- Esto es lo que usa el Publication Engine (Edge Function) para decidir
-- "NO ENVIAR AL WORKER" si falta un dato obligatorio, antes de gastar
-- un ciclo de Chromium.
-- =====================================================================
insert into definiciones_campos_canal (superficie_id, version_adapter, clave_campo, etiqueta_externa, requerido, ruta_origen, orden)
select sc.id, 'marketplace_desktop_v1', v.clave_campo, v.etiqueta_externa, true, v.ruta_origen, v.orden
from superficies_canal sc
join canales_publicacion c on c.id = sc.canal_id and c.codigo = 'facebook_marketplace'
join (values
  ('titulo',      'Título',      'propiedad.titulo',       1),
  ('precio',      'Precio',      'propiedad.precio',       2),
  ('categoria',   'Categoría',   'derivado.categoria',     3),
  ('ubicacion',   'Ubicación',   'propiedad.zona',          4),
  ('descripcion', 'Descripción', 'propiedad.descripcion',  5),
  ('fotos',       'Fotos',       'imagenes_propiedad',     6)
) as v(clave_campo, etiqueta_externa, ruta_origen, orden) on true
where sc.codigo = 'desktop_web';
