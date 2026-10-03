import type { PropiedadEnviada } from '@/lib/propiedades-enviadas'

const ETIQUETAS_CANAL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  instagram: 'Instagram',
  tiktok: 'TikTok',
}

export default function SelectorPropiedadesVisita({
  opciones,
  seleccionadas = [],
}: {
  opciones: PropiedadEnviada[]
  seleccionadas?: string[]
}) {
  return (
    <div>
      <input type="hidden" name="selector_propiedades" value="1" />
      <label className="mb-1 block text-xs font-medium text-gray-600">
        Propiedades a visitar (enviadas a este contacto)
      </label>
      {opciones.length === 0 ? (
        <p className="rounded border border-dashed border-gray-300 px-3 py-2 text-xs text-slate-400">
          Este contacto aún no tiene propiedades enviadas. Usa &quot;Buscar coincidencias&quot; en el contacto y
          comparte una propiedad.
        </p>
      ) : (
        <div className="max-h-48 space-y-1 overflow-y-auto rounded border border-gray-300 bg-white p-2">
          {opciones.map((o) => (
            <label key={o.id} className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="propiedades_ids"
                value={o.id}
                defaultChecked={seleccionadas.includes(o.id)}
                className="mt-1"
              />
              <span className="min-w-0">
                <span className="block truncate">
                  {o.codigo ? `${o.codigo} · ` : ''}
                  {o.titulo}
                </span>
                <span className="block text-[10px] text-slate-400">
                  Enviada por {o.canales.map((c) => ETIQUETAS_CANAL[c] ?? c).join(', ')}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
