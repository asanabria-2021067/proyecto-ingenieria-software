export interface HorasTemplateData {
  // MEJ-13: el avance de horas beca o extension del semestre va en riesgo.
  HORAS_EN_RIESGO: { tipos: ('beca' | 'extension')[] };
  // MEJ-60: tareas en progreso sin horas registradas en los ultimos 3 dias.
  RECORDATORIO_HORAS: { cantidad: number; taskTitle: string; taskId: number; projectId: number };
}

export const HORAS_TEMPLATES = {
  HORAS_EN_RIESGO: {
    title: 'Tus horas del semestre van atrasadas',
    message: (data: HorasTemplateData['HORAS_EN_RIESGO']) =>
      `Tu avance de ${data.tipos.map((t) => (t === 'beca' ? 'horas beca' : 'horas de extensión')).join(' y ')} está por debajo de lo esperado para esta altura del semestre. Revisa «Mis horas».`,
  },

  RECORDATORIO_HORAS: {
    title: 'Recuerda registrar tus horas',
    message: (data: HorasTemplateData['RECORDATORIO_HORAS']) =>
      data.cantidad === 1
        ? `Tu tarea "${data.taskTitle}" está en progreso y no has registrado horas en los últimos 3 días.`
        : `Tienes ${data.cantidad} tareas en progreso sin horas registradas en los últimos 3 días, entre ellas "${data.taskTitle}".`,
  },
} as const;
