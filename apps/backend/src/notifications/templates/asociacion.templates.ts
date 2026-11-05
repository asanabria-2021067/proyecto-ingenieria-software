export interface AsociacionTemplateData {
  // MEJ-161: aviso de la junta a los estudiantes de una lista filtrada.
  AVISO_ASOCIACION: { idAsociacion: number; nombreAsociacion: string; mensaje: string };
}

export const ASOCIACION_TEMPLATES = {
  AVISO_ASOCIACION: {
    title: (data: AsociacionTemplateData['AVISO_ASOCIACION']) => `Aviso de ${data.nombreAsociacion}`,
    message: (data: AsociacionTemplateData['AVISO_ASOCIACION']) => data.mensaje,
  },
} as const;
