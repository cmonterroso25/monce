export type CampoArchivo = { key: string; label: string }

export const CAMPOS_TITULAR: CampoArchivo[] = [
  { key: 'titular_constancia_laboral', label: 'Constancia laboral (titular)' },
  { key: 'titular_estados_cuenta', label: 'Estados de cuenta (titular)' },
  { key: 'titular_dpi', label: 'DPI (titular)' },
  { key: 'titular_infornet', label: 'Infornet (titular)' },
]

export const CAMPOS_FIADOR: CampoArchivo[] = [
  { key: 'fiador_constancia_laboral', label: 'Constancia laboral (fiador)' },
  { key: 'fiador_estados_cuenta', label: 'Estados de cuenta (fiador)' },
  { key: 'fiador_dpi', label: 'DPI (fiador)' },
  { key: 'fiador_infornet', label: 'Infornet (fiador)' },
]

export const CAMPOS_DOCUMENTOS_INFORME: CampoArchivo[] = [...CAMPOS_TITULAR, ...CAMPOS_FIADOR]
