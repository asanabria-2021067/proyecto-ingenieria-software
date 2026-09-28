import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EstadoUsuario } from '@prisma/client';
import type { Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { extractCookie } from '../common/utils/cookie';

/**
 * G07 (OWASP25-C025): política única de autenticación del handshake
 * WebSocket, con la MISMA regla que el HTTP (auth/jwt.strategy.ts): firma
 * válida con el secreto de G01, token de tipo `access` y cuenta ACTIVO
 * consultada en cada conexión. Un token de reset (firmado con el mismo
 * secreto) o de refresh no abre un socket, y una cuenta BLOQUEADO o
 * INACTIVO tampoco aunque su access token siga vigente: el estado se lee de
 * la base, nunca de los claims.
 *
 * NotificationsModule y ChatModule la proveen con su propio JwtService, que ya
 * toma el secreto del proveedor validado de G01 (config/jwt-secret.ts).
 */

export type WsAuthRejection = 'SIN_TOKEN' | 'TOKEN_INVALIDO' | 'TIPO_NO_ACCESS' | 'CUENTA_NO_ACTIVA';

export type WsAuthResult = { ok: true; userId: number } | { ok: false; motivo: WsAuthRejection };

export type WsHandshake = Pick<Socket['handshake'], 'auth' | 'headers'>;

/** Mismas fuentes y mismo orden que usaban los gateways: `auth.token`, `Authorization: Bearer` y la cookie httpOnly. */
export function extractWsToken(handshake: WsHandshake): string | null {
  const authToken: unknown = handshake.auth?.token;
  if (typeof authToken === 'string' && authToken.length > 0) {
    return authToken;
  }
  const authorization = handshake.headers?.authorization;
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    const bearer = authorization.slice('Bearer '.length).trim();
    if (bearer.length > 0) {
      return bearer;
    }
  }
  return extractCookie(handshake.headers?.cookie, 'access_token');
}

@Injectable()
export class WsAuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async authenticate(handshake: WsHandshake): Promise<WsAuthResult> {
    const token = extractWsToken(handshake);
    if (!token) {
      return { ok: false, motivo: 'SIN_TOKEN' };
    }

    let payload: { sub?: unknown; tipo?: unknown };
    try {
      payload = await this.jwtService.verifyAsync(token);
    } catch {
      return { ok: false, motivo: 'TOKEN_INVALIDO' };
    }

    if (payload.tipo !== 'access') {
      return { ok: false, motivo: 'TIPO_NO_ACCESS' };
    }
    const userId = payload.sub;
    if (typeof userId !== 'number' || !Number.isInteger(userId)) {
      return { ok: false, motivo: 'TOKEN_INVALIDO' };
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { idUsuario: userId },
      select: { estado: true },
    });
    if (!usuario || usuario.estado !== EstadoUsuario.ACTIVO) {
      return { ok: false, motivo: 'CUENTA_NO_ACTIVA' };
    }

    return { ok: true, userId };
  }
}
