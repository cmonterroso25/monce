-- Corrige que las políticas de agente en `documentos` comparaban
-- tipo_relacionado = 'lead', pero el CHECK de la tabla usa 'negocio'.
-- Esa rama nunca se activaba para agentes no-admin.

BEGIN;

ALTER POLICY "Agente ve documentos de lo suyo" ON public.documentos
USING (
  (organization_id = mi_organization_id())
  AND (
    ((tipo_relacionado = 'propiedad'::text) AND (EXISTS (
      SELECT 1 FROM propiedades p
      WHERE p.id = documentos.id_relacionado AND p.captado_por = auth.uid()
    )))
    OR ((tipo_relacionado = 'contacto'::text) AND (EXISTS (
      SELECT 1 FROM contactos c
      WHERE c.id = documentos.id_relacionado AND c.agente_asignado = auth.uid()
    )))
    OR ((tipo_relacionado = 'negocio'::text) AND (EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = documentos.id_relacionado AND l.agente_id = auth.uid()
    )))
  )
);

ALTER POLICY "Agente sube documentos de lo suyo" ON public.documentos
WITH CHECK (
  (organization_id = mi_organization_id())
  AND (
    ((tipo_relacionado = 'propiedad'::text) AND (EXISTS (
      SELECT 1 FROM propiedades p
      WHERE p.id = documentos.id_relacionado AND p.captado_por = auth.uid()
    )))
    OR ((tipo_relacionado = 'contacto'::text) AND (EXISTS (
      SELECT 1 FROM contactos c
      WHERE c.id = documentos.id_relacionado AND c.agente_asignado = auth.uid()
    )))
    OR ((tipo_relacionado = 'negocio'::text) AND (EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = documentos.id_relacionado AND l.agente_id = auth.uid()
    )))
  )
);

ALTER POLICY "Agente borra documentos de lo suyo" ON public.documentos
USING (
  (organization_id = mi_organization_id())
  AND (
    ((tipo_relacionado = 'propiedad'::text) AND (EXISTS (
      SELECT 1 FROM propiedades p
      WHERE p.id = documentos.id_relacionado AND p.captado_por = auth.uid()
    )))
    OR ((tipo_relacionado = 'contacto'::text) AND (EXISTS (
      SELECT 1 FROM contactos c
      WHERE c.id = documentos.id_relacionado AND c.agente_asignado = auth.uid()
    )))
    OR ((tipo_relacionado = 'negocio'::text) AND (EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = documentos.id_relacionado AND l.agente_id = auth.uid()
    )))
  )
);

COMMIT;

-- Verificación (debe devolver 0 filas):
-- SELECT id, tipo_relacionado FROM documentos
-- WHERE tipo_relacionado NOT IN ('propiedad','contacto','negocio');
