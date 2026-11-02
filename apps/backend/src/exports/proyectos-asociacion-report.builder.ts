import { buildCsv } from './csv-export.util';
import { renderTablaPdf } from './horas-central-report.builder';

export interface FilaProyectoAsociacion {
  titulo: string;
  estado: string;
  avanceTareasPct: number;
  avanceSprintsPct: number;
  integrantes: number;
  horasAcreditadas: number;
}

const HEADER = ['Proyecto', 'Estado', 'Avance tareas (%)', 'Avance sprints (%)', 'Integrantes', 'Horas acreditadas'] as const;

const filaTabla = (f: FilaProyectoAsociacion) => [
  f.titulo,
  f.estado,
  f.avanceTareasPct,
  f.avanceSprintsPct,
  f.integrantes,
  f.horasAcreditadas,
];

export const buildProyectosAsociacionCsv = (filas: FilaProyectoAsociacion[]) => buildCsv([...HEADER], filas.map(filaTabla));

export const renderProyectosAsociacionPdf = (titulo: string, filas: FilaProyectoAsociacion[]) =>
  renderTablaPdf(titulo, HEADER, filas.map(filaTabla));
