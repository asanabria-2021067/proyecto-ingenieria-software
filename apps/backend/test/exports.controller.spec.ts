import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import type { Response } from 'express';
import { EstadoProyecto, EstadoSprint, TipoProyecto } from '@prisma/client';
import { ExportsController } from '../src/exports/exports.controller';
import type { ExportsService } from '../src/exports/exports.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { TipoEventoBitacora } from '../src/bitacora/tipos-evento-bitacora';
import type { ProjectExportModel } from '../src/exports/dto/project-export.dto';
import { DEFAULT_EXPORT_OPTIONS } from '../src/exports/export-options';

const MODELO_VACIO: ProjectExportModel = {
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

function makeExportsService(modelo: ProjectExportModel = MODELO_VACIO) {
  return {
    getProjectExportModel: vi.fn().mockResolvedValue(modelo),
    registrarExportacion: vi.fn().mockResolvedValue(undefined),
    getBurndownForClosedSprints: vi.fn().mockResolvedValue([]),
  } as unknown as ExportsService & {
    getProjectExportModel: ReturnType<typeof vi.fn>;
    registrarExportacion: ReturnType<typeof vi.fn>;
    getBurndownForClosedSprints: ReturnType<typeof vi.fn>;
  };
}

function makeResponse() {
  return {
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    end: vi.fn(),
  } as unknown as Response & { setHeader: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
}

describe('ExportsController (T-259/T-260/T-261)', () => {
  it('está protegido por JwtAuthGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ExportsController) ?? [];
    expect(guards).toContain(JwtAuthGuard);
  });

  it('registra GET csv y GET pdf', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ExportsController.prototype.exportCsv)).toBe('csv');
    expect(Reflect.getMetadata(METHOD_METADATA, ExportsController.prototype.exportCsv)).toBe(0);
    expect(Reflect.getMetadata(PATH_METADATA, ExportsController.prototype.exportPdf)).toBe('pdf');
    expect(Reflect.getMetadata(METHOD_METADATA, ExportsController.prototype.exportPdf)).toBe(0);
  });

  describe('GET csv', () => {
    it('pide el modelo con projectId/userId, escribe el CSV y registra la bitácora', async () => {
      const service = makeExportsService();
      const controller = new ExportsController(service);
      const res = makeResponse();

      await controller.exportCsv(5, { userId: 9 }, res);

      expect(service.getProjectExportModel).toHaveBeenCalledWith(5, 9, DEFAULT_EXPORT_OPTIONS);
      expect(service.registrarExportacion).toHaveBeenCalledWith(
        5,
        9,
        TipoEventoBitacora.PROJECT_EXPORT_CSV_GENERATED,
        expect.anything(),
      );
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('attachment'),
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.end).toHaveBeenCalledWith(expect.any(Buffer));
    });

    it('propaga el ForbiddenException del servicio sin escribir la respuesta', async () => {
      const service = makeExportsService();
      service.getProjectExportModel.mockRejectedValue(new ForbiddenException());
      const controller = new ExportsController(service);
      const res = makeResponse();

      await expect(controller.exportCsv(5, { userId: 42 }, res)).rejects.toBeInstanceOf(ForbiddenException);
      expect(res.end).not.toHaveBeenCalled();
      expect(service.registrarExportacion).not.toHaveBeenCalled();
    });
  });

  describe('GET pdf', () => {
    it('pide el modelo, escribe el PDF y registra la bitácora con el evento de PDF', async () => {
      const service = makeExportsService();
      const controller = new ExportsController(service);
      const res = makeResponse();

      await controller.exportPdf(5, { userId: 9 }, res);

      expect(service.getProjectExportModel).toHaveBeenCalledWith(5, 9, DEFAULT_EXPORT_OPTIONS);
      expect(service.registrarExportacion).toHaveBeenCalledWith(
        5,
        9,
        TipoEventoBitacora.PROJECT_EXPORT_PDF_GENERATED,
        expect.anything(),
      );
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.end).toHaveBeenCalledWith(expect.any(Buffer));
    });

    it('propaga el ForbiddenException del servicio sin escribir la respuesta', async () => {
      const service = makeExportsService();
      service.getProjectExportModel.mockRejectedValue(new ForbiddenException());
      const controller = new ExportsController(service);
      const res = makeResponse();

      await expect(controller.exportPdf(5, { userId: 42 }, res)).rejects.toBeInstanceOf(ForbiddenException);
      expect(res.end).not.toHaveBeenCalled();
      expect(service.registrarExportacion).not.toHaveBeenCalled();
    });

    it('T-260: pide el burndown solo de los Sprints CERRADO, nunca del activo', async () => {
      const modelo: ProjectExportModel = {
        ...MODELO_VACIO,
        avance: {
          idProyecto: 5,
          sprints: [
            {
              idSprint: 10,
              numero: 1,
              estado: EstadoSprint.CERRADO,
              tareasPlanificadas: 4,
              tareasCompletadas: 4,
              porcentajeCumplimiento: 100,
              hitosTotales: 0,
              hitosCompletados: 0,
            },
            {
              idSprint: 11,
              numero: 2,
              estado: EstadoSprint.ACTIVO,
              tareasPlanificadas: 3,
              tareasCompletadas: 1,
              porcentajeCumplimiento: 33,
              hitosTotales: 0,
              hitosCompletados: 0,
            },
          ],
        },
      };
      const service = makeExportsService(modelo);
      const controller = new ExportsController(service);
      const res = makeResponse();

      await controller.exportPdf(5, { userId: 9 }, res);

      expect(service.getBurndownForClosedSprints).toHaveBeenCalledWith(5, [10]);
    });

    it('T-260: sin ningún Sprint cerrado, igual llama a getBurndownForClosedSprints con []', async () => {
      const service = makeExportsService();
      const controller = new ExportsController(service);
      const res = makeResponse();

      await controller.exportPdf(5, { userId: 9 }, res);

      expect(service.getBurndownForClosedSprints).toHaveBeenCalledWith(5, []);
    });
  });

  describe('opciones de exportación (revisión del PR)', () => {
    it('PDF: pasa al modelo las opciones parseadas del query string', async () => {
      const service = makeExportsService();
      const controller = new ExportsController(service);

      await controller.exportPdf(
        5,
        { userId: 9 },
        makeResponse(),
        { fuente: 'grande', color: '#1e408c', secciones: 'miembros', graficas: 'barras,pastel', desde: '2026-02-01', hasta: '2026-02-28' },
      );

      const opciones = service.getProjectExportModel.mock.calls[0][2];
      expect(opciones).toMatchObject({
        fuente: 'grande',
        colorTablas: '#1e408c',
        secciones: ['miembros'],
        graficas: ['barras', 'pastel'],
      });
      expect(opciones.desde.toISOString()).toBe('2026-02-01T00:00:00.000Z');
      expect(opciones.hasta.toISOString()).toBe('2026-02-28T00:00:00.000Z');
    });

    it('PDF: una opción inválida responde 400 antes de tocar datos o bitácora', async () => {
      const service = makeExportsService();
      const controller = new ExportsController(service);

      await expect(
        controller.exportPdf(5, { userId: 9 }, makeResponse(), { fuente: 'enorme' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(service.getProjectExportModel).not.toHaveBeenCalled();
      expect(service.registrarExportacion).not.toHaveBeenCalled();
    });

    it('PDF: sin la sección burndown no consulta el burndown de ningún Sprint', async () => {
      const service = makeExportsService();
      const controller = new ExportsController(service);

      await controller.exportPdf(5, { userId: 9 }, makeResponse(), { secciones: 'miembros,avance' });

      expect(service.getBurndownForClosedSprints).not.toHaveBeenCalled();
    });

    it('PDF: la bitácora guarda qué opciones se usaron', async () => {
      const service = makeExportsService();
      const controller = new ExportsController(service);

      await controller.exportPdf(5, { userId: 9 }, makeResponse(), {
        secciones: 'miembros',
        graficas: 'pastel',
        desde: '2026-02-01',
      });

      expect(service.registrarExportacion).toHaveBeenCalledWith(
        5,
        9,
        TipoEventoBitacora.PROJECT_EXPORT_PDF_GENERATED,
        {
          fuente: 'mediana',
          color: '#464646',
          secciones: ['miembros'],
          graficas: ['pastel'],
          desde: '2026-02-01',
          hasta: null,
        },
      );
    });

    it('CSV: acepta el rango de fechas y una opción inválida responde 400', async () => {
      const service = makeExportsService();
      const controller = new ExportsController(service);

      await controller.exportCsv(5, { userId: 9 }, makeResponse(), { desde: '2026-02-01', hasta: '2026-02-28' });
      expect(service.getProjectExportModel.mock.calls[0][2].desde.toISOString()).toBe('2026-02-01T00:00:00.000Z');

      await expect(
        controller.exportCsv(5, { userId: 9 }, makeResponse(), { desde: 'ayer' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
