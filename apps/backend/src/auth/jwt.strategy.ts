import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { EstadoUsuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { getJwtSecret } from '../config/jwt-secret';

interface JwtPayload {
  sub: number;
  correo: string;
  tipo?: string;
  sv?: number;
}

function extractFromCookie(req: Request): string | null {
  return req?.cookies?.access_token || null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        extractFromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
    });
  }

  async validate(payload: JwtPayload) {
    if (payload.tipo !== 'access') {
      throw new UnauthorizedException('Token no válido para autenticación');
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { idUsuario: payload.sub },
      select: { estado: true, sesionVersion: true },
    });

    // Tokens anteriores a `sv` cuentan como versión 0, igual que la columna por defecto.
    if (!usuario || usuario.estado !== EstadoUsuario.ACTIVO || (payload.sv ?? 0) !== usuario.sesionVersion) {
      throw new UnauthorizedException('Usuario no activo');
    }

    return { userId: payload.sub, correo: payload.correo };
  }
}
