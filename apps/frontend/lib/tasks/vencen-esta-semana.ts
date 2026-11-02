import { parseFechaSolo, toDateKey } from '@/lib/calendar/utils';
import type { MiTareaDTO } from '@/lib/services/users';

/**
 * MEJ-9: tareas sin terminar cuya fecha límite cae desde hoy hasta el domingo
 * de esta semana (semana de lunes a domingo), la más próxima primero.
 */
export function tareasQueVencenEstaSemana(tareas: MiTareaDTO[], hoy: Date = new Date()): MiTareaDTO[] {
  const diasHastaDomingo = (7 - hoy.getDay()) % 7;
  const domingo = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + diasHastaDomingo);
  const desde = toDateKey(hoy);
  const hasta = toDateKey(domingo);
  return tareas
    .filter((t): t is MiTareaDTO & { fechaLimite: string } => t.fechaLimite !== null && t.estadoTarea !== 'HECHO')
    .filter((t) => {
      const dia = toDateKey(parseFechaSolo(t.fechaLimite));
      return dia >= desde && dia <= hasta;
    })
    .sort((a, b) => toDateKey(parseFechaSolo(a.fechaLimite)).localeCompare(toDateKey(parseFechaSolo(b.fechaLimite))));
}
