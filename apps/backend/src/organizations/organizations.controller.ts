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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OrganizationsService } from './organizations.service';
import { OrganizationInvitationsService } from './organization-invitations.service';
import { listarPlantillas } from './organization-templates';
import { OrganizationChatService } from './organization-chat.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { InviteMemberDto, SearchCandidatesQueryDto } from './dto/invite-member.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { TransferOwnershipDto } from './dto/transfer-ownership.dto';
import { SendOrgMessageDto } from './dto/send-org-message.dto';
import { ListOrganizationsQueryDto } from './dto/list-organizations-query.dto';

type Usuario = { userId: number };

/** Todas las rutas exigen sesión; los permisos por rol se verifican en los servicios. */
@Controller('organizaciones')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(
    private organizations: OrganizationsService,
    private invitations: OrganizationInvitationsService,
    private chat: OrganizationChatService,
  ) {}

  @Post()
  create(@Body() dto: CreateOrganizationDto, @CurrentUser() user: Usuario) {
    return this.organizations.create(user.userId, dto);
  }

  /** MEJ-156: plantillas disponibles (la fuente es el backend). */
  @Get('plantillas')
  plantillas() {
    return listarPlantillas();
  }

  /** `GET /organizaciones` ya es el catálogo de organizaciones (CatalogsController). */
  @Get('buscar')
  search(@Query() query: ListOrganizationsQueryDto, @CurrentUser() user: Usuario) {
    return this.organizations.search(user.userId, query);
  }

  @Get('mias')
  listMine(@CurrentUser() user: Usuario) {
    return this.organizations.listMine(user.userId);
  }

  @Get('invitaciones/mias')
  listMyInvitations(@CurrentUser() user: Usuario) {
    return this.invitations.listMine(user.userId);
  }

  @Post('invitaciones/:idInvitacion/aceptar')
  @HttpCode(HttpStatus.OK)
  acceptInvitation(@Param('idInvitacion', ParseIntPipe) idInvitacion: number, @CurrentUser() user: Usuario) {
    return this.invitations.respond(user.userId, idInvitacion, true);
  }

  @Post('invitaciones/:idInvitacion/rechazar')
  @HttpCode(HttpStatus.OK)
  rejectInvitation(@Param('idInvitacion', ParseIntPipe) idInvitacion: number, @CurrentUser() user: Usuario) {
    return this.invitations.respond(user.userId, idInvitacion, false);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Usuario) {
    return this.organizations.detail(user.userId, id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOrganizationDto, @CurrentUser() user: Usuario) {
    return this.organizations.update(user.userId, id, dto);
  }

  @Post(':id/archivar')
  @HttpCode(HttpStatus.OK)
  archive(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Usuario) {
    return this.organizations.archive(user.userId, id);
  }

  @Post(':id/transferir')
  @HttpCode(HttpStatus.OK)
  transfer(@Param('id', ParseIntPipe) id: number, @Body() dto: TransferOwnershipDto, @CurrentUser() user: Usuario) {
    return this.organizations.transferOwnership(user.userId, id, dto.idUsuario);
  }

  @Post(':id/salir')
  @HttpCode(HttpStatus.NO_CONTENT)
  leave(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Usuario) {
    return this.organizations.leave(user.userId, id);
  }

  @Get(':id/bitacora')
  auditLog(@Param('id', ParseIntPipe) id: number, @Query() query: ListOrganizationsQueryDto, @CurrentUser() user: Usuario) {
    return this.organizations.auditLog(user.userId, id, query);
  }

  @Patch(':id/miembros/:idUsuario')
  changeRole(
    @Param('id', ParseIntPipe) id: number,
    @Param('idUsuario', ParseIntPipe) idUsuario: number,
    @Body() dto: ChangeRoleDto,
    @CurrentUser() user: Usuario,
  ) {
    return this.organizations.changeRole(user.userId, id, idUsuario, dto.rolOrganizacion);
  }

  @Delete(':id/miembros/:idUsuario')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Param('id', ParseIntPipe) id: number,
    @Param('idUsuario', ParseIntPipe) idUsuario: number,
    @CurrentUser() user: Usuario,
  ) {
    return this.organizations.removeMember(user.userId, id, idUsuario);
  }

  @Get(':id/candidatos')
  candidates(@Param('id', ParseIntPipe) id: number, @Query() query: SearchCandidatesQueryDto, @CurrentUser() user: Usuario) {
    return this.invitations.candidates(user.userId, id, query.q);
  }

  @Get(':id/invitaciones')
  listInvitations(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Usuario) {
    return this.invitations.listForOrganization(user.userId, id);
  }

  @Post(':id/invitaciones')
  invite(@Param('id', ParseIntPipe) id: number, @Body() dto: InviteMemberDto, @CurrentUser() user: Usuario) {
    return this.invitations.invite(user.userId, id, dto);
  }

  @Delete(':id/invitaciones/:idInvitacion')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancelInvitation(
    @Param('id', ParseIntPipe) id: number,
    @Param('idInvitacion', ParseIntPipe) idInvitacion: number,
    @CurrentUser() user: Usuario,
  ) {
    return this.invitations.cancel(user.userId, id, idInvitacion);
  }

  @Get(':id/solicitudes')
  listRequests(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Usuario) {
    return this.invitations.listRequests(user.userId, id);
  }

  @Post(':id/solicitudes')
  requestJoin(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Usuario) {
    return this.invitations.requestJoin(user.userId, id);
  }

  @Post(':id/solicitudes/:idSolicitud/aceptar')
  @HttpCode(HttpStatus.OK)
  acceptRequest(
    @Param('id', ParseIntPipe) id: number,
    @Param('idSolicitud', ParseIntPipe) idSolicitud: number,
    @CurrentUser() user: Usuario,
  ) {
    return this.invitations.resolveRequest(user.userId, id, idSolicitud, true);
  }

  @Post(':id/solicitudes/:idSolicitud/rechazar')
  @HttpCode(HttpStatus.OK)
  rejectRequest(
    @Param('id', ParseIntPipe) id: number,
    @Param('idSolicitud', ParseIntPipe) idSolicitud: number,
    @CurrentUser() user: Usuario,
  ) {
    return this.invitations.resolveRequest(user.userId, id, idSolicitud, false);
  }

  @Get(':id/chat')
  getChat(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Usuario) {
    return this.chat.obtenerCanal(user.userId, id);
  }

  @Get(':id/chat/mensajes')
  getChatMessages(
    @Param('id', ParseIntPipe) id: number,
    @Query('cursor') cursor: string | undefined,
    @CurrentUser() user: Usuario,
  ) {
    const cursorId = cursor ? parseInt(cursor, 10) : undefined;
    return this.chat.mensajes(user.userId, id, Number.isInteger(cursorId) ? cursorId : undefined);
  }

  @Post(':id/chat/mensajes')
  sendChatMessage(@Param('id', ParseIntPipe) id: number, @Body() dto: SendOrgMessageDto, @CurrentUser() user: Usuario) {
    return this.chat.enviar(user.userId, id, dto.contenido);
  }

  @Get(':id/chat/fijados')
  getChatPinned(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: Usuario) {
    return this.chat.fijados(user.userId, id);
  }

  @Put(':id/chat/mensajes/:idMensaje/fijado')
  pinChatMessage(
    @Param('id', ParseIntPipe) id: number,
    @Param('idMensaje', ParseIntPipe) idMensaje: number,
    @CurrentUser() user: Usuario,
  ) {
    return this.chat.fijar(user.userId, id, idMensaje, true);
  }

  @Delete(':id/chat/mensajes/:idMensaje/fijado')
  unpinChatMessage(
    @Param('id', ParseIntPipe) id: number,
    @Param('idMensaje', ParseIntPipe) idMensaje: number,
    @CurrentUser() user: Usuario,
  ) {
    return this.chat.fijar(user.userId, id, idMensaje, false);
  }
}
