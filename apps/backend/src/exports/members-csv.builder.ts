import { buildCsvFromRows, formatFechaCsv } from './csv-export.util';
import { formatEstadoParticipacion, formatGrupoMiembro, formatTipoProyecto } from './project-export-labels';
import type { ProjectExportModel } from './dto/project-export.dto';

const COLUMNAS = [
  'Nombre',
  'Apellido',
  'Correo',
  'Rol',
  'Estado',
  'Grupo',
  'Horas confirmadas',
  'Horas pendientes',
];

/**
 * T-259 (HU-164): CSV de miembros y horas del proyecto. El tipo de proyecto
 * (beca/experiencia/extensión) y el líder van como metadatos de cabecera
 * ANTES de la tabla — Excel abre bien filas de distinto ancho, y así el
 * archivo se explica solo sin inventar una columna por integrante que el
 * modelo de datos no respalda (ver project-export-labels.ts).
 */
export function buildMembersCsv(modelo: ProjectExportModel): string {
  const filasMetadatos: (string | number)[][] = [
    ['Proyecto', modelo.proyecto.tituloProyecto],
    ['Tipo de proyecto', formatTipoProyecto(modelo.proyecto.tipoProyecto)],
    ['Líder', `${modelo.lider.nombre} ${modelo.lider.apellido}`],
    ['Generado', formatFechaCsv(modelo.fechaGeneracion)],
    [],
  ];

  const filasMiembros = modelo.miembros.map((miembro) => [
    miembro.nombre,
    miembro.apellido,
    miembro.correo,
    miembro.rol,
    formatEstadoParticipacion(miembro.estadoParticipacion),
    formatGrupoMiembro(miembro.grupo),
    miembro.horasConfirmadas,
    miembro.horasPendientes,
  ]);

  return buildCsvFromRows([...filasMetadatos, COLUMNAS, ...filasMiembros]);
}
