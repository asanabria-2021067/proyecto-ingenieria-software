import { Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FollowsService } from './follows.service';

/** MEJ-18: los permisos viven en el servicio (solo se sigue lo que se puede ver). */
@Controller('seguimientos')
@UseGuards(JwtAuthGuard)
export class FollowsController {
  constructor(private readonly follows: FollowsService) {}

  @Get('mios')
  mios(@CurrentUser() user: { userId: number }) {
    return this.follows.misSeguimientos(user.userId);
  }

  @Get('asociaciones')
  asociaciones(@CurrentUser() user: { userId: number }) {
    return this.follows.catalogoAsociaciones(user.userId);
  }

  @Post('organizaciones/:id')
  @HttpCode(HttpStatus.OK)
  seguirOrganizacion(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { userId: number }) {
    return this.follows.seguirOrganizacion(user.userId, id);
  }

  @Delete('organizaciones/:id')
  dejarOrganizacion(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { userId: number }) {
    return this.follows.dejarOrganizacion(user.userId, id);
  }

  @Post('asociaciones/:id')
  @HttpCode(HttpStatus.OK)
  seguirAsociacion(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { userId: number }) {
    return this.follows.seguirAsociacion(user.userId, id);
  }

  @Delete('asociaciones/:id')
  dejarAsociacion(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: { userId: number }) {
    return this.follows.dejarAsociacion(user.userId, id);
  }
}
