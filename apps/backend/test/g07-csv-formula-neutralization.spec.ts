import { describe, expect, it } from 'vitest';
import { EstadoParticipacion, EstadoProyecto, TipoProyecto } from '@prisma/client';
import { buildCsv, buildCsvFromRows, neutralizeCsvFormula } from '../src/exports/csv-export.util';
import { buildMembersCsv } from '../src/exports/members-csv.builder';
import type { ProjectExportModel } from '../src/exports/dto/project-export.dto';

/**
 * G07-C11 · VM1-N06 / OWASP A04/A05:2025 (T-259). Una celda de texto que
 * empieza con =, +, -, @, TAB o CR la ejecuta Excel/LibreOffice como fórmula
 * (inyección CSV: HYPERLINK, DDE). Se antepone un apóstrofo ANTES del escape
 * CSV, así la hoja la muestra como texto. Los números (horas) y el texto
 * normal no cambian, y el escape estándar (comillas, `;`, saltos) se conserva.
 */

const BOM = '﻿';
const row = (...cells: Array<string | number>) => buildCsvFromRows([cells]).slice(BOM.length, -2);

describe('G07-C11: neutralización de fórmulas en CSV', () => {
  it.each([
    ['=', '=1+1', "'=1+1"],
    ['+', '+54 1234', "'+54 1234"],
    ['-', '-2+3', "'-2+3"],
    ['@', '@SUM(A1:A2)', "'@SUM(A1:A2)"],
    ['TAB', '\t=1+1', "'\t=1+1"],
  ])('prefijo %s → la celda queda inerte', (_prefijo, value, expected) => {
    expect(neutralizeCsvFormula(value)).toBe(expected);
    expect(row(value)).toBe(expected);
  });

  it('prefijo CR → neutralizada y además entre comillas (contiene un salto)', () => {
    expect(row('\r=1+1')).toBe(`"'\r=1+1"`);
  });

  it('una fórmula con comillas y separador se neutraliza y se escapa como antes', () => {
    expect(row('=HYPERLINK("http://x.invalid";"clic")')).toBe(`"'=HYPERLINK(""http://x.invalid"";""clic"")"`);
  });

  it('texto normal, fechas y vacíos no cambian', () => {
    expect(row('Ana', 'Pérez', 'ana@uvg.edu.gt', '27/09/2026', '')).toBe('Ana;Pérez;ana@uvg.edu.gt;27/09/2026;');
    // Un @ que no está al inicio no es fórmula.
    expect(neutralizeCsvFormula('ana@uvg.edu.gt')).toBe('ana@uvg.edu.gt');
  });

  it('las celdas numéricas se exportan tal cual, también las negativas', () => {
    expect(row(12.5, 0, -3)).toBe('12.5;0;-3');
  });

  it('el escape estándar se conserva para texto normal', () => {
    expect(row('a;b', 'dijo "hola"', 'línea\nnueva')).toBe('"a;b";"dijo ""hola""";"línea\nnueva"');
  });

  it('la cabecera también pasa por la neutralización (cualquier celda de texto)', () => {
    expect(buildCsv(['=Nombre'], [['x']])).toBe(`${BOM}'=Nombre\r\nx\r\n`);
  });

  it('el CSV real de miembros neutraliza nombre, rol y título controlados por usuarios y conserva las horas', () => {
    const csv = buildMembersCsv({
      proyecto: { idProyecto: 5, tituloProyecto: '@SUM(1+1)*cmd', tipoProyecto: TipoProyecto.ACADEMICO_HORAS_BECA, estadoProyecto: EstadoProyecto.EN_PROGRESO },
      lider: { idUsuario: 1, nombre: 'Ana', apellido: 'Líder', correo: 'ana@uvg.edu.gt', fotoUrl: null },
      miembros: [
        {
          idUsuario: 2,
          nombre: '=HYPERLINK("http://x.invalid","clic")',
          apellido: '+Peña',
          correo: 'jose@uvg.edu.gt',
          rol: '-Desarrollador',
          estadoParticipacion: EstadoParticipacion.ACTIVO,
          grupo: 'ACTIVOS',
          horasConfirmadas: 12.5,
          horasPendientes: 0,
        },
      ],
      fechaGeneracion: new Date('2026-03-05T15:30:00.000Z'),
      sprintPortada: null,
      avance: { idProyecto: 5, sprints: [] },
    } as ProjectExportModel);

    const celdas = csv.split(/;|\r\n/);
    expect(celdas).toContain(`"'=HYPERLINK(""http://x.invalid"",""clic"")"`);
    expect(celdas).toContain("'+Peña");
    expect(celdas).toContain("'-Desarrollador");
    expect(celdas).toContain("'@SUM(1+1)*cmd");
    expect(celdas).toContain('12.5');
    expect(celdas.some((celda) => /^[=+\-@\t\r]/.test(celda))).toBe(false);
  });
});
