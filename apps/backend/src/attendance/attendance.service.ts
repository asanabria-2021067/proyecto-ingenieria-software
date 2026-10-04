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

  private lockedProject(ctx: Pick<ProjectTransactionContext, 'project'>): ProjectLockRow {
    if (!ctx.project) {
      throw new NotFoundException('Proyecto no encontrado');
    }
    return ctx.project;
  }

  async crearActividad(projectId: number, userId: number, dto: CreateActividadDto): Promise<ActividadPublica> {
    return this.projectTx.run(projectId, userId, 'attendance.crearActividad', async (ctx) => {
      const { tx } = ctx;
      const project = this.lockedProject(ctx);
      await this.policy.assertWriteTx(tx, project, 'ACTIVIDAD_ASISTENCIA', userId);

      const actividad = await tx.actividadProyecto.create({
        data: {
          idProyecto: projectId,
          tituloActividad: dto.tituloActividad,
          tipoActividad: dto.tipoActividad,
          fechaActividad: new Date(`${dto.fechaActividad}T00:00:00.000Z`),
          horasValor: dto.horasValor,
          creadoPor: userId,
        },
        select: ACTIVIDAD_SELECT,
      });

      await this.bitacoraEventos?.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.ACTIVITY_CREATED,
        idActor: userId,
        idProyecto: projectId,
        tipoEntidad: 'ACTIVIDAD',
        idEntidad: actividad.idActividad,
        valorNuevo: {
          tituloActividad: actividad.tituloActividad,
          tipoActividad: actividad.tipoActividad,
          fechaActividad: toDateOnly(actividad.fechaActividad),
          horasValor: dto.horasValor,
        },
      });

      return mapActividad(actividad);
    });
  }

  async listarActividades(projectId: number, userId: number): Promise<ActividadResumen[]> {
    await this.readPolicy.assertRead(undefined, { projectId, actorId: userId, scope: 'asistencia' });

    const [actividades, totalIntegrantes] = await Promise.all([
      this.prisma.actividadProyecto.findMany({
        where: { idProyecto: projectId },
        orderBy: [{ fechaActividad: 'desc' }, { idActividad: 'desc' }],
        select: { ...ACTIVIDAD_SELECT, asistencias: { select: { asistio: true } } },
      }),
      this.prisma.participacionProyecto.count({
        where: { estadoParticipacion: EstadoParticipacion.ACTIVO, rolProyecto: { idProyecto: projectId } },
      }),
    ]);

    return actividades.map(({ asistencias, ...actividad }) => ({
      ...mapActividad(actividad),
      totalIntegrantes,
      totalAsistieron: asistencias.filter((a) => a.asistio).length,
    }));
  }

  async obtenerActividad(projectId: number, userId: number, actividadId: number): Promise<ActividadDetalle> {
    await this.readPolicy.assertRead(undefined, { projectId, actorId: userId, scope: 'asistencia' });

    const actividad = await this.prisma.actividadProyecto.findFirst({
      where: { idActividad: actividadId, idProyecto: projectId },
      select: ACTIVIDAD_SELECT,
    });
    if (!actividad) {
      throw new NotFoundException(`Actividad con id ${actividadId} no encontrada en el proyecto ${projectId}`);
    }

    const [integrantes, asistencias] = await Promise.all([
      this.prisma.participacionProyecto.findMany({
        where: { estadoParticipacion: EstadoParticipacion.ACTIVO, rolProyecto: { idProyecto: projectId } },
        select: { usuario: { select: { idUsuario: true, nombre: true, apellido: true, fotoUrl: true } } },
        distinct: ['idUsuario'],
      }),
      this.prisma.asistenciaActividad.findMany({
        where: { idActividad: actividadId },
        select: { idUsuario: true, asistio: true, confirmadoEn: true },
      }),
    ]);

    const asistenciaPorUsuario = new Map(asistencias.map((a) => [a.idUsuario, a]));

    return {
      ...mapActividad(actividad),
      integrantes: integrantes.map(({ usuario }) => {
        const fila = asistenciaPorUsuario.get(usuario.idUsuario);
        return {
          ...usuario,
          asistio: fila?.asistio ?? false,
          confirmadoEn: fila?.confirmadoEn ? fila.confirmadoEn.toISOString() : null,
        };
      }),
    };
  }

  async marcarAsistencia(
    projectId: number,
    leaderId: number,
    actividadId: number,
    targetUserId: number,
    dto: MarkAttendanceDto,
  ): Promise<AsistenciaPublica> {
    return this.projectTx.run(projectId, leaderId, 'attendance.marcarAsistencia', async (ctx) => {
      const { tx } = ctx;
      const project = this.lockedProject(ctx);
      await this.policy.assertWriteTx(tx, project, 'ACTIVIDAD_ASISTENCIA', leaderId);

      const actividad = await tx.actividadProyecto.findFirst({
        where: { idActividad: actividadId, idProyecto: projectId },
        select: { idActividad: true, horasValor: true, fechaActividad: true },
      });
      if (!actividad) {
        throw new NotFoundException(`Actividad con id ${actividadId} no encontrada en el proyecto ${projectId}`);
      }

      const anterior = await tx.asistenciaActividad.findUnique({
        where: { idActividad_idUsuario: { idActividad: actividadId, idUsuario: targetUserId } },
        select: { asistio: true },
      });

      const resultado = await this.markAttendanceTx(tx, {
        projectId,
        actividad,
        targetUserId,
        leaderId,
        asistio: dto.asistio,
      });

      await this.bitacoraEventos?.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.ATTENDANCE_MARKED,
        idActor: leaderId,
        idProyecto: projectId,
        tipoEntidad: 'ACTIVIDAD',
        idEntidad: actividadId,
        valorAnterior: { idUsuario: targetUserId, asistio: anterior?.asistio ?? false },
        valorNuevo: {
          idUsuario: targetUserId,
          asistio: dto.asistio,
          horasAcreditadas: dto.asistio ? actividad.horasValor.toFixed(2) : '0.00',
        },
      });

      return resultado;
    });
  }
}
