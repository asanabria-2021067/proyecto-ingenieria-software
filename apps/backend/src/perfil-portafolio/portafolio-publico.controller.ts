import { Controller, Get, Header, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PortafolioService } from './portafolio.service';

/**
 * UNICA ruta sin sesion del perfil (declarada en RUTAS_PUBLICAS). Sin guards ni cookies: solo responde con un token
 * opaco vigente y devuelve la lista blanca de PortafolioService.publico. Sin cache para que desactivar tenga efecto inmediato.
 */
@Controller('publico/portafolio')
export class PortafolioPublicoController {
  constructor(private readonly portafolio: PortafolioService) {}

  @Throttle({ short: { limit: 60, ttl: 60000 } })
  @Get(':token')
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  ver(@Param('token') token: string) {
    return this.portafolio.publico(token);
  }
}
