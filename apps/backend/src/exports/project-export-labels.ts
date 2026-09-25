import { EstadoParticipacion, TipoProyecto } from '@prisma/client';
import { TeamMemberGroup } from '../team/dto/team-summary-member.dto';

/**
 * T-259/T-260 (HU-164, decisión del líder de proyecto, 2026-09-17): el tipo
 * de proyecto (beca/experiencia/extensión) es un atributo del PROYECTO
 * completo, no de cada integrante — no existe una columna que "separe" beca
 * de extensión por persona dentro de un mismo proyecto. Se muestra como
 * dato de cabecera del reporte; compartido por CSV y PDF para que ambos
 * digan lo mismo.
 */
export function formatTipoProyecto(tipo: TipoProyecto): string {
  switch (tipo) {
    case TipoProyecto.ACADEMICO_HORAS_BECA:
      return 'Académico (horas de beca)';
    case TipoProyecto.ACADEMICO_EXPERIENCIA:
      return 'Académico (experiencia)';
    case TipoProyecto.EXTRACURRICULAR_EXTENSION:
      return 'Extracurricular (extensión)';
  }
}

export function formatEstadoParticipacion(estado: EstadoParticipacion): string {
  switch (estado) {
    case EstadoParticipacion.ACTIVO:
      return 'Activo';
    case EstadoParticipacion.RETIRADO:
      return 'Retirado';
    case EstadoParticipacion.COMPLETADO:
      return 'Completado';
  }
}

export function formatGrupoMiembro(grupo: TeamMemberGroup): string {
  switch (grupo) {
    case 'ACTIVOS':
      return 'Activo';
    case 'RETIRADOS_CON_CONTRIBUCION':
      return 'Retirado (con contribución)';
    case 'RETIRADOS_SIN_CONTRIBUCION':
      return 'Retirado (sin contribución)';
  }
}
