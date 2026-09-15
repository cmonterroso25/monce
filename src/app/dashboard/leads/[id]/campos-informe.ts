export type CampoArchivo = { key: string; label: string }

export const CAMPOS_TITULAR: CampoArchivo[] = [
  { key: 'titular_constancia_laboral', label: 'Constancia laboral (titular)' },
  { key: 'titular_estados_cuenta', label: 'Estados de cuenta (titular)' },
  { key: 'titular_dpi', label: 'DPI (titular)' },
  { key: 'titular_infornet', label: 'Infornet (titular)' },
  { key: 'titular_antecedentes_penales', label: 'Antecedentes penales (titular)' },
  { key: 'titular_antecedentes_policiacos', label: 'Antecedentes policiacos (titular)' },
  { key: 'titular_renas', label: 'RENAS (titular)' },
  { key: 'titular_sib', label: 'SIB (titular)' },
  { key: 'titular_rtu', label: 'RTU (titular)' },
  { key: 'titular_patente_comercio', label: 'Patente de comercio (titular)' },
  { key: 'titular_otros', label: 'Otros documentos (titular)' },
]

export const CAMPOS_FIADOR: CampoArchivo[] = [
  { key: 'fiador_constancia_laboral', label: 'Constancia laboral (fiador)' },
  { key: 'fiador_estados_cuenta', label: 'Estados de cuenta (fiador)' },
  { key: 'fiador_dpi', label: 'DPI (fiador)' },
  { key: 'fiador_infornet', label: 'Infornet (fiador)' },
  { key: 'fiador_antecedentes_penales', label: 'Antecedentes penales (fiador)' },
  { key: 'fiador_antecedentes_policiacos', label: 'Antecedentes policiacos (fiador)' },
  { key: 'fiador_rtu', label: 'RTU (fiador)' },
  { key: 'fiador_patente_comercio', label: 'Patente de comercio (fiador)' },
  { key: 'fiador_otros', label: 'Otros documentos (fiador)' },
]

export const CAMPOS_DOCUMENTOS_INFORME: CampoArchivo[] = [...CAMPOS_TITULAR, ...CAMPOS_FIADOR]
