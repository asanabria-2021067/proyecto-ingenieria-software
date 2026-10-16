import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MensajesProgramadosService } from './mensajes-programados.service';
import { ScheduleMessageDto } from './dto/schedule-message.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('proyectos/:projectId/conversaciones/:conversationId/programados')
@UseGuards(JwtAuthGuard)
export class MensajesProgramadosController {
  constructor(private programados: MensajesProgramadosService) {}

  @Get()
  findPending(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.programados.listarPendientes(projectId, conversationId, user.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  schedule(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: ScheduleMessageDto,
  ) {
    return this.programados.programar(projectId, conversationId, user.userId, dto);
  }

  @Delete(':scheduledId')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancel(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('conversationId', ParseIntPipe) conversationId: number,
    @Param('scheduledId', ParseIntPipe) scheduledId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.programados.cancelar(projectId, conversationId, scheduledId, user.userId);
  }
}
