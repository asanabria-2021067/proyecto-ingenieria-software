import { ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { NotificationsService } from '../src/notifications/notifications.service';
import { AdminService } from '../src/admin/admin.service';
import { AuthService, MENSAJE_CUENTA_PENDIENTE } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { SecurityEventsService } from '../src/security-events/security-events.service';

process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-de-pruebas-con-longitud-suficiente';

const PASSWORD = 'Correcta123';
const HASH = bcrypt.hashSync(PASSWORD, 4);
const PENDIENTE = 'PENDIENTE_VERIFICACION';

function makeAuth(estado: string) {
  const usuario = { idUsuario: 5, correo: 'san24725@uvg.edu.gt', contrasena: HASH, estado };
  const tx = {
    usuario: { create: vi.fn().mockResolvedValue({ idUsuario: 9, correo: 'san24725@uvg.edu.gt' }) },
    perfilEstudiante: { create: vi.fn().mockResolvedValue({}) },
  };
  const eventos = vi.fn().mockResolvedValue({});
  const prisma = {
    usuario: {
      findUnique: vi.fn().mockResolvedValue(usuario),
      update: vi.fn().mockResolvedValue({}),
    },
    tokenRefresco: {
      create: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue({ idTokenRefresco: 'r1', revocadoEn: null, expiraEn: new Date(Date.now() + 60_000) }),
      update: vi.fn().mockResolvedValue({}),
    },
    bitacoraAuditoria: { create: eventos },
    $transaction: vi.fn(async (cb: (client: unknown) => unknown) => cb(tx)),
  };
  const jwtService = {
    sign: vi.fn().mockReturnValue('jwt-nuevo'),
    verify: vi.fn().mockReturnValue({ sub: 5, correo: 'san24725@uvg.edu.gt', tipo: 'refresh' }),
  };
  const notifications = { notifyAdminsFromTemplate: vi.fn().mockResolvedValue(undefined) };
  const service = new AuthService(
    prisma as unknown as PrismaService,
    jwtService as unknown as JwtService,
    notifications as unknown as NotificationsService,
  );
  return { service, prisma, tx, jwtService, notifications, eventos };
}

const REGISTRO = {
  correo: 'san24725@uvg.edu.gt',
  contrasena: PASSWORD,
  nombre: 'Angel',
  apellido: 'Sanabria',
  carne: '24725',
  idCarrera: 1,
  semestre: 6,
};

describe('registro de una cuenta nueva', () => {
  it('queda en PENDIENTE_VERIFICACION y no emite tokens de sesión', async () => {
    const { service, prisma, tx, jwtService } = makeAuth('ACTIVO');
    prisma.usuario.findUnique.mockResolvedValue(null);

    const resultado = await service.register(REGISTRO);

    expect(tx.usuario.create.mock.calls[0][0].data.estado).toBe(PENDIENTE);
    expect(resultado).toEqual({ idUsuario: 9, estado: PENDIENTE });
    expect(jwtService.sign).not.toHaveBeenCalled();
    expect(prisma.tokenRefresco.create).not.toHaveBeenCalled();
  });

  it('avisa a los administradores con el nombre y el carné de la cuenta nueva', async () => {
    const { service, prisma, notifications } = makeAuth('ACTIVO');
    prisma.usuario.findUnique.mockResolvedValue(null);

    await service.register(REGISTRO);

    expect(notifications.notifyAdminsFromTemplate).toHaveBeenCalledWith('CUENTA_PENDIENTE_VERIFICACION', {
      userName: 'Angel Sanabria',
      carne: '24725',
      userId: 9,
    });
  });
});

describe('acceso de una cuenta pendiente de verificación', () => {
  it('login con la contraseña correcta responde 403 con el mensaje de verificación y sin tokens', async () => {
    const { service, prisma } = makeAuth(PENDIENTE);

    const intento = service.login({ correo: 'san24725@uvg.edu.gt', contrasena: PASSWORD });

    await expect(intento).rejects.toBeInstanceOf(ForbiddenException);
    await expect(intento).rejects.toThrow(MENSAJE_CUENTA_PENDIENTE);
    expect(MENSAJE_CUENTA_PENDIENTE).toBe('Tu cuenta está pendiente de verificación por administración');
    expect(prisma.tokenRefresco.create).not.toHaveBeenCalled();
    expect(prisma.usuario.update).not.toHaveBeenCalled();
  });

  it('login con una contraseña incorrecta responde exactamente lo mismo', async () => {
    const correcta = makeAuth(PENDIENTE);
    const incorrecta = makeAuth(PENDIENTE);

    const conCorrecta = await correcta.service
      .login({ correo: 'san24725@uvg.edu.gt', contrasena: PASSWORD })
      .catch((error: ForbiddenException) => error);
    const conIncorrecta = await incorrecta.service
      .login({ correo: 'san24725@uvg.edu.gt', contrasena: 'Otra12345' })
      .catch((error: ForbiddenException) => error);

    expect(conIncorrecta).toBeInstanceOf(ForbiddenException);
    expect((conIncorrecta as ForbiddenException).getResponse()).toEqual((conCorrecta as ForbiddenException).getResponse());
  });

  it('una contraseña incorrecta sigue contando para el bloqueo temporal, igual que en una cuenta activa', async () => {
    const { service } = makeAuth(PENDIENTE);
    const intento = () =>
      service.login({ correo: 'san24725@uvg.edu.gt', contrasena: 'Otra12345' }).catch((error: Error) => error);

    for (let i = 0; i < 5; i += 1) {
      expect(await intento()).toBeInstanceOf(ForbiddenException);
    }
    expect(await intento()).toBeInstanceOf(UnauthorizedException);
  });

  it('registra el intento como LOGIN_FAILED con el motivo de cuenta pendiente', async () => {
    const { service, eventos } = makeAuth(PENDIENTE);

    await service.login({ correo: 'san24725@uvg.edu.gt', contrasena: PASSWORD }).catch(() => undefined);

    expect(eventos).toHaveBeenCalledTimes(1);
    const fila = eventos.mock.calls[0][0].data;
    expect(fila.accion).toBe('LOGIN_FAILED');
    expect(fila.detalleJson).toMatchObject({ motivo: 'CUENTA_PENDIENTE_VERIFICACION', cuentaConocida: true });
  });

  it('el refresh de una cuenta pendiente revoca el token y no emite credenciales', async () => {
    const { service, prisma } = makeAuth(PENDIENTE);

    await expect(service.refreshToken('refresh-viejo')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.tokenRefresco.update).toHaveBeenCalledWith({
      where: { idTokenRefresco: 'r1' },
      data: { revocadoEn: expect.any(Date) },
    });
    expect(prisma.tokenRefresco.create).not.toHaveBeenCalled();
  });

  it('la validación del JWT rechaza un access token de una cuenta pendiente', async () => {
    const prisma = { usuario: { findUnique: vi.fn().mockResolvedValue({ estado: PENDIENTE }) } };
    const strategy = new JwtStrategy(prisma as unknown as PrismaService);

    await expect(strategy.validate({ sub: 5, correo: 'san24725@uvg.edu.gt', tipo: 'access' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

function makeAdmin(options: { esAdmin?: boolean; estado?: string | null; actualizadas?: number } = {}) {
  const { esAdmin = true, estado = PENDIENTE, actualizadas = 1 } = options;
  const persona = { idUsuario: 5, nombre: 'Angel', apellido: 'Sanabria', correo: 'san24725@uvg.edu.gt' };
  const eventos = vi.fn().mockResolvedValue({});
  const prisma = {
    usuarioRolAcceso: { findFirst: vi.fn().mockResolvedValue(esAdmin ? { idUsuario: 1 } : null) },
    usuario: {
      findUnique: vi.fn().mockResolvedValue(estado === null ? null : { ...persona, estado }),
      findMany: vi.fn().mockResolvedValue([
        {
          ...persona,
          fechaCreacion: new Date('2026-10-01T15:00:00Z'),
          perfil: { carne: '24725', carrera: { idCarrera: 1, nombreCarrera: 'Ingeniería en Ciencias de la Computación' } },
        },
        {
          idUsuario: 6,
          nombre: 'Luis',
          apellido: 'Li',
          correo: 'li24013@uvg.edu.gt',
          fechaCreacion: new Date('2026-10-02T15:00:00Z'),
          perfil: null,
        },
      ]),
      updateMany: vi.fn().mockResolvedValue({ count: actualizadas }),
    },
    bitacoraAuditoria: { create: eventos },
  };
  const notifications = { notifyFromTemplate: vi.fn().mockResolvedValue(undefined) };
  const admin = new AdminService(
    prisma as unknown as PrismaService,
    new JwtService({}),
    new SecurityEventsService(prisma as unknown as PrismaService),
    undefined,
    notifications as unknown as NotificationsService,
  );
  return { admin, prisma, eventos, notifications };
}

describe('listado de cuentas pendientes', () => {
  it('devuelve nombre, correo, carné, carrera, fecha de registro y el total', async () => {
    const { admin, prisma } = makeAdmin();

    const resultado = await admin.getCuentasPendientes(1);

    expect(prisma.usuario.findMany.mock.calls[0][0].where).toEqual({ estado: PENDIENTE });
    expect(resultado.total).toBe(2);
    expect(resultado.cuentas[0]).toEqual({
      idUsuario: 5,
      nombre: 'Angel',
      apellido: 'Sanabria',
      correo: 'san24725@uvg.edu.gt',
      carne: '24725',
      carrera: { idCarrera: 1, nombreCarrera: 'Ingeniería en Ciencias de la Computación' },
      fechaRegistro: '2026-10-01T15:00:00.000Z',
    });
    expect(resultado.cuentas[1]).toMatchObject({ carne: null, carrera: null });
  });
});

describe('aprobar una cuenta pendiente', () => {
  it('pasa a ACTIVO solo si sigue pendiente', async () => {
    const { admin, prisma } = makeAdmin();

    const resultado = await admin.aprobarCuentaPendiente(1, 5);

    expect(prisma.usuario.updateMany).toHaveBeenCalledWith({
      where: { idUsuario: 5, estado: PENDIENTE },
      data: { estado: 'ACTIVO' },
    });
    expect(resultado).toMatchObject({ idUsuario: 5, estado: 'ACTIVO' });
  });

  it('registra USER_STATUS_CHANGED con el admin que actuó y la transición', async () => {
    const { admin, eventos } = makeAdmin();

    await admin.aprobarCuentaPendiente(1, 5);

    expect(eventos).toHaveBeenCalledTimes(1);
    expect(eventos.mock.calls[0][0].data).toEqual({
      idUsuario: 1,
      accion: 'USER_STATUS_CHANGED',
      tipoObjeto: 'SEGURIDAD_CUENTA',
      idObjeto: '5',
      detalleJson: { estadoAnterior: PENDIENTE, estadoNuevo: 'ACTIVO' },
    });
  });

  it('notifica al usuario aprobado', async () => {
    const { admin, notifications } = makeAdmin();

    await admin.aprobarCuentaPendiente(1, 5);

    expect(notifications.notifyFromTemplate).toHaveBeenCalledWith([5], 'CUENTA_VERIFICADA', { userName: 'Angel' });
  });
});

describe('rechazar una cuenta pendiente', () => {
  it('pasa a INACTIVO, registra el evento y no notifica al usuario', async () => {
    const { admin, prisma, eventos, notifications } = makeAdmin();

    const resultado = await admin.rechazarCuentaPendiente(1, 5);

    expect(prisma.usuario.updateMany).toHaveBeenCalledWith({
      where: { idUsuario: 5, estado: PENDIENTE },
      data: { estado: 'INACTIVO' },
    });
    expect(resultado).toMatchObject({ idUsuario: 5, estado: 'INACTIVO' });
    expect(eventos.mock.calls[0][0].data.detalleJson).toEqual({ estadoAnterior: PENDIENTE, estadoNuevo: 'INACTIVO' });
    expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
  });
});

describe('errores al resolver una cuenta', () => {
  it.each(['aprobarCuentaPendiente', 'rechazarCuentaPendiente'] as const)('%s responde 404 si la cuenta no existe', async (metodo) => {
    const { admin, prisma, eventos } = makeAdmin({ estado: null });

    await expect(admin[metodo](1, 99)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.usuario.updateMany).not.toHaveBeenCalled();
    expect(eventos).not.toHaveBeenCalled();
  });

  it.each(['aprobarCuentaPendiente', 'rechazarCuentaPendiente'] as const)(
    '%s responde 409 si la cuenta ya no está pendiente',
    async (metodo) => {
      const { admin, eventos, notifications } = makeAdmin({ estado: 'ACTIVO', actualizadas: 0 });

      await expect(admin[metodo](1, 5)).rejects.toBeInstanceOf(ConflictException);
      expect(eventos).not.toHaveBeenCalled();
      expect(notifications.notifyFromTemplate).not.toHaveBeenCalled();
    },
  );

  it('dos aprobaciones simultáneas: la que pierde la carrera recibe 409 y no deja evento', async () => {
    const { admin, eventos } = makeAdmin({ estado: PENDIENTE, actualizadas: 0 });

    await expect(admin.aprobarCuentaPendiente(1, 5)).rejects.toBeInstanceOf(ConflictException);
    expect(eventos).not.toHaveBeenCalled();
  });
});

describe('solo administración', () => {
  it('un usuario sin rol de administrador recibe 403 al listar', async () => {
    const { admin, prisma } = makeAdmin({ esAdmin: false });

    await expect(admin.getCuentasPendientes(2)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.usuario.findMany).not.toHaveBeenCalled();
  });

  it.each(['aprobarCuentaPendiente', 'rechazarCuentaPendiente'] as const)(
    'un usuario sin rol de administrador recibe 403 en %s y la cuenta no cambia',
    async (metodo) => {
      const { admin, prisma, eventos } = makeAdmin({ esAdmin: false });

      await expect(admin[metodo](2, 5)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.usuario.updateMany).not.toHaveBeenCalled();
      expect(eventos).not.toHaveBeenCalled();
    },
  );
});
