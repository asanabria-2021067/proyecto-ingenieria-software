import { describe, expect, it } from 'vitest';
import { EstadoParticipacion, EstadoProyecto, TipoProyecto } from '@prisma/client';
import { buildMembersCsv } from '../src/exports/members-csv.builder';
import type { ProjectExportModel } from '../src/exports/dto/project-export.dto';

function makeModelo(overrides: Partial<ProjectExportModel> = {}): ProjectExportModel {
  return {
    proyecto: {
      idProyecto: 5,
      tituloProyecto: 'Sistema de Bibliotecas',
      tipoProyecto: TipoProyecto.ACADEMICO_HORAS_BECA,
      estadoProyecto: EstadoProyecto.EN_PROGRESO,
    },
    lider: { idUsuario: 1, nombre: 'Ana', apellido: 'Líder', correo: 'ana@uvg.edu.gt', fotoUrl: null },
    miembros: [
      {
        idUsuario: 2,
        nombre: 'José',
        apellido: 'Peña Muñoz',
        correo: 'jose@uvg.edu.gt',
        rol: 'Desarrollador',
        estadoParticipacion: EstadoParticipacion.ACTIVO,
        grupo: 'ACTIVOS',
        horasConfirmadas: 12.5,
        horasPendientes: 3.5,
      },
    ],
    fechaGeneracion: new Date('2026-03-05T15:30:00.000Z'),
    sprintPortada: null,
    avance: { idProyecto: 5, sprints: [] },
    ...overrides,
  };
}

describe('buildMembersCsv (T-259)', () => {
  it('incluye el BOM UTF-8 y usa `;` como separador', () => {
    const csv = buildMembersCsv(makeModelo());

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain(';');
  });

  it('conserva acentos y ñ del nombre del integrante', () => {
    const csv = buildMembersCsv(makeModelo());

    expect(csv).toContain('Peña Muñoz');
  });

  it('incluye el título y el tipo del proyecto como cabecera de contexto', () => {
    const csv = buildMembersCsv(makeModelo());

    expect(csv).toContain('Sistema de Bibliotecas');
    expect(csv).toContain('Académico (horas de beca)');
  });

  it('incluye la fecha de generación en formato DD/MM/AAAA', () => {
    const csv = buildMembersCsv(makeModelo());

    expect(csv).toContain('05/03/2026');
  });

  it('la fila de datos trae horas confirmadas y pendientes por separado', () => {
    const csv = buildMembersCsv(makeModelo());
    const filaJose = csv.split('\r\n').find((linea) => linea.includes('José'));

    expect(filaJose).toContain('12.5');
    expect(filaJose).toContain('3.5');
  });

  it('un proyecto sin miembros genera un CSV válido con solo cabecera y metadatos, sin fallar (T-262)', () => {
    const csv = buildMembersCsv(makeModelo({ miembros: [] }));

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('Nombre');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});
