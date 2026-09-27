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
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

/**
 * HU-169 (T-263): CRUD de eventos de calendario, contextualizado por
 * proyecto. El actor proviene exclusivamente de @CurrentUser(); el
 * controller no valida ni persiste nada por sí mismo, delega en EventsService.
 */
@Controller('proyectos/:projectId/eventos')
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(private eventsService: EventsService) {}

  @Get()
  findAll(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.eventsService.findAllForProject(projectId, user.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: CreateEventDto,
  ) {
    return this.eventsService.create(projectId, user.userId, dto);
  }

  @Patch(':eventId')
  update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.update(projectId, eventId, user.userId, dto);
  }

  @Delete(':eventId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('eventId', ParseIntPipe) eventId: number,
    @CurrentUser() user: { userId: number },
  ): Promise<void> {
    await this.eventsService.remove(projectId, eventId, user.userId);
  }
}
