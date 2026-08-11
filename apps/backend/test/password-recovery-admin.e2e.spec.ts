import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as bcrypt from 'bcryptjs';
import { AuthService } from '../src/auth/auth.service';
import { AdminService } from '../src/admin/admin.service';
import { NotificationsService } from '../src/notifications/notifications.service';

// Integration test for HU-14 (T-100): solicitud de recuperacion -> notificacion
// al admin -> admin lista pendientes -> admin genera enlace -> solicitud atendida
// -> reset con el token generado. Real AuthService + AdminService + NotificationsService
// + JwtService wired together (same pattern as auth.service.spec.ts), against a
// purpose-built in-memory Prisma double. No real DB/Docker required.
//
// NOTE: Test.createTestingModule() + Supertest (true HTTP e2e) was attempted first,
// but Nest's DI container hangs indefinitely under Vitest's esbuild transform for any
// service whose constructor mixes a plain injected param with a forwardRef-injected
// param (NotificationsService's real-world shape). This is a real, reproducible
// incompatibility, not a fluke; the repo's existing test/*.spec.ts files avoid it by
// never bootstrapping a Nest TestingModule and always instantiating services manually
// (see auth.service.spec.ts) -- this file follows that same proven approach.
function createFakePrisma() {
  const usuarios = new Map<number, any>();
  const perfiles = new Map<string, number>(); // carne -> idUsuario
  const rolesAdmin = new Set<number>();
  const solicitudes = new Map<number, any>();
  const notificaciones: any[] = [];
  let nextSolicitudId = 1;

  function attachUsuario(row: any, fields: string[]) {
    const u = usuarios.get(row.idUsuario);
    const picked: any = {};
    for (const f of fields) picked[f] = u?.[f];
    return { ...row, usuario: picked };
  }

  const prisma = {
    perfilEstudiante: {
      findUnique: async ({ where }: any) => {
        const idUsuario = perfiles.get(where.carne);
        if (idUsuario === undefined) return null;
        const u = usuarios.get(idUsuario);
        return { usuario: { idUsuario: u.idUsuario, nombre: u.nombre, apellido: u.apellido } };
      },
    },
    usuario: {
      findUnique: async ({ where }: any) => {
        if (where.idUsuario !== undefined) return usuarios.get(where.idUsuario) ?? null;
        if (where.correo !== undefined) {
          for (const u of usuarios.values()) if (u.correo === where.correo) return u;
        }
        return null;
      },
      update: async ({ where, data }: any) => {
        const u = usuarios.get(where.idUsuario);
        Object.assign(u, data);
        return u;
      },
    },
    usuarioRolAcceso: {
      findFirst: async ({ where }: any) => {
        if (!rolesAdmin.has(where.idUsuario)) return null;
        return { idUsuarioRolAcceso: where.idUsuario, idUsuario: where.idUsuario, rolAcceso: { nombrePerfil: 'administrador' } };
      },
      findMany: async () => {
        return [...rolesAdmin].map((idUsuario) => ({ idUsuario }));
      },
    },
    solicitudRecuperacion: {
      create: async ({ data }: any) => {
        const row = {
          idSolicitud: nextSolicitudId++,
          idUsuario: data.idUsuario,
          carneReferencia: data.carneReferencia,
          correoReferencia: data.correoReferencia,
          estado: 'PENDIENTE',
          creadaEn: new Date(),
          atendidaEn: null,
          atendidaPor: null,
          tokenUtilizadoEn: null,
        };
        solicitudes.set(row.idSolicitud, row);
        return { ...row };
      },
      findMany: async ({ where }: any) => {
        return [...solicitudes.values()]
          .filter((s) => !where?.estado || s.estado === where.estado)
          .sort((a, b) => b.creadaEn.getTime() - a.creadaEn.getTime())
          .map((s) => attachUsuario(s, ['idUsuario', 'nombre', 'apellido', 'correo']));
      },
      findUnique: async ({ where, include, select }: any) => {
        const row = solicitudes.get(where.idSolicitud);
        if (!row) return null;
        if (include?.usuario || select?.usuario) return attachUsuario(row, ['idUsuario', 'correo']);
        return { ...row };
      },
      update: async ({ where, data }: any) => {
        const row = solicitudes.get(where.idSolicitud);
        Object.assign(row, data);
        return { ...row };
      },
    },
    notificacion: {
      createMany: async ({ data }: any) => {
        notificaciones.push(...data);
        return { count: data.length };
      },
    },
  };

  return {
    prisma,
    notificaciones,
    seedStudent(idUsuario: number, carne: string, correo: string, contrasena: string, nombre = 'Est', apellido = 'Udiante') {
      usuarios.set(idUsuario, { idUsuario, correo, contrasena, nombre, apellido, estado: 'ACTIVO' });
      perfiles.set(carne, idUsuario);
    },
    seedAdmin(idUsuario: number, correo: string, contrasena: string) {
      usuarios.set(idUsuario, { idUsuario, correo, contrasena, nombre: 'Admin', apellido: 'UVG', estado: 'ACTIVO' });
      rolesAdmin.add(idUsuario);
    },
  };
}

describe('HU-14: recuperacion de contrasena via notificacion al admin', () => {
  const ADMIN_ID = 1;
  const ADMIN_CORREO = 'admin@uvg.edu.gt';
  const STUDENT_ID = 2;
  const CARNE = '20231234';
  const CORREO_INSTITUCIONAL = 'estudiante@uvg.edu.gt';

  let fake: ReturnType<typeof createFakePrisma>;
  let jwtService: JwtService;
  let authService: AuthService;
  let adminService: AdminService;

  beforeEach(() => {
    fake = createFakePrisma();
    fake.seedAdmin(ADMIN_ID, ADMIN_CORREO, 'admin-hash');
    fake.seedStudent(STUDENT_ID, CARNE, CORREO_INSTITUCIONAL, 'old-hash');

    jwtService = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '1h' } });
    const notificationsService = new NotificationsService(fake.prisma as any, {} as any);
    authService = new AuthService(fake.prisma as any, jwtService, notificationsService);
    adminService = new AdminService(fake.prisma as any, jwtService);
  });

  it('flujo completo: solicitud -> notificacion admin -> lista pendientes -> genera enlace -> atendida -> reset exitoso', async () => {
    await authService.forgotPassword(CARNE, CORREO_INSTITUCIONAL);

    expect(fake.notificaciones).toHaveLength(1);
    expect(fake.notificaciones[0]).toMatchObject({
      idUsuario: ADMIN_ID,
      tipoNotificacion: 'SOLICITUD_RECUPERACION_CONTRASENA',
    });

    const pendientes = await adminService.getSolicitudesRecuperacionPendientes(ADMIN_ID);
    expect(pendientes).toHaveLength(1);
    const solicitud = pendientes[0];
    expect(solicitud.carneReferencia).toBe(CARNE);
    expect(solicitud.correoReferencia).toBe(CORREO_INSTITUCIONAL);
    expect(solicitud.estado).toBe('PENDIENTE');

    const antesDeGenerar = Date.now();
    const { resetUrl, resetToken, expiraEn } = await adminService.generarEnlaceRecuperacion(
      ADMIN_ID,
      solicitud.idSolicitud,
    );
    expect(resetUrl).toContain('reset-password?token=');
    expect(typeof resetToken).toBe('string');

    // Bug de producción (HU-14): expiraEn era el string literal '1h', que no
    // le decía al admin CUÁNDO expira realmente el enlace. Debe ser un
    // timestamp ISO ~1h después de la generación (mismo TTL que el JWT).
    const expiraEnMs = new Date(expiraEn).getTime();
    expect(Number.isNaN(expiraEnMs)).toBe(false);
    const minutosHastaExpirar = (expiraEnMs - antesDeGenerar) / 60_000;
    expect(minutosHastaExpirar).toBeGreaterThan(58);
    expect(minutosHastaExpirar).toBeLessThanOrEqual(61);

    const pendientesDespues = await adminService.getSolicitudesRecuperacionPendientes(ADMIN_ID);
    expect(pendientesDespues).toHaveLength(0);

    const result = await authService.resetPassword(resetToken, 'NuevaClave123');
    expect(result.mensaje).toMatch(/actualizada/i);

    const usuarioActualizado = await fake.prisma.usuario.findUnique({ where: { idUsuario: STUDENT_ID } });
    expect(await bcrypt.compare('NuevaClave123', usuarioActualizado.contrasena)).toBe(true);
  });

  it('expiraEn se deriva exactamente del claim exp del resetToken firmado, no de un TTL calculado por separado', async () => {
    const solicitud = await fake.prisma.solicitudRecuperacion.create({
      data: { idUsuario: STUDENT_ID, carneReferencia: CARNE, correoReferencia: CORREO_INSTITUCIONAL },
    });

    // Se congela el reloj en un instante con milisegundos != 0: el claim
    // `exp` de un JWT siempre trunca a segundos completos (jsonwebtoken
    // calcula iat = Math.floor(Date.now()/1000)), mientras que un cálculo
    // independiente tipo `Date.now() + TTL_MS` conserva los milisegundos.
    // Si expiraEn todavía viniera de esa segunda fuente, este test lo
    // detecta de forma determinista (no depende de que el reloj real caiga
    // justo en un segundo exacto).
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.437Z'));

    let expiraEn: string;
    let resetToken: string;
    try {
      ({ expiraEn, resetToken } = await adminService.generarEnlaceRecuperacion(
        ADMIN_ID,
        solicitud.idSolicitud,
      ));
    } finally {
      vi.useRealTimers();
    }

    const decoded = jwtService.decode(resetToken) as { exp: number };
    const expiraEnEsperado = new Date(decoded.exp * 1000).toISOString();
    expect(expiraEn).toBe(expiraEnEsperado);
  });

  it('rechaza un token expirado', async () => {
    const solicitud = await fake.prisma.solicitudRecuperacion.create({
      data: { idUsuario: STUDENT_ID, carneReferencia: CARNE, correoReferencia: CORREO_INSTITUCIONAL },
    });
    const expiredToken = jwtService.sign(
      { sub: STUDENT_ID, correo: CORREO_INSTITUCIONAL, tipo: 'reset', idSolicitud: solicitud.idSolicitud },
      { expiresIn: '-10s' },
    );

    await expect(authService.resetPassword(expiredToken, 'NuevaClave123')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rechaza un token ya utilizado (no reutilizable)', async () => {
    const solicitud = await fake.prisma.solicitudRecuperacion.create({
      data: { idUsuario: STUDENT_ID, carneReferencia: CARNE, correoReferencia: CORREO_INSTITUCIONAL },
    });
    const resetToken = jwtService.sign({
      sub: STUDENT_ID,
      correo: CORREO_INSTITUCIONAL,
      tipo: 'reset',
      idSolicitud: solicitud.idSolicitud,
    });

    await authService.resetPassword(resetToken, 'PrimeraClave123');

    await expect(authService.resetPassword(resetToken, 'SegundaClave456')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('niega acceso a los endpoints de admin a un usuario sin rol admin', async () => {
    const solicitud = await fake.prisma.solicitudRecuperacion.create({
      data: { idUsuario: STUDENT_ID, carneReferencia: CARNE, correoReferencia: CORREO_INSTITUCIONAL },
    });

    await expect(adminService.getSolicitudesRecuperacionPendientes(STUDENT_ID)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      adminService.generarEnlaceRecuperacion(STUDENT_ID, solicitud.idSolicitud),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
