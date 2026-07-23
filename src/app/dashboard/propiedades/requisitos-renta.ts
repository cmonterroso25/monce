export type CodigoRequisitosRenta = 'A' | 'B' | 'C'

export type PaqueteRequisitosRenta = {
  etiqueta: string
  titular: string[]
  fiador: string[]
  contratoMinimo: string
  deposito: string
}

export const REQUISITOS_RENTA: Record<CodigoRequisitosRenta, PaqueteRequisitosRenta> = {
  A: {
    etiqueta: 'Requisitos A',
    titular: [
      'Constancia laboral de ingresos',
      '3 últimos estados de cuenta',
      'Copia del DPI de ambos lados',
      'Antecedentes penales y policiacos vigentes',
    ],
    fiador: [
      'Constancia laboral de ingresos',
      '3 últimos estados de cuenta',
      'Copia del DPI de ambos lados',
    ],
    contratoMinimo: '1 año',
    deposito: 'Equivalente a una renta',
  },
  B: {
    etiqueta: 'Requisitos B',
    titular: [
      'Constancia laboral de ingresos',
      '3 últimos estados de cuenta',
      'Copia del DPI de ambos lados',
      'Revisión en Infornet',
    ],
    fiador: [
      'Constancia laboral de ingresos',
      '3 últimos estados de cuenta',
      'Copia del DPI de ambos lados',
    ],
    contratoMinimo: '1 año',
    deposito: 'Equivalente a una renta',
  },
  C: {
    etiqueta: 'Requisitos C',
    titular: [
      'Constancia laboral de ingresos',
      '3 últimos estados de cuenta',
      'Copia del DPI de ambos lados',
      'Revisión en Infornet',
    ],
    fiador: [
      'Constancia laboral de ingresos',
      '3 últimos estados de cuenta',
      'Copia del DPI de ambos lados',
      'Revisión en Infornet',
    ],
    contratoMinimo: '1 año',
    deposito: 'Equivalente a una renta',
  },
}

export const OPCIONES_REQUISITOS_RENTA: CodigoRequisitosRenta[] = ['A', 'B', 'C']
