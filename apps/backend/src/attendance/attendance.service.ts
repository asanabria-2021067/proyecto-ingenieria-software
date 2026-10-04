import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EstadoParticipacion, Prisma, TipoActividad } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ProjectTransactionService,
  type ProjectLockRow,
  type ProjectTransactionContext,
} from '../common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { ProjectReadPolicyService } from '../common/project-policy/project-read-policy.service';
import { BitacoraEventosService } from '../bitacora/bitacora-eventos.service';
import { TipoEventoBitacora } from '../bitacora/tipos-evento-bitacora';
import { CreateActividadDto } from './dto/create-actividad.dto';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';

const ACTIVIDAD_SELECT = {
  idActividad: true,
  idProyecto: true,
  tituloActividad: true,
  tipoActividad: true,
  fechaActividad: true,
  horasValor: true,
  creadoPor: true,
  creadoEn: true,
} satisfies Prisma.ActividadProyectoSelect;

type ActividadRow = Prisma.ActividadProyectoGetPayload<{ select: typeof ACTIVIDAD_SELECT }>;

export interface ActividadPublica {
  idActividad: number;
  idProyecto: number;
  tituloActividad: string;
  tipoActividad: TipoActividad;
  fechaActividad: string;
  horasValor: number;
  creadoPor: number;
  creadoEn: string;
}

export interface ActividadResumen extends ActividadPublica {
  totalIntegrantes: number;
  totalAsistieron: number;
}

export interface IntegranteAsistencia {
  idUsuario: number;
  nombre: string;
  apellido: string;
  fotoUrl: string | null;
  asistio: boolean;
  confirmadoEn: string | null;
}

export interface ActividadDetalle extends ActividadPublica {
  integrantes: IntegranteAsistencia[];
}

export interface AsistenciaPublica {
  idAsistencia: number;
  idActividad: number;
  idUsuario: number;
  asistio: boolean;
  confirmadoPor: number | null;
  confirmadoEn: string | null;
  idRegistroHoras: number | null;
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function mapActividad(row: ActividadRow): ActividadPublica {
  return {
    idActividad: row.idActividad,
    idProyecto: row.idProyecto,
    tituloActividad: row.tituloActividad,
    tipoActividad: row.tipoActividad,
    fechaActividad: toDateOnly(row.fechaActividad),
    horasValor: row.horasValor.toNumber(),
    creadoPor: row.creadoPor,
    creadoEn: row.creadoEn.toISOString(),
  };
}

/**
 * T-295/T-296/T-297 (HU-177): el líder crea actividades (reunión, jornada,
 * taller) con un valor fijo de horas y marca la asistencia de cada
 * integrante. Confirmar asistencia acredita esas horas en HorasParticipacion
 * — el mismo modelo que lee "Mis horas" (HU-158, ver
 * ProjectHoursSummaryService) — en vez de inventar un sistema paralelo.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectTx: ProjectTransactionService,
    private readonly policy: ProjectPolicyService,
    private readonly readPolicy: ProjectReadPolicyService,
    // Opcional por el mismo motivo que en TimeRecordsService: las suites
    // unitarias instancian el servicio con argumentos posicionales.
    private readonly bitacoraEventos?: BitacoraEventosService,
  ) {}
}
