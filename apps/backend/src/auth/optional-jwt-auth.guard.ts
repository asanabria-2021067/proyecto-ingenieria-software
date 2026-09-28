import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * T-251: variante de JwtAuthGuard para rutas públicas que se personalizan
 * SI hay sesión, pero no deben bloquear a quien navega sin login. Nunca
 * lanza: sin token o con uno inválido, `request.user` simplemente queda
 * `undefined` y el handler sigue como anónimo.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(_err: unknown, user: TUser): TUser {
    return user;
  }
}
