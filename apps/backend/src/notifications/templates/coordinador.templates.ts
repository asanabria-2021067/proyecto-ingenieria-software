export interface CoordinadorTemplateData {
  ALCANCE_COORDINADOR: { carreras: string[]; facultades: string[] };
}

export const COORDINADOR_TEMPLATES = {
  ALCANCE_COORDINADOR: {
    title: 'Tu alcance como coordinador cambió',
    message: (data: CoordinadorTemplateData['ALCANCE_COORDINADOR']) => {
      const partes = [...data.facultades.map((f) => `facultad ${f}`), ...data.carreras];
      return partes.length === 0
        ? 'Administración te quitó el alcance de coordinación: ya no tienes carreras asignadas.'
        : `Administración te asignó como coordinador de: ${partes.join(', ')}.`;
    },
  },
} as const;
