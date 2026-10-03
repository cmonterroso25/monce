-- El PDF debe mostrar la propiedad que se evaluó en el informe. Los informes
-- anteriores (propiedad_id nulo) siguen usando la propiedad del lead.
create or replace function public.informe_obtener_contexto_pdf(p_informe_id uuid)
 returns table(informe_id uuid, lead_id uuid, contacto_id uuid, creado_en timestamp with time zone, candidato_nombre text, propiedad_titulo text, tipo_operacion text, precio numeric, moneda text, agente_nombre text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select
    i.id,
    i.lead_id,
    i.contacto_id,
    i.creado_en,
    c.nombre_completo,
    p.titulo,
    p.tipo_operacion,
    p.precio,
    p.moneda,
    ag.nombre_completo
  from informes_evaluacion i
  left join contactos c on c.id = i.contacto_id
  left join leads l on l.id = i.lead_id
  left join propiedades p on p.id = coalesce(i.propiedad_id, l.propiedad_id)
  left join perfiles ag on ag.id = l.agente_id
  where i.id = p_informe_id;
$function$;
