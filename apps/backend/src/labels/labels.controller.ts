import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { LabelsService } from './labels.service';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProjectWriteGuard } from '../common/guards/project-write.guard';
import { ProjectWrite, type ProjectWriteMetadata } from '../common/guards/project-write.metadata';

/**
 * C035 (06 v2 §32/§41 E023–E025): metadata explícita por handler. El proyecto
 * se resuelve desde `params.projectId`; el CRUD de etiquetas admite B/R/O/P/E
 * con ambiente `ANY`. La protección de vínculos de Sprint cerrado vive en el
 * servicio, dentro del lock.
 */
const LABEL_CRUD: ProjectWriteMetadata = {
  source: { kind: 'param', name: 'projectId' },
  states: ['B', 'R', 'O', 'P', 'E'],
  sprint: 'ANY',
  family: 'ETIQUETA_CRUD',
};

/**
 * Tarea 31: CRUD de etiquetas contextualizado por proyecto. El actor
 * proviene exclusivamente de `@CurrentUser()` (nunca de body/query/headers);
 * `projectId`/`labelId` siempre vía `ParseIntPipe`. El controller no valida
 * ni persiste nada por sí mismo: delega íntegramente en LabelsService.
 */
@Controller('proyectos/:projectId/etiquetas')
@UseGuards(JwtAuthGuard)
export class LabelsController {
  constructor(private labelsService: LabelsService) {}

  /** E022: lectura (alcance §34 en el servicio); sin metadata de escritura. */
  @Get()
  findAll(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.labelsService.findAllForProject(projectId, user.userId);
  }

  /** E023: crear etiqueta. */
  @Post()
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(LABEL_CRUD)
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: CreateLabelDto,
  ) {
    return this.labelsService.create(projectId, user.userId, dto);
  }

  /** E024: editar etiqueta (renombrar con vínculo cerrado → 409). */
  @Patch(':labelId')
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(LABEL_CRUD)
  update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('labelId', ParseIntPipe) labelId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: UpdateLabelDto,
  ) {
    return this.labelsService.update(projectId, labelId, user.userId, dto);
  }

  /** E025: eliminar etiqueta (vínculo cerrado → 409). */
  @Delete(':labelId')
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(LABEL_CRUD)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('labelId', ParseIntPipe) labelId: number,
    @CurrentUser() user: { userId: number },
  ): Promise<void> {
    await this.labelsService.remove(projectId, labelId, user.userId);
  }
}
