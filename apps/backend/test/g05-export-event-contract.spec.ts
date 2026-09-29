import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Response } from 'express';
import { EstadoProyecto, TipoProyecto } from '@prisma/client';
import type { ProjectExportModel } from '../src/exports/dto/project-export.dto';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import { BitacoraEventosService } from '../src/bitacora/bitacora-eventos.service';
import { TipoEventoBitacora } from '../src/bitacora/tipos-evento-bitacora';
import { ExportsController } from '../src/exports/exports.controller';
import { ExportsService } from '../src/exports/exports.service';
import { TipoEventoSeguridad } from '../src/security-events/tipos-evento-seguridad';

/**
 * G05-C10 · FASE2-N03 + C016/C037. Las exportaciones siguen registrando
 * EXACTAMENTE su evento funcional existente (PROJECT_EXPORT_CSV_GENERATED /
 * PROJECT_EXPORT_PDF_GENERATED, T-261) y G05 no introduce un flujo paralelo
 * de "exportación" en los eventos de seguridad.
 */

const SRC = join(__dirname, '../src');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const full = join(directory, name);
    return statSync(full).isDirectory() ? sourceFiles(full) : full.endsWith('.ts') ? [full] : [];
  });
}

function realPath() {
  const create = vi.fn().mockResolvedValue({});
  const tx = { bitacoraAuditoria: { create } };
  const prisma = { $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)) };
  // Mismo modelo mínimo que exports.controller.spec.ts (copiado: importar otro spec re-registra sus tests).
  const modelo: ProjectExportModel = {
    proyecto: {
      idProyecto: 5,
      tituloProyecto: 'Sistema de Bibliotecas',
      tipoProyecto: TipoProyecto.ACADEMICO_HORAS_BECA,
      estadoProyecto: EstadoProyecto.EN_PROGRESO,
    },
    lider: { idUsuario: 1, nombre: 'Ana', apellido: 'Líder', correo: 'ana@uvg.edu.gt', fotoUrl: null },
    miembros: [],
    fechaGeneracion: new Date('2026-03-05T00:00:00.000Z'),
    sprintPortada: null,
    avance: { idProyecto: 5, sprints: [] },
  };
  const service = new ExportsService(
    prisma as unknown as PrismaService,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    new BitacoraEventosService(),
  );
  vi.spyOn(service, 'getProjectExportModel').mockResolvedValue(modelo);
  vi.spyOn(service, 'getBurndownForClosedSprints').mockResolvedValue([]);
  const res = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), end: vi.fn() } as unknown as Response;
  return { controller: new ExportsController(service), create, res };
}

describe('G05-C10: contrato de eventos de exportación preservado', () => {
  it('CSV → exactamente un PROJECT_EXPORT_CSV_GENERATED y ningún evento de seguridad', async () => {
    const { controller, create, res } = realPath();
    await controller.exportCsv(5, { userId: 9 }, res, {});
    expect(create.mock.calls.map((call) => call[0].data.accion)).toEqual([TipoEventoBitacora.PROJECT_EXPORT_CSV_GENERATED]);
    expect(create.mock.calls[0][0].data).toMatchObject({ idUsuario: 9, tipoObjeto: 'PROYECTO', idObjeto: '5' });
  });

  it('PDF → exactamente un PROJECT_EXPORT_PDF_GENERATED y ningún evento de seguridad', async () => {
    const { controller, create, res } = realPath();
    await controller.exportPdf(5, { userId: 9 }, res, {});
    expect(create.mock.calls.map((call) => call[0].data.accion)).toEqual([TipoEventoBitacora.PROJECT_EXPORT_PDF_GENERATED]);
  });

  it('los eventos funcionales de exportación siguen en el catálogo y ocultos al participante (HU-170)', () => {
    for (const evento of ['PROJECT_EXPORT_CSV_GENERATED', 'PROJECT_EXPORT_PDF_GENERATED'] as const) {
      expect(TipoEventoBitacora.VALORES).toContain(evento);
      expect(TipoEventoBitacora.ADMINISTRATIVOS.has(evento)).toBe(true);
    }
  });

  it('no existe un evento paralelo de exportación (DATA_EXPORTED o similar) en código ni en el catálogo de seguridad', () => {
    expect(TipoEventoSeguridad.VALORES.filter((valor) => /EXPORT/i.test(valor))).toEqual([]);
    const offenders = sourceFiles(SRC).filter((file) => /DATA_EXPORTED|EXPORT_(GENERATED|DONE)['"]/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('el módulo de exportación no usa el writer de eventos de seguridad', () => {
    for (const file of sourceFiles(join(SRC, 'exports'))) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/SecurityEventsService|TipoEventoSeguridad/);
    }
  });
});
