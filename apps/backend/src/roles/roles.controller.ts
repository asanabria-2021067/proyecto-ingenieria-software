import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/**
 * Roles y participación operativa (Secciones 6, 8, 9, 10). Rutas anidadas bajo
 * el proyecto real de la URL; nunca se usa un projectId fijo. El backend es la
 * autoridad: cada acción valida líder/participación y estado del recurso.
 */
@Controller('proyectos/:projectId/roles')
@UseGuards(JwtAuthGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  list(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.rolesService.listRoles(projectId, user.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: CreateRoleDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.rolesService.createRole(projectId, dto, user.userId);
  }

  @Patch(':roleId')
  update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.rolesService.updateRole(projectId, roleId, dto, user.userId);
  }

  @Delete(':roleId')
  @HttpCode(HttpStatus.OK)
  remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('roleId', ParseIntPipe) roleId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.rolesService.deleteRole(projectId, roleId, user.userId);
  }

  /** Autoasignación del líder a un rol (Sección 6). Texto UI: "Asignarme a este rol". */
  @Post(':roleId/participacion')
  @HttpCode(HttpStatus.CREATED)
  selfAssign(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('roleId', ParseIntPipe) roleId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.rolesService.selfAssign(projectId, roleId, user.userId);
  }

  /** Retiro limitado de un rol (Sección 10). Texto UI: "Salir de este rol". */
  @Delete(':roleId/participacion')
  @HttpCode(HttpStatus.OK)
  leave(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('roleId', ParseIntPipe) roleId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.rolesService.leaveRole(projectId, roleId, user.userId);
  }
}
