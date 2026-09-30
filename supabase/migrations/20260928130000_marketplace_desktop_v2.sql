-- Meta eliminó el campo Título del formulario de escritorio "Nueva vivienda".
-- Se crea la versión v2 del adapter (sin titulo) y se activa. Además corrige
-- que version_adapter_actual estaba NULL, lo que dejaba la validación vacía.
insert into definiciones_campos_canal
  (superficie_id, version_adapter, clave_campo, etiqueta_externa, requerido, ruta_origen, orden)
select superficie_id, 'marketplace_desktop_v2', clave_campo, etiqueta_externa, requerido, ruta_origen, orden
from definiciones_campos_canal
where version_adapter = 'marketplace_desktop_v1'
  and clave_campo <> 'titulo';

update superficies_canal
set version_adapter_actual = 'marketplace_desktop_v2'
where codigo = 'desktop_web'
  and canal_id = (select id from canales_publicacion where codigo = 'facebook_marketplace');
