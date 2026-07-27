import {
  Controller,
  Get,
  Patch,
  Put,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import {
  UpdateProfileDto,
  ReplaceHabilidadesDto,
  ReplaceInteresesDto,
  ReplaceCualidadesDto,
  CreateExperienciaDto,
} from './dto/update-profile.dto';
import { GetMisTareasQueryDto } from './dto/get-mis-tareas-query.dto';

@Controller('usuarios')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: { userId: number }) {
    return this.usersService.getMe(user.userId);
  }

  /**
   * Endpoint para obtener los datos completos del perfil del usuario actual
   * (incluye información básica + relaciones)
   */
  @Get('me/perfil')
  getProfile(@CurrentUser() user: { userId: number }) {
    return this.usersService.getProfile(user.userId);
  }

  /**
   * Endpoint para obtener datos iniciales para el formulario de perfil
   * (catálogos + datos actuales del usuario)
   */
  @Get('me/perfil/bootstrap')
  getProfileBootstrap(@CurrentUser() user: { userId: number }) {
    return this.usersService.getProfileBootstrap(user.userId);
  }

  @Patch('me/perfil')
  async updateProfile(
    @CurrentUser() user: { userId: number },
    @Body() dto: UpdateProfileDto,
  ) {
    // Si viene fotoUrl, la actualizamos por separado (lógica especial)
    if (dto.fotoUrl !== undefined) {
      await this.usersService.updateFotoUrl(user.userId, dto.fotoUrl);
    }

    return this.usersService.updateProfile(user.userId, dto);
  }

  @Put('me/habilidades')
  replaceHabilidades(
    @CurrentUser() user: { userId: number },
    @Body() dto: ReplaceHabilidadesDto,
  ) {
    return this.usersService.replaceHabilidades(user.userId, dto.habilidades);
  }

  @Put('me/intereses')
  replaceIntereses(
    @CurrentUser() user: { userId: number },
    @Body() dto: ReplaceInteresesDto,
  ) {
    return this.usersService.replaceIntereses(user.userId, dto.intereses);
  }

  @Put('me/cualidades')
  replaceCualidades(
    @CurrentUser() user: { userId: number },
    @Body() dto: ReplaceCualidadesDto,
  ) {
    return this.usersService.replaceCualidades(user.userId, dto.cualidades);
  }

  @Post('me/experiencias')
  addExperiencia(
    @CurrentUser() user: { userId: number },
    @Body() dto: CreateExperienciaDto,
  ) {
    return this.usersService.addExperiencia(user.userId, dto);
  }

  @Put('me/experiencias')
  replaceExperiencias(
    @CurrentUser() user: { userId: number },
    @Body() dto: { experiencias: CreateExperienciaDto[] },
  ) {
    return this.usersService.replaceExperiencias(user.userId, dto.experiencias);
  }

  @Get('me/dashboard')
  getDashboard(@CurrentUser() user: { userId: number }) {
    return this.usersService.getDashboard(user.userId);
  }

  @Get('me/tareas')
  getMisTareas(
    @CurrentUser() user: { userId: number },
    @Query() query: GetMisTareasQueryDto,
  ) {
    return this.usersService.getMisTareas(user.userId, query);
  }
}