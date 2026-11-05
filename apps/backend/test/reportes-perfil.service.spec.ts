import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ReportesPerfilService } from '../src/perfil-portafolio/reportes-perfil.service';

describe('MEJ-154 reportes de perfil', () => {
  function crear({ mensaje = { contenido: 'texto ofensivo' } as { contenido: string } | null, repetido = false, admin = true } = {}) {
    const prisma = {
      usuario: { findFirst: vi.fn().mockResolvedValue({ idUsuario: 2 }) },
      mensajeChat: { findFirst: vi.fn().mockResolvedValue(mensaje) },
      reportePerfil: {
        findFirst: vi.fn().mockResolvedValue(repetido ? { idReporte: 1 } : null),
        create: vi.fn().mockResolvedValue({ idReporte: 10 }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([]),
        findUnique: vi.fn().mockResolvedValue({ idReporte: 10 }),
      },
      usuarioRolAcceso: { findFirst: vi.fn().mockResolvedValue(admin ? { idUsuario: 99 } : null) },
    };
    const notifications = { notifyAdminsFromTemplate: vi.fn().mockResolvedValue(undefined) };
    return { prisma, notifications, servicio: new ReportesPerfilService(prisma as never, notifications as never) };
  }

  it('crea el reporte de un mensaje con copia del texto y avisa a administracion', async () => {
    const { servicio, prisma, notifications } = crear();
    await servicio.crear(1, { idReportado: 2, idMensaje: 5, motivo: 'ACOSO' });
    expect(prisma.mensajeChat.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ idRemitente: 2, conversacion: { participantes: { some: { idUsuario: 1 } } } }) }),
    );
    expect(prisma.reportePerfil.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ idReportante: 1, idReportado: 2, idMensaje: 5, textoMensaje: 'texto ofensivo', motivo: 'ACOSO' }) }),
    );
    expect(notifications.notifyAdminsFromTemplate).toHaveBeenCalledWith('REPORTE_PERFIL', { idReportePerfil: 10, esMensaje: true });
  });

  it('no deja reportarse, reportar un mensaje que no se ve ni repetir un reporte pendiente', async () => {
    await expect(crear().servicio.crear(1, { idReportado: 1, motivo: 'SPAM' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(crear({ mensaje: null }).servicio.crear(1, { idReportado: 2, idMensaje: 5, motivo: 'SPAM' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(crear({ repetido: true }).servicio.crear(1, { idReportado: 2, motivo: 'SPAM' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('la bandeja y la resolucion son solo para administradores', async () => {
    const { servicio, prisma } = crear({ admin: false });
    await expect(servicio.listar(1)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(servicio.resolver(1, 10, 'descartar')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.reportePerfil.updateMany).not.toHaveBeenCalled();
  });

  it('descartar o actuar fijan el estado una sola vez', async () => {
    const { servicio, prisma } = crear();
    await expect(servicio.resolver(99, 10, 'descartar', 'sin falta')).resolves.toEqual({ idReporte: 10, estado: 'DESCARTADO' });
    await expect(servicio.resolver(99, 10, 'actuar')).resolves.toEqual({ idReporte: 10, estado: 'ATENDIDO' });
    prisma.reportePerfil.updateMany.mockResolvedValue({ count: 0 });
    await expect(servicio.resolver(99, 10, 'actuar')).rejects.toBeInstanceOf(ConflictException);
  });
});
