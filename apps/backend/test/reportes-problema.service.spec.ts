import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { ROLES_METADATA_KEY } from '../src/common/decorators/roles.decorator';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { CreateReporteProblemaDto, REPORTE_LIMITES } from '../src/reportes-problema/dto/create-reporte-problema.dto';
import { ReportesProblemaController } from '../src/reportes-problema/reportes-problema.controller';
import { MENSAJE_REPORTE_ENVIADO, ReportesProblemaService } from '../src/reportes-problema/reportes-problema.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import type { PrismaService } from '../src/prisma/prisma.service';

const VALIDO = {
  ruta: '/dashboard/proyectos/4',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120',
  descripcion: 'El tablero no carga las tareas.',
};

async function errores(overrides: Record<string, unknown> = {}) {
  const resultado = await validate(plainToInstance(CreateReporteProblemaDto, { ...VALIDO, ...overrides }));
  return Object.fromEntries(resultado.map((e) => [e.property, Object.values(e.constraints ?? {})]));
}

function setup(esAdmin = true) {
  const prisma = {
    usuarioRolAcceso: { findFirst: vi.fn().mockResolvedValue(esAdmin ? { idUsuario: 1 } : null) },
    reporteProblema: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        idReporte: 7,
        ...data,
        usuario: { nombre: 'Ana', apellido: 'Pérez', correo: 'per23@uvg.edu.gt' },
      })),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn().mockResolvedValue({ idReporte: 7 }),
    },
  };
  const notifications = { notifyAdmins: vi.fn().mockResolvedValue(undefined) };
  const service = new ReportesProblemaService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
  );
  return { service, prisma, notifications };
}

describe('MEJ-90 reportar un problema: DTO', () => {
  it('acepta un reporte válido con y sin captura', async () => {
    expect(await errores()).toEqual({});
    expect(await errores({ urlCaptura: 'https://res.cloudinary.com/demo/image/upload/v1/captura.png' })).toEqual({});
  });

  it('rechaza una captura que no es de Cloudinary', async () => {
    expect(Object.keys(await errores({ urlCaptura: 'https://evil.example.com/a.png' }))).toEqual(['urlCaptura']);
    expect(Object.keys(await errores({ urlCaptura: 'javascript:alert(1)' }))).toEqual(['urlCaptura']);
  });

  it('exige descripción y la limita', async () => {
    expect(Object.keys(await errores({ descripcion: '   ' }))).toEqual(['descripcion']);
    expect(Object.keys(await errores({ descripcion: 'a'.repeat(REPORTE_LIMITES.descripcion + 1) }))).toEqual(['descripcion']);
    expect(await errores({ descripcion: 'a'.repeat(REPORTE_LIMITES.descripcion) })).toEqual({});
  });

  it('limita ruta y navegador', async () => {
    expect(Object.keys(await errores({ ruta: 'a'.repeat(REPORTE_LIMITES.ruta + 1) }))).toEqual(['ruta']);
    expect(Object.keys(await errores({ userAgent: 'a'.repeat(REPORTE_LIMITES.userAgent + 1) }))).toEqual(['userAgent']);
  });

  it('quita caracteres de control y espacios de los extremos', () => {
    const dto = plainToInstance(CreateReporteProblemaDto, { ...VALIDO, descripcion: '  hola\u0000\u0007 mundo\nlinea  ' });
    expect(dto.descripcion).toBe('hola mundo\nlinea');
  });
});

describe('MEJ-90 reportar un problema: servicio', () => {
  it('cualquier usuario crea el reporte y se avisa a los administradores', async () => {
    const { service, prisma, notifications } = setup(false);
    const dto = plainToInstance(CreateReporteProblemaDto, VALIDO);
    expect(await service.crear(9, dto)).toEqual({ mensaje: MENSAJE_REPORTE_ENVIADO });
    expect(prisma.reporteProblema.create.mock.calls[0][0].data).toMatchObject({ idUsuario: 9, urlCaptura: null, ...VALIDO });
    expect(notifications.notifyAdmins).toHaveBeenCalledWith({
      tipoNotificacion: 'SOLICITUD_CONTACTO',
      tituloNotificacion: 'Nuevo reporte de problema',
      mensajeNotificacion: `Ana Pérez (per23@uvg.edu.gt) en ${VALIDO.ruta}: ${VALIDO.descripcion}`,
      datosJson: expect.objectContaining({ idUsuario: 9, ruta: VALIDO.ruta }),
    });
  });

  it('un no administrador no ve ni atiende reportes', async () => {
    const { service, prisma } = setup(false);
    await expect(service.listar(9)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.atender(9, 7)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.reporteProblema.findMany).not.toHaveBeenCalled();
    expect(prisma.reporteProblema.updateMany).not.toHaveBeenCalled();
  });

  it('el administrador lista los pendientes por defecto', async () => {
    const { service, prisma } = setup();
    await service.listar(1);
    expect(prisma.reporteProblema.findMany.mock.calls[0][0].where).toEqual({ estado: 'PENDIENTE' });
  });

  it('atender marca atendido; ya atendido da 409 y desconocido 404', async () => {
    const { service, prisma } = setup();
    expect(await service.atender(1, 7)).toEqual({ idReporte: 7, estado: 'ATENDIDO' });
    expect(prisma.reporteProblema.updateMany.mock.calls[0][0].data).toMatchObject({ estado: 'ATENDIDO', atendidoPor: 1 });
    prisma.reporteProblema.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.atender(1, 7)).rejects.toBeInstanceOf(ConflictException);
    prisma.reporteProblema.findUnique.mockResolvedValue(null);
    await expect(service.atender(1, 99)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('MEJ-90 reportar un problema: rutas', () => {
  const guards = (m: string) => Reflect.getMetadata(GUARDS_METADATA, ReportesProblemaController.prototype[m as keyof ReportesProblemaController]) ?? [];

  it('todo el controlador exige JwtAuthGuard y las rutas de admin RolesGuard con rol administrador', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ReportesProblemaController)).toContain(JwtAuthGuard);
    for (const m of ['listar', 'atender'] as const) {
      expect(guards(m)).toContain(RolesGuard);
      expect(Reflect.getMetadata(ROLES_METADATA_KEY, ReportesProblemaController.prototype[m])).toEqual(['administrador']);
    }
    expect(guards('crear')).not.toContain(RolesGuard);
  });

  it('tiene límite de frecuencia al crear', () => {
    const claves = Reflect.getMetadataKeys(ReportesProblemaController.prototype.crear).filter((k) => String(k).includes('THROTTLER'));
    expect(claves.length).toBeGreaterThan(0);
    expect(Reflect.getMetadata(PATH_METADATA, ReportesProblemaController.prototype.crear)).toBe('reportes-problema');
    expect(Reflect.getMetadata(METHOD_METADATA, ReportesProblemaController.prototype.crear)).toBe(1);
  });
});
