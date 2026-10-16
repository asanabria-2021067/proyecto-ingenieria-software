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
import { ChatCanalesService } from './chat-canales.service';
import { AddChannelMembersDto } from './dto/add-channel-members.dto';
import { CreateChannelDto } from './dto/create-channel.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('proyectos/:projectId/canales')
@UseGuards(JwtAuthGuard)
export class ChatCanalesController {
  constructor(private canales: ChatCanalesService) {}

  @Get()
  findAll(@Param('projectId', ParseIntPipe) projectId: number, @CurrentUser() user: { userId: number }) {
    return this.canales.listarCanales(projectId, user.userId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: CreateChannelDto,
  ) {
    return this.canales.crearCanal(projectId, user.userId, dto);
  }

  @Post(':channelId/miembros')
  @HttpCode(HttpStatus.NO_CONTENT)
  addMembers(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('channelId', ParseIntPipe) channelId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: AddChannelMembersDto,
  ) {
    return this.canales.agregarMiembros(projectId, channelId, user.userId, dto.idsUsuarios);
  }

  @Delete(':channelId/miembros/:memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('channelId', ParseIntPipe) channelId: number,
    @Param('memberId', ParseIntPipe) memberId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.canales.quitarMiembro(projectId, channelId, user.userId, memberId);
  }
}
