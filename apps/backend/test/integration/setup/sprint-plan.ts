import { addDaysToDay, todayInGuatemala } from '../../../src/common/utils/guatemala-date';

/**
 * Fecha planeada de fin (`YYYY-MM-DD`) siempre válida para iniciar un Sprint:
 * relativa al día actual de Guatemala, así que nunca caduca. Por defecto 14
 * días, dentro de la ventana que exige `StartSprintDto` (posterior a hoy y a
 * lo sumo 90 días).
 */
export function plannedEndDate(daysFromToday = 14): string {
  return addDaysToDay(todayInGuatemala(), daysFromToday);
}
