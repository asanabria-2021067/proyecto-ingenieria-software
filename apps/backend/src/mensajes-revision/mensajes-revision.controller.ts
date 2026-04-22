import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MensajesRevisionService } from './mensajes-revision.service';
import { CreateMensajeRevisionDto } from './dto/create-mensaje-revision.dto';

@Controller('mensajes-revision')
@UseGuards(JwtAuthGuard)
export class MensajesRevisionController {
  constructor(private readonly mensajesRevisionService: MensajesRevisionService) {}

  @Get('proyectos/:idProyecto')
  findByProyecto(
    @Param('idProyecto', ParseIntPipe) idProyecto: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.mensajesRevisionService.findByProyecto(idProyecto, user.userId);
  }

  @Post('proyectos/:idProyecto')
  create(
    @Param('idProyecto', ParseIntPipe) idProyecto: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: CreateMensajeRevisionDto,
  ) {
    return this.mensajesRevisionService.create(idProyecto, user.userId, dto);
  }

  @Patch('proyectos/:idProyecto/marcar-leidos')
  markAsRead(
    @Param('idProyecto', ParseIntPipe) idProyecto: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.mensajesRevisionService.markAsRead(idProyecto, user.userId);
  }
}
