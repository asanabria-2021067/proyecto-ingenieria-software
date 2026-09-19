import { BadRequestException, Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BitacoraConsultaService } from './bitacora-consulta.service';
import { TipoEventoBitacora, TipoEventoBitacoraValor } from './tipos-evento-bitacora';

const TIPOS_EVENTO_VALIDOS = TipoEventoBitacora.VALORES;

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

function parseTipoEventoParam(value: string | undefined): TipoEventoBitacoraValor | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!TIPOS_EVENTO_VALIDOS.includes(value as TipoEventoBitacoraValor)) {
    throw new BadRequestException(`tipoEvento debe ser uno de: ${TIPOS_EVENTO_VALIDOS.join(', ')}`);
  }
  return value as TipoEventoBitacoraValor;
}

const FECHA_YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

/** Mismo criterio de fecha que CreateTimeRecordDto/tasks.service.ts: `YYYY-MM-DD` interpretado en UTC. */
function parseFechaParam(value: string | undefined, fieldName: string, finDeDia: boolean): Date | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!FECHA_YYYY_MM_DD.test(value)) {
    throw new BadRequestException(`${fieldName} debe tener el formato YYYY-MM-DD`);
  }
  const fecha = new Date(`${value}T${finDeDia ? '23:59:59.999' : '00:00:00.000'}Z`);
  if (Number.isNaN(fecha.getTime())) {
    throw new BadRequestException(`${fieldName} debe ser una fecha válida`);
  }
  return fecha;
}

/**
 * T-164/HU-170: bitácora semántica de Sprint (HU-140) — único endpoint del
 * módulo (GET, solo lectura); no existe alta, edición ni borrado directo de
 * entradas, que se escriben únicamente como efecto de otras operaciones de
 * dominio ya protegidas por sus propias políticas (crear tarea, cerrar
 * sprint, etc.).
 */
@Controller('proyectos/:projectId/bitacora')
@UseGuards(JwtAuthGuard)
export class BitacoraController {
  constructor(private readonly bitacoraConsulta: BitacoraConsultaService) {}

  /**
   * E091/T-269: la audiencia (líder, admin o participante activo) y qué
   * eventos ve cada uno los decide BitacoraConsultaService.listEventos (§34 +
   * TipoEventoBitacora.ADMINISTRATIVOS) — nunca este controller.
   */
  @Get()
  findAll(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
    @Query('idSprint') idSprintRaw?: string,
    @Query('idActor') idActorRaw?: string,
    @Query('tipoEvento') tipoEventoRaw?: string,
    @Query('desde') desdeRaw?: string,
    @Query('hasta') hastaRaw?: string,
    @Query('page') pageRaw?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const desde = parseFechaParam(desdeRaw, 'desde', false);
    const hasta = parseFechaParam(hastaRaw, 'hasta', true);
    if (desde !== undefined && hasta !== undefined && desde > hasta) {
      throw new BadRequestException('desde no puede ser posterior a hasta');
    }

    return this.bitacoraConsulta.listEventos(projectId, user.userId, {
      idSprint: parsePositiveIntParam(idSprintRaw, 'idSprint'),
      idActor: parsePositiveIntParam(idActorRaw, 'idActor'),
      tipoEvento: parseTipoEventoParam(tipoEventoRaw),
      desde,
      hasta,
      page: parsePaginationParam(pageRaw, 1, Number.MAX_SAFE_INTEGER),
      limit: parsePaginationParam(limitRaw, 20, 50),
    });
  }
}
