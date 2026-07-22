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

  @Get()
  findAll(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.labelsService.findAllForProject(projectId, user.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: CreateLabelDto,
  ) {
    return this.labelsService.create(projectId, user.userId, dto);
  }

  @Patch(':labelId')
  update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('labelId', ParseIntPipe) labelId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: UpdateLabelDto,
  ) {
    return this.labelsService.update(projectId, labelId, user.userId, dto);
  }

  @Delete(':labelId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('labelId', ParseIntPipe) labelId: number,
    @CurrentUser() user: { userId: number },
  ): Promise<void> {
    await this.labelsService.remove(projectId, labelId, user.userId);
  }
}
