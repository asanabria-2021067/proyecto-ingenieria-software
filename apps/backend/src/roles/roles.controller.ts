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
import { ProjectWriteGuard } from '../common/guards/project-write.guard';
import { ProjectWrite, type ProjectWriteMetadata } from '../common/guards/project-write.metadata';

/**
 * C034 (06 v2 §32/§41 E017–E021): metadata explícita por handler. El proyecto
 * se resuelve desde `params.projectId`; el CRUD de roles admite B/R/O/P/E con
 * ambiente `ANY` (sin mutar filas de Sprint cerrado); la alta y el retiro de
 * participación exigen `NOT_FINALIZING`.
 */
const ROLE_CRUD: ProjectWriteMetadata = {
  source: { kind: 'param', name: 'projectId' },
  states: ['B', 'R', 'O', 'P', 'E'],
  sprint: 'ANY',
  family: 'ROL_CRUD',
};
const ROLE_SELF_ASSIGN: ProjectWriteMetadata = {
  ...ROLE_CRUD,
  sprint: 'NOT_FINALIZING',
  family: 'ROL_ALTA_PARTICIPACION',
};
const ROLE_LEAVE: ProjectWriteMetadata = {
  ...ROLE_CRUD,
  sprint: 'NOT_FINALIZING',
  family: 'ROL_RETIRO',
};

/**
 * Roles y participación operativa (Secciones 6, 8, 9, 10). Rutas anidadas bajo
 * el proyecto real de la URL; nunca se usa un projectId fijo. El backend es la
 * autoridad: cada acción valida líder/participación y estado del recurso.
 */
@Controller('proyectos/:projectId/roles')
@UseGuards(JwtAuthGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  /** E016: lectura (alcance §34 en el servicio); sin metadata de escritura. */
  @Get()
  list(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.rolesService.listRoles(projectId, user.userId);
  }

  /** E017: crear rol. */
  @Post()
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(ROLE_CRUD)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: CreateRoleDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.rolesService.createRole(projectId, dto, user.userId);
  }

  /** E018: editar rol. */
  @Patch(':roleId')
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(ROLE_CRUD)
  update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: { userId: number },
  ) {
    return this.rolesService.updateRole(projectId, roleId, dto, user.userId);
  }

  /** E019: eliminar rol (conserva los checks de referencias). */
  @Delete(':roleId')
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(ROLE_CRUD)
  @HttpCode(HttpStatus.OK)
  remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('roleId', ParseIntPipe) roleId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.rolesService.deleteRole(projectId, roleId, user.userId);
  }

  /** E020: autoasignación del líder a un rol (Sección 6). Texto UI: "Asignarme a este rol". */
  @Post(':roleId/participacion')
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(ROLE_SELF_ASSIGN)
  @HttpCode(HttpStatus.CREATED)
  selfAssign(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('roleId', ParseIntPipe) roleId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.rolesService.selfAssign(projectId, roleId, user.userId);
  }

  /** E021: retiro limitado de un rol (Sección 10). Texto UI: "Salir de este rol". */
  @Delete(':roleId/participacion')
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(ROLE_LEAVE)
  @HttpCode(HttpStatus.OK)
  leave(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('roleId', ParseIntPipe) roleId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.rolesService.leaveRole(projectId, roleId, user.userId);
  }
}
