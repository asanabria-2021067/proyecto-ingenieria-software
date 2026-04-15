import {
  Controller,
  Get,
  Patch,
  Put,
  Post,
  Body,
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

@Controller('usuarios')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: { userId: number }) {
    return this.usersService.getMe(user.userId);
  }

  @Get('me/perfil')
  getProfile(@CurrentUser() user: { userId: number }) {
    return this.usersService.getProfile(user.userId);
  }

  @Patch('me/perfil')
  async updateProfile(
    @CurrentUser() user: { userId: number },
    @Body() dto: UpdateProfileDto,
  ) {
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

  @Get('me/dashboard')
  getDashboard(@CurrentUser() user: { userId: number }) {
    return this.usersService.getDashboard(user.userId);
  }
}
