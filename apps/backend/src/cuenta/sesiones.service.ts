import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashRefreshToken } from '../auth/auth.service';
import { SecurityEventsService } from '../security-events/security-events.service';
import { TipoEventoSeguridad } from '../security-events/tipos-evento-seguridad';
import type { SecurityRequestContext } from '../security-events/request-context';

const NO_ENCONTRADA = 'Sesión no encontrada';

/** MEJ-81/82: sesiones abiertas = refresh tokens vivos; cada operación se limita a las del usuario autenticado. */
@Injectable()
export class SesionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  private vivas(idUsuario: number) {
    return { idUsuario, revocadoEn: null, expiraEn: { gt: new Date() } };
  }

  async listar(idUsuario: number, refreshToken?: string) {
    const actual = refreshToken ? hashRefreshToken(refreshToken) : null;
    const filas = await this.prisma.tokenRefresco.findMany({
      where: this.vivas(idUsuario),
      orderBy: { fechaCreacion: 'desc' },
      select: { idSesion: true, navegador: true, sistema: true, fechaCreacion: true, tokenHash: true },
    });
    return filas.map((f) => ({
      idSesion: f.idSesion,
      navegador: f.navegador ?? 'Navegador desconocido',
      sistema: f.sistema ?? 'Sistema desconocido',
      ultimoUso: f.fechaCreacion.toISOString(),
      actual: f.tokenHash === actual,
    }));
  }

  /** `actual` = la sesión cerrada era la del propio request (el controlador limpia las cookies). */
  async cerrar(idUsuario: number, idSesion: string, refreshToken?: string) {
    const fila = await this.prisma.tokenRefresco.findFirst({
      where: { ...this.vivas(idUsuario), idSesion },
      select: { tokenHash: true },
    });
    if (!fila) throw new NotFoundException(NO_ENCONTRADA);
    await this.revocar(idUsuario, idSesion);
    return { cerrada: true, actual: this.esActual(fila.tokenHash, refreshToken) };
  }

  async cerrarOtras(idUsuario: number, refreshToken?: string) {
    const ahora = new Date();
    const { count } = await this.prisma.tokenRefresco.updateMany({
      where: {
        ...this.vivas(idUsuario),
        ...(refreshToken ? { tokenHash: { not: hashRefreshToken(refreshToken) } } : {}),
      },
      // expiraEn = ahora marca el cierre deliberado: el refresh de ese token no se trata como robo.
      data: { revocadoEn: ahora, expiraEn: ahora },
    });
    return { cerradas: count };
  }

  /** «No fui yo»: cierra esa sesión, olvida su dispositivo y marca el aviso como leído; la contraseña la cambia el usuario. */
  async noFuiYo(idUsuario: number, idSesion: string, refreshToken?: string, origen?: SecurityRequestContext) {
    const fila = await this.prisma.tokenRefresco.findFirst({
      where: { idUsuario, idSesion },
      orderBy: { fechaCreacion: 'desc' },
      select: { huella: true, tokenHash: true },
    });
    if (!fila) throw new NotFoundException(NO_ENCONTRADA);
    await this.revocar(idUsuario, idSesion);
    if (fila.huella) {
      await this.prisma.dispositivoUsuario.deleteMany({ where: { idUsuario, huella: fila.huella } });
    }
    await this.prisma.notificacion.updateMany({
      where: {
        idUsuario,
        tipoNotificacion: 'NUEVO_INICIO_SESION',
        leidaEn: null,
        datosJson: { path: ['idSesion'], equals: idSesion },
      },
      data: { leidaEn: new Date() },
    });
    await this.securityEvents.record({
      tipo: TipoEventoSeguridad.SESSION_REPORTED_UNKNOWN,
      origen,
      idActor: idUsuario,
      idUsuarioAfectado: idUsuario,
    });
    return { cerrada: true, actual: this.esActual(fila.tokenHash, refreshToken), cambiarContrasena: true };
  }

  private revocar(idUsuario: number, idSesion: string) {
    const ahora = new Date();
    return this.prisma.tokenRefresco.updateMany({
      where: { idUsuario, idSesion, revocadoEn: null },
      // expiraEn = ahora marca el cierre deliberado: el refresh de ese token no se trata como robo.
      data: { revocadoEn: ahora, expiraEn: ahora },
    });
  }

  private esActual(tokenHash: string, refreshToken?: string): boolean {
    return Boolean(refreshToken) && tokenHash === hashRefreshToken(refreshToken as string);
  }
}
