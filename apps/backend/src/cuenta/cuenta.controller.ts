import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthService } from '../auth/auth.service';
import { clearAuthCookies, setAuthCookies } from '../auth/cookie.util';
import { securityRequestContext } from '../security-events/request-context';
import { SesionesService } from './sesiones.service';
import { MisDatosService } from './mis-datos.service';
import { DesactivacionService } from './desactivacion.service';
import { CambiarContrasenaDto } from './dto/cambiar-contrasena.dto';
import { SolicitarDesactivacionDto } from './dto/desactivacion.dto';

type Usuario = { userId: number };

/** MEJ-81 a 85: todo opera sobre la cuenta del token; ninguna ruta recibe un id de usuario. */
@Controller('cuenta')
@UseGuards(JwtAuthGuard)
export class CuentaController {
  constructor(
    private readonly sesiones: SesionesService,
    private readonly misDatos: MisDatosService,
    private readonly desactivacion: DesactivacionService,
    private readonly auth: AuthService,
  ) {}

  @Get('sesiones')
  listarSesiones(@CurrentUser() user: Usuario, @Req() req: Request) {
    return this.sesiones.listar(user.userId, req.cookies?.refresh_token);
  }

  @Post('sesiones/cerrar-otras')
  @HttpCode(200)
  cerrarOtras(@CurrentUser() user: Usuario, @Req() req: Request) {
    return this.sesiones.cerrarOtras(user.userId, req.cookies?.refresh_token);
  }

  @Delete('sesiones/:idSesion')
  async cerrarSesion(
    @CurrentUser() user: Usuario,
    @Param('idSesion', ParseUUIDPipe) idSesion: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.sesiones.cerrar(user.userId, idSesion, req.cookies?.refresh_token);
    if (r.actual) clearAuthCookies(res);
    return r;
  }

  @Post('sesiones/:idSesion/no-fui-yo')
  @HttpCode(200)
  async noFuiYo(
    @CurrentUser() user: Usuario,
    @Param('idSesion', ParseUUIDPipe) idSesion: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.sesiones.noFuiYo(user.userId, idSesion, req.cookies?.refresh_token, securityRequestContext(req));
    if (r.actual) clearAuthCookies(res);
    return r;
  }

  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @Post('contrasena')
  @HttpCode(200)
  async cambiarContrasena(
    @CurrentUser() user: Usuario,
    @Body() dto: CambiarContrasenaDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken } = await this.auth.cambiarContrasena(
      user.userId,
      dto.contrasenaActual,
      dto.nuevaContrasena,
      req.cookies?.refresh_token,
      securityRequestContext(req),
    );
    setAuthCookies(res, accessToken, refreshToken);
    return { mensaje: 'Contraseña actualizada. Se cerraron tus otras sesiones' };
  }

  // 3 descargas por hora y por IP.
  @Throttle({ long: { limit: 3, ttl: 3_600_000 } })
  @Get('mis-datos')
  async descargarMisDatos(@CurrentUser() user: Usuario, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Content-Disposition', 'attachment; filename="mis-datos-uvg-scholar.json"');
    return this.misDatos.exportar(user.userId);
  }

  @Get('desactivacion')
  miSolicitud(@CurrentUser() user: Usuario) {
    return this.desactivacion.miSolicitud(user.userId);
  }

  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @Post('desactivacion')
  solicitarDesactivacion(@CurrentUser() user: Usuario, @Body() dto: SolicitarDesactivacionDto) {
    return this.desactivacion.solicitar(user.userId, dto.motivo);
  }
}
