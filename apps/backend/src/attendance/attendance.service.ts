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
