import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import type { Response } from 'express';
import { EstadoProyecto, TipoProyecto } from '@prisma/client';
import { ExportsController } from '../src/exports/exports.controller';
import type { ExportsService } from '../src/exports/exports.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { TipoEventoBitacora } from '../src/bitacora/tipos-evento-bitacora';
import type { ProjectExportModel } from '../src/exports/dto/project-export.dto';

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
  avance: { idProyecto: 5, sprints: [] },
};

function makeExportsService() {
  return {
    getProjectExportModel: vi.fn().mockResolvedValue(MODELO_VACIO),
    registrarExportacion: vi.fn().mockResolvedValue(undefined),
  } as unknown as ExportsService & {
    getProjectExportModel: ReturnType<typeof vi.fn>;
    registrarExportacion: ReturnType<typeof vi.fn>;
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

      expect(service.getProjectExportModel).toHaveBeenCalledWith(5, 9);
      expect(service.registrarExportacion).toHaveBeenCalledWith(
        5,
        9,
        TipoEventoBitacora.PROJECT_EXPORT_CSV_GENERATED,
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

      expect(service.getProjectExportModel).toHaveBeenCalledWith(5, 9);
      expect(service.registrarExportacion).toHaveBeenCalledWith(
        5,
        9,
        TipoEventoBitacora.PROJECT_EXPORT_PDF_GENERATED,
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
  });
});
