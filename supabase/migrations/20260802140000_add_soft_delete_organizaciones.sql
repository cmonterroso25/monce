-- Borrado suave de organizaciones: en vez de eliminar la fila física
-- (que rompería 17 FKs distintas, incluyendo perfiles.organization_id
-- que es NOT NULL), se marca con eliminada_en y se filtra en la app.

BEGIN;

ALTER TABLE public.organizaciones
ADD COLUMN eliminada_en timestamptz;

COMMIT;
