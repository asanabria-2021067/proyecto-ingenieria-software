import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { NextFunction, Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { getJwtSecret } from '../config/jwt-secret';
import { MaintenanceService } from './maintenance.service';

/** Rutas que siguen respondiendo en mantenimiento para poder iniciar sesión y consultar el estado. */
const EXENTAS = [
  /^\/api\/?$/,
  /^\/api\/health(\/|$)/,
  /^\/api\/carreras\/?$/,
  /^\/api\/mantenimiento\/?$/,
  /^\/api\/admin(\/|$)/,
  /^\/api\/auth\/(login|refresh|logout)\/?$/,
];

@Injectable()
export class MaintenanceMiddleware implements NestMiddleware {
  private readonly logger = new Logger(MaintenanceMiddleware.name);

  constructor(
    private readonly maintenance: MaintenanceService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const path = req.originalUrl.split('?')[0];
    if (req.method === 'OPTIONS' || EXENTAS.some((re) => re.test(path))) return next();
    let bloquear: Awaited<ReturnType<MaintenanceService['estado']>>;
    try {
      bloquear = await this.maintenance.estado();
    } catch (error) {
      // Si no se puede leer el estado, la plataforma sigue funcionando como antes.
      this.logger.warn(`No se pudo leer el estado de mantenimiento: ${(error as Error).message}`);
      return next();
    }
    if (!bloquear.bloqueando || (await this.esAdmin(req))) return next();
    res.status(503).json({
      statusCode: 503,
      codigo: 'MANTENIMIENTO',
      message: bloquear.mensaje,
      regresoEstimado: bloquear.regresoEstimado,
    });
  }

  private async esAdmin(req: Request): Promise<boolean> {
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
    const token = req.cookies?.access_token || bearer;
    if (!token) return false;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: number; tipo?: string }>(token, { secret: getJwtSecret() });
      if (payload.tipo !== 'access') return false;
      const rol = await this.prisma.usuarioRolAcceso.findFirst({
        where: { idUsuario: payload.sub, rolAcceso: { nombrePerfil: 'administrador' }, usuario: { estado: 'ACTIVO' } },
        select: { idUsuarioRolAcceso: true },
      });
      return rol !== null;
    } catch {
      return false;
    }
  }
}
