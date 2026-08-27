import { BadRequestException, Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BitacoraConsultaService } from './bitacora-consulta.service';
import { TipoEventoBitacora } from './tipos-evento-bitacora';

const TIPOS_EVENTO_VALIDOS = Object.values(TipoEventoBitacora);

/** Mismo criterio de límite que ProjectsController.findAll (tope 50, default 20). */
function parsePaginationParam(value: string | undefined, fallback: number, max: number): number {
  const parsed = parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.min(max, parsed);
}

function parsePositiveIntParam(value: string | undefined, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException(`${fieldName} debe ser un número entero positivo`);
  }
  return parsed;
}

function parseTipoEventoParam(value: string | undefined): TipoEventoBitacora | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!TIPOS_EVENTO_VALIDOS.includes(value as TipoEventoBitacora)) {
    throw new BadRequestException(`tipoEvento debe ser uno de: ${TIPOS_EVENTO_VALIDOS.join(', ')}`);
  }
  return value as TipoEventoBitacora;
}

/** T-164: bitácora semántica de Sprint (HU-140) — exclusiva del líder del proyecto. */
@Controller('proyectos/:projectId/bitacora')
@UseGuards(JwtAuthGuard)
export class BitacoraController {
  constructor(private readonly bitacoraConsulta: BitacoraConsultaService) {}

  @Get()
  findAll(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
    @Query('idSprint') idSprintRaw?: string,
    @Query('idActor') idActorRaw?: string,
    @Query('tipoEvento') tipoEventoRaw?: string,
    @Query('page') pageRaw?: string,
    @Query('limit') limitRaw?: string,
  ) {
    return this.bitacoraConsulta.listEventos(projectId, user.userId, {
      idSprint: parsePositiveIntParam(idSprintRaw, 'idSprint'),
      idActor: parsePositiveIntParam(idActorRaw, 'idActor'),
      tipoEvento: parseTipoEventoParam(tipoEventoRaw),
      page: parsePaginationParam(pageRaw, 1, Number.MAX_SAFE_INTEGER),
      limit: parsePaginationParam(limitRaw, 20, 50),
    });
  }
}
