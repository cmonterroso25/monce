export default function SelectorColegasActividad({
  colegas,
  seleccionados = [],
  claseEtiqueta = 'mb-1 block text-xs font-medium text-gray-600',
}: {
  colegas: { id: string; nombre: string }[]
  seleccionados?: string[]
  claseEtiqueta?: string
}) {
  return (
    <div>
      <input type="hidden" name="selector_colegas" value="1" />
      <label className={claseEtiqueta}>Colegas</label>
      {colegas.length === 0 ? (
        <p className="rounded border border-dashed border-gray-300 px-3 py-2 text-xs text-slate-400">
          No hay colegas registrados.
        </p>
      ) : (
        <div className="max-h-32 space-y-1 overflow-y-auto rounded border border-gray-300 bg-white p-2">
          {colegas.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="colegas_ids"
                value={c.id}
                defaultChecked={seleccionados.includes(c.id)}
              />
              <span className="truncate">{c.nombre}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
