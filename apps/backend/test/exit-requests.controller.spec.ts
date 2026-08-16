import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common/enums/request-method.enum';
import { ExitRequestsController } from '../src/exit-requests/exit-requests.controller';

function makeController() {
  const service = {
    createSolicitudSalida: vi.fn(),
    approveSolicitudSalida: vi.fn(),
    rejectSolicitudSalida: vi.fn(),
    getExitPreparationSummary: vi.fn(),
  };
  return { controller: new ExitRequestsController(service as any), service };
}

function routeMetadata(methodName: keyof ExitRequestsController) {
  const handler = ExitRequestsController.prototype[methodName];
  return {
    path: Reflect.getMetadata(PATH_METADATA, handler),
    method: Reflect.getMetadata(METHOD_METADATA, handler),
    status: Reflect.getMetadata(HTTP_CODE_METADATA, handler),
  };
}

describe('ExitRequestsController', () => {
  it('mantiene el prefijo público proyectos/:projectId', () => {
    expect(Reflect.getMetadata(PATH_METADATA, ExitRequestsController)).toBe('proyectos/:projectId');
  });

  it('mantiene POST /proyectos/:projectId/solicitudes-salida con 201', () => {
    expect(routeMetadata('createExitRequest')).toEqual({
      path: 'solicitudes-salida',
      method: RequestMethod.POST,
      status: HttpStatus.CREATED,
    });
  });

  it('mantiene POST /proyectos/:projectId/solicitudes-salida/:idSolicitud/aprobar con 200', () => {
    expect(routeMetadata('approveExitRequest')).toEqual({
      path: 'solicitudes-salida/:idSolicitud/aprobar',
      method: RequestMethod.POST,
      status: HttpStatus.OK,
    });
  });

  it('mantiene POST /proyectos/:projectId/solicitudes-salida/:idSolicitud/rechazar con 200', () => {
    expect(routeMetadata('rejectExitRequest')).toEqual({
      path: 'solicitudes-salida/:idSolicitud/rechazar',
      method: RequestMethod.POST,
      status: HttpStatus.OK,
    });
  });

  it('expone GET /proyectos/:projectId/salida/preparacion con status estándar', () => {
    expect(routeMetadata('getExitPreparationSummary')).toEqual({
      path: 'salida/preparacion',
      method: RequestMethod.GET,
      status: undefined,
    });
  });

  it('delega creación con projectId, userId de CurrentUser y motivo del DTO', async () => {
    const { controller, service } = makeController();
    service.createSolicitudSalida.mockResolvedValue({ idSolicitud: 1 });

    const result = await controller.createExitRequest(10, { motivo: 'motivo' }, { userId: 2 });

    expect(service.createSolicitudSalida).toHaveBeenCalledWith(10, 2, 'motivo');
    expect(result).toEqual({ idSolicitud: 1 });
  });

  it('delega aprobación con projectId, idSolicitud y userId de CurrentUser', async () => {
    const { controller, service } = makeController();
    service.approveSolicitudSalida.mockResolvedValue({ estadoSolicitud: 'APROBADA' });

    const result = await controller.approveExitRequest(10, 55, { userId: 1 });

    expect(service.approveSolicitudSalida).toHaveBeenCalledWith(10, 55, 1);
    expect(result).toEqual({ estadoSolicitud: 'APROBADA' });
  });

  it('delega rechazo con projectId, idSolicitud y userId de CurrentUser', async () => {
    const { controller, service } = makeController();
    service.rejectSolicitudSalida.mockResolvedValue({ estadoSolicitud: 'RECHAZADA' });

    const result = await controller.rejectExitRequest(10, 55, { userId: 1 });

    expect(service.rejectSolicitudSalida).toHaveBeenCalledWith(10, 55, 1);
    expect(result).toEqual({ estadoSolicitud: 'RECHAZADA' });
  });

  it('delega el resumen de preparación con projectId y userId de CurrentUser', async () => {
    const { controller, service } = makeController();
    service.getExitPreparationSummary.mockResolvedValue({
      cantidadBlockers: 0,
      puedeContinuar: true,
      blockers: [],
    });

    const result = await controller.getExitPreparationSummary(10, { userId: 2 });

    expect(service.getExitPreparationSummary).toHaveBeenCalledWith(10, 2);
    expect(result).toEqual({ cantidadBlockers: 0, puedeContinuar: true, blockers: [] });
  });
});
