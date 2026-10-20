import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AttendanceService } from '../src/attendance/attendance.service';
import { TipoEventoBitacora } from '../src/bitacora/tipos-evento-bitacora';
import {
  makeProjectPolicyDouble,
  makeProjectReadPolicyDouble,
  makeProjectTransactionDouble,
} from './helpers/project-policy.double';

const PROJECT_ID = 5;
const LEADER_ID = 1;
const STUDENT_ID = 2;
const OTHER_STUDENT_ID = 3;
const EXTERNO_ID = 99;
const ACTIVIDAD_ID = 40;
const PARTICIPACION_STUDENT = 200;
const PARTICIPACION_OTHER = 300;
const FECHA_ACTIVIDAD = new Date('2026-10-01T00:00:00.000Z');

interface RegistroHorasFila {
  idRegistroHoras: number;
  idParticipacion: number;
  periodoInicio: Date;
  periodoFin: Date;
  horasReportadas: Prisma.Decimal;
  horasCalculadas: Prisma.Decimal;
  horasAprobadas: Prisma.Decimal;
  estadoHoras: string;
  aprobadoPor: number;
  fechaAprobacion: Date;
}

interface AsistenciaFila {
  idAsistencia: number;
  idActividad: number;
  idUsuario: number;
  asistio: boolean;
  confirmadoPor: number | null;
  confirmadoEn: Date | null;
  idRegistroHoras: number | null;
}

type ClaveAsistencia = { idActividad_idUsuario: { idActividad: number; idUsuario: number } };

function makeTx(
  options: {
    horasValor?: number;
    participaciones?: Record<number, number>;
    actividad?: { idActividad: number; idProyecto: number } | null;
  } = {},
) {
  const horasValor = new Prisma.Decimal(options.horasValor ?? 3);
  const participaciones = options.participaciones ?? {
    [STUDENT_ID]: PARTICIPACION_STUDENT,
    [OTHER_STUDENT_ID]: PARTICIPACION_OTHER,
  };
  const actividad =
    options.actividad === undefined ? { idActividad: ACTIVIDAD_ID, idProyecto: PROJECT_ID } : options.actividad;

  const registrosHoras = new Map<number, RegistroHorasFila>();
  const asistencias = new Map<string, AsistenciaFila>();
  let siguienteRegistro = 1000;
  let siguienteAsistencia = 1;
  const clave = (where: ClaveAsistencia) =>
    `${where.idActividad_idUsuario.idActividad}:${where.idActividad_idUsuario.idUsuario}`;

  const tx = {
    actividadProyecto: {
      findFirst: vi.fn(async ({ where }: { where: { idActividad: number; idProyecto: number } }) =>
        actividad && actividad.idActividad === where.idActividad && actividad.idProyecto === where.idProyecto
          ? { idActividad: actividad.idActividad, horasValor, fechaActividad: FECHA_ACTIVIDAD }
          : null,
      ),
    },
    participacionProyecto: {
      findFirst: vi.fn(async ({ where }: { where: { idUsuario: number } }) => {
        const idParticipacion = participaciones[where.idUsuario];
        return idParticipacion ? { idParticipacion } : null;
      }),
    },
    asistenciaActividad: {
      findUnique: vi.fn(async ({ where }: { where: ClaveAsistencia }) => {
        const fila = asistencias.get(clave(where));
        return fila ? { asistio: fila.asistio, idRegistroHoras: fila.idRegistroHoras } : null;
      }),
      upsert: vi.fn(
        async ({
          where,
          update,
          create,
        }: {
          where: ClaveAsistencia;
          update: Omit<AsistenciaFila, 'idAsistencia' | 'idActividad' | 'idUsuario'>;
          create: Omit<AsistenciaFila, 'idAsistencia'>;
        }) => {
          const existente = asistencias.get(clave(where));
          const fila: AsistenciaFila = existente
            ? { ...existente, ...update }
            : { idAsistencia: siguienteAsistencia++, ...create };
          asistencias.set(clave(where), fila);
          return { ...fila };
        },
      ),
    },
    horasParticipacion: {
      create: vi.fn(async ({ data }: { data: Omit<RegistroHorasFila, 'idRegistroHoras'> }) => {
        const fila = { idRegistroHoras: siguienteRegistro++, ...data };
        registrosHoras.set(fila.idRegistroHoras, fila);
        return { idRegistroHoras: fila.idRegistroHoras };
      }),
      update: vi.fn(
        async ({ where, data }: { where: { idRegistroHoras: number }; data: Partial<RegistroHorasFila> }) => {
          const fila = registrosHoras.get(where.idRegistroHoras);
          if (!fila) throw new Error(`registro ${where.idRegistroHoras} inexistente`);
          registrosHoras.set(where.idRegistroHoras, { ...fila, ...data });
          return registrosHoras.get(where.idRegistroHoras);
        },
      ),
      delete: vi.fn(async ({ where }: { where: { idRegistroHoras: number } }) => {
        const fila = registrosHoras.get(where.idRegistroHoras);
        if (!fila) throw new Error(`registro ${where.idRegistroHoras} inexistente`);
        registrosHoras.delete(where.idRegistroHoras);
        return fila;
      }),
    },
  };

  function horasDe(idParticipacion: number): number {
    return [...registrosHoras.values()]
      .filter((fila) => fila.idParticipacion === idParticipacion)
      .reduce((total, fila) => total + fila.horasAprobadas.toNumber(), 0);
  }

  function registrosDe(idParticipacion: number): RegistroHorasFila[] {
    return [...registrosHoras.values()].filter((fila) => fila.idParticipacion === idParticipacion);
  }

  function asistenciaDe(idUsuario: number): AsistenciaFila | undefined {
    return asistencias.get(`${ACTIVIDAD_ID}:${idUsuario}`);
  }

  return { tx, horasDe, registrosDe, asistenciaDe, horasValor };
}

function makeBitacora() {
  return { registrarEvento: vi.fn().mockResolvedValue(undefined) };
}

function buildService(
  tx: ReturnType<typeof makeTx>['tx'],
  options: { project?: null; bitacora?: ReturnType<typeof makeBitacora>; events?: { emit: ReturnType<typeof vi.fn> } } = {},
) {
  const policy = makeProjectPolicyDouble();
  const service = new AttendanceService(
    {} as ConstructorParameters<typeof AttendanceService>[0],
    makeProjectTransactionDouble({
      tx,
      project: options.project === null ? () => null : { creadoPor: LEADER_ID },
    }),
    policy,
    makeProjectReadPolicyDouble(),
    options.bitacora as unknown as ConstructorParameters<typeof AttendanceService>[4],
    options.events as unknown as ConstructorParameters<typeof AttendanceService>[5],
  );
  return { service, policy };
}

function marcar(service: AttendanceService, asistio: boolean, idUsuario = STUDENT_ID) {
  return service.marcarAsistencia(PROJECT_ID, LEADER_ID, ACTIVIDAD_ID, idUsuario, { asistio });
}

describe('AttendanceService — horas por asistencia (HU-177, T-297)', () => {
  describe('marcar asistencia nueva', () => {
    it('suma las horas de la actividad al estudiante con un registro aprobado', async () => {
      const fake = makeTx({ horasValor: 3 });
      const { service } = buildService(fake.tx);

      const resultado = await marcar(service, true);

      expect(fake.horasDe(PARTICIPACION_STUDENT)).toBe(3);
      expect(fake.tx.horasParticipacion.create).toHaveBeenCalledTimes(1);
      expect(fake.tx.horasParticipacion.create).toHaveBeenCalledWith({
        data: {
          idParticipacion: PARTICIPACION_STUDENT,
          periodoInicio: FECHA_ACTIVIDAD,
          periodoFin: FECHA_ACTIVIDAD,
          horasReportadas: fake.horasValor,
          horasCalculadas: fake.horasValor,
          horasAprobadas: fake.horasValor,
          estadoHoras: 'APROBADA',
          aprobadoPor: LEADER_ID,
          fechaAprobacion: expect.any(Date),
        },
        select: { idRegistroHoras: true },
      });
      const [registro] = fake.registrosDe(PARTICIPACION_STUDENT);
      expect(resultado).toEqual({
        idAsistencia: expect.any(Number),
        idActividad: ACTIVIDAD_ID,
        idUsuario: STUDENT_ID,
        asistio: true,
        confirmadoPor: LEADER_ID,
        confirmadoEn: expect.any(String),
        idRegistroHoras: registro.idRegistroHoras,
      });
      expect(fake.asistenciaDe(STUDENT_ID)?.idRegistroHoras).toBe(registro.idRegistroHoras);
    });

    it('conserva las horas fraccionarias de la actividad', async () => {
      const fake = makeTx({ horasValor: 1.5 });
      const { service } = buildService(fake.tx);

      await marcar(service, true);

      expect(fake.horasDe(PARTICIPACION_STUDENT)).toBe(1.5);
    });

    it('solo acredita al estudiante marcado, no a otros integrantes', async () => {
      const fake = makeTx({ horasValor: 3 });
      const { service } = buildService(fake.tx);

      await marcar(service, true);

      expect(fake.horasDe(PARTICIPACION_OTHER)).toBe(0);
      expect(fake.asistenciaDe(OTHER_STUDENT_ID)).toBeUndefined();
    });

    it('marcar a dos estudiantes acredita las horas a cada uno por separado', async () => {
      const fake = makeTx({ horasValor: 2 });
      const { service } = buildService(fake.tx);

      await marcar(service, true, STUDENT_ID);
      await marcar(service, true, OTHER_STUDENT_ID);

      expect(fake.horasDe(PARTICIPACION_STUDENT)).toBe(2);
      expect(fake.horasDe(PARTICIPACION_OTHER)).toBe(2);
      expect(fake.asistenciaDe(STUDENT_ID)?.idRegistroHoras).not.toBe(fake.asistenciaDe(OTHER_STUDENT_ID)?.idRegistroHoras);
    });

    it('registrar una ausencia nueva no crea horas', async () => {
      const fake = makeTx({ horasValor: 3 });
      const { service } = buildService(fake.tx);

      const resultado = await marcar(service, false);

      expect(fake.horasDe(PARTICIPACION_STUDENT)).toBe(0);
      expect(fake.tx.horasParticipacion.create).not.toHaveBeenCalled();
      expect(fake.tx.horasParticipacion.delete).not.toHaveBeenCalled();
      expect(resultado.asistio).toBe(false);
      expect(resultado.idRegistroHoras).toBeNull();
    });
  });

  describe('corregir una asistencia ya marcada', () => {
    it('volver a marcar la misma asistencia no duplica las horas', async () => {
      const fake = makeTx({ horasValor: 3 });
      const { service } = buildService(fake.tx);

      const primera = await marcar(service, true);
      const segunda = await marcar(service, true);

      expect(fake.horasDe(PARTICIPACION_STUDENT)).toBe(3);
      expect(fake.registrosDe(PARTICIPACION_STUDENT)).toHaveLength(1);
      expect(fake.tx.horasParticipacion.create).toHaveBeenCalledTimes(1);
      expect(fake.tx.horasParticipacion.update).toHaveBeenCalledTimes(1);
      expect(fake.tx.horasParticipacion.update).toHaveBeenCalledWith({
        where: { idRegistroHoras: primera.idRegistroHoras },
        data: {
          horasReportadas: fake.horasValor,
          horasCalculadas: fake.horasValor,
          horasAprobadas: fake.horasValor,
          estadoHoras: 'APROBADA',
          aprobadoPor: LEADER_ID,
          fechaAprobacion: expect.any(Date),
        },
      });
      expect(segunda.idRegistroHoras).toBe(primera.idRegistroHoras);
      expect(segunda.idAsistencia).toBe(primera.idAsistencia);
    });

    it('marcar varias veces seguidas deja siempre un solo registro de horas', async () => {
      const fake = makeTx({ horasValor: 4 });
      const { service } = buildService(fake.tx);

      for (let i = 0; i < 5; i++) {
        await marcar(service, true);
      }

      expect(fake.horasDe(PARTICIPACION_STUDENT)).toBe(4);
      expect(fake.registrosDe(PARTICIPACION_STUDENT)).toHaveLength(1);
    });

    it('cambiar de ausente a presente suma las horas una sola vez', async () => {
      const fake = makeTx({ horasValor: 3 });
      const { service } = buildService(fake.tx);

      await marcar(service, false);
      const resultado = await marcar(service, true);

      expect(fake.horasDe(PARTICIPACION_STUDENT)).toBe(3);
      expect(fake.registrosDe(PARTICIPACION_STUDENT)).toHaveLength(1);
      expect(resultado.asistio).toBe(true);
      expect(resultado.idRegistroHoras).toBe(fake.registrosDe(PARTICIPACION_STUDENT)[0].idRegistroHoras);
    });

    it('presente, ausente y presente otra vez deja las horas de una sola asistencia', async () => {
      const fake = makeTx({ horasValor: 3 });
      const { service } = buildService(fake.tx);

      await marcar(service, true);
      await marcar(service, false);
      const resultado = await marcar(service, true);

      expect(fake.horasDe(PARTICIPACION_STUDENT)).toBe(3);
      expect(fake.registrosDe(PARTICIPACION_STUDENT)).toHaveLength(1);
      expect(resultado.idRegistroHoras).toBe(fake.registrosDe(PARTICIPACION_STUDENT)[0].idRegistroHoras);
      expect(fake.asistenciaDe(STUDENT_ID)?.idAsistencia).toBe(resultado.idAsistencia);
    });
  });

  describe('quitar una asistencia', () => {
    it('resta las horas que se habían sumado', async () => {
      const fake = makeTx({ horasValor: 3 });
      const { service } = buildService(fake.tx);

      const marcada = await marcar(service, true);
      expect(fake.horasDe(PARTICIPACION_STUDENT)).toBe(3);

      const quitada = await marcar(service, false);

      expect(fake.horasDe(PARTICIPACION_STUDENT)).toBe(0);
      expect(fake.registrosDe(PARTICIPACION_STUDENT)).toHaveLength(0);
      expect(fake.tx.horasParticipacion.delete).toHaveBeenCalledWith({
        where: { idRegistroHoras: marcada.idRegistroHoras },
      });
      expect(quitada.asistio).toBe(false);
      expect(quitada.idRegistroHoras).toBeNull();
      expect(fake.asistenciaDe(STUDENT_ID)?.idRegistroHoras).toBeNull();
    });

    it('quitarla dos veces no intenta restar de nuevo', async () => {
      const fake = makeTx({ horasValor: 3 });
      const { service } = buildService(fake.tx);

      await marcar(service, true);
      await marcar(service, false);
      await marcar(service, false);

      expect(fake.tx.horasParticipacion.delete).toHaveBeenCalledTimes(1);
      expect(fake.horasDe(PARTICIPACION_STUDENT)).toBe(0);
    });

    it('solo resta las horas de esa asistencia, no las de otro integrante', async () => {
      const fake = makeTx({ horasValor: 3 });
      const { service } = buildService(fake.tx);

      await marcar(service, true, STUDENT_ID);
      await marcar(service, true, OTHER_STUDENT_ID);
      await marcar(service, false, STUDENT_ID);

      expect(fake.horasDe(PARTICIPACION_STUDENT)).toBe(0);
      expect(fake.horasDe(PARTICIPACION_OTHER)).toBe(3);
    });
  });

  describe('integrante sin participación activa', () => {
    it('rechaza marcar a quien no es miembro activo y no toca horas ni asistencia', async () => {
      const fake = makeTx({ horasValor: 3 });
      const { service } = buildService(fake.tx);

      await expect(marcar(service, true, EXTERNO_ID)).rejects.toBeInstanceOf(BadRequestException);

      expect(fake.tx.participacionProyecto.findFirst).toHaveBeenCalledWith({
        where: {
          idUsuario: EXTERNO_ID,
          estadoParticipacion: 'ACTIVO',
          rolProyecto: { idProyecto: PROJECT_ID },
        },
        select: { idParticipacion: true },
      });
      expect(fake.tx.horasParticipacion.create).not.toHaveBeenCalled();
      expect(fake.tx.asistenciaActividad.upsert).not.toHaveBeenCalled();
    });

    it('tampoco permite quitar la asistencia de quien ya no es miembro activo', async () => {
      const fake = makeTx({ horasValor: 3 });
      const { service } = buildService(fake.tx);

      await expect(marcar(service, false, EXTERNO_ID)).rejects.toBeInstanceOf(BadRequestException);
      expect(fake.tx.horasParticipacion.delete).not.toHaveBeenCalled();
      expect(fake.tx.asistenciaActividad.upsert).not.toHaveBeenCalled();
    });
  });

  describe('actividad y proyecto', () => {
    it('una actividad inexistente responde 404 sin tocar horas', async () => {
      const fake = makeTx({ actividad: null });
      const { service } = buildService(fake.tx);

      await expect(marcar(service, true)).rejects.toBeInstanceOf(NotFoundException);
      expect(fake.tx.participacionProyecto.findFirst).not.toHaveBeenCalled();
      expect(fake.tx.horasParticipacion.create).not.toHaveBeenCalled();
    });

    it('una actividad de otro proyecto responde 404', async () => {
      const fake = makeTx({ actividad: { idActividad: ACTIVIDAD_ID, idProyecto: PROJECT_ID + 1 } });
      const { service } = buildService(fake.tx);

      await expect(marcar(service, true)).rejects.toBeInstanceOf(NotFoundException);
      expect(fake.tx.actividadProyecto.findFirst).toHaveBeenCalledWith({
        where: { idActividad: ACTIVIDAD_ID, idProyecto: PROJECT_ID },
        select: { idActividad: true, horasValor: true, fechaActividad: true },
      });
      expect(fake.tx.horasParticipacion.create).not.toHaveBeenCalled();
    });

    it('sin proyecto bloqueado responde 404 antes de validar permisos', async () => {
      const fake = makeTx();
      const { service, policy } = buildService(fake.tx, { project: null });

      await expect(marcar(service, true)).rejects.toBeInstanceOf(NotFoundException);
      expect(policy.assertWriteTx).not.toHaveBeenCalled();
      expect(fake.tx.horasParticipacion.create).not.toHaveBeenCalled();
    });
  });

  describe('permisos', () => {
    it('valida la familia ACTIVIDAD_ASISTENCIA con el líder como actor', async () => {
      const fake = makeTx();
      const { service, policy } = buildService(fake.tx);

      await marcar(service, true);

      expect(policy.assertWriteTx).toHaveBeenCalledWith(
        fake.tx,
        expect.objectContaining({ idProyecto: PROJECT_ID }),
        'ACTIVIDAD_ASISTENCIA',
        LEADER_ID,
      );
    });

    it('si la política rechaza al actor no se suman ni restan horas', async () => {
      const fake = makeTx();
      const { service, policy } = buildService(fake.tx);
      policy.assertWriteTx.mockRejectedValue(new ForbiddenException('Solo el líder puede marcar asistencia'));

      await expect(marcar(service, true)).rejects.toBeInstanceOf(ForbiddenException);
      expect(fake.tx.actividadProyecto.findFirst).not.toHaveBeenCalled();
      expect(fake.tx.horasParticipacion.create).not.toHaveBeenCalled();
      expect(fake.tx.asistenciaActividad.upsert).not.toHaveBeenCalled();
    });
  });

  describe('bitácora', () => {
    it('registra las horas acreditadas y el valor anterior de la asistencia', async () => {
      const fake = makeTx({ horasValor: 2.5 });
      const bitacora = makeBitacora();
      const { service } = buildService(fake.tx, { bitacora });

      await marcar(service, true);
      await marcar(service, false);

      expect(bitacora.registrarEvento).toHaveBeenNthCalledWith(1, {
        tx: fake.tx,
        tipoEvento: TipoEventoBitacora.ATTENDANCE_MARKED,
        idActor: LEADER_ID,
        idProyecto: PROJECT_ID,
        tipoEntidad: 'ACTIVIDAD',
        idEntidad: ACTIVIDAD_ID,
        valorAnterior: { idUsuario: STUDENT_ID, asistio: false },
        valorNuevo: { idUsuario: STUDENT_ID, asistio: true, horasAcreditadas: '2.50' },
      });
      expect(bitacora.registrarEvento).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          valorAnterior: { idUsuario: STUDENT_ID, asistio: true },
          valorNuevo: { idUsuario: STUDENT_ID, asistio: false, horasAcreditadas: '0.00' },
        }),
      );
    });

    it('si falla la validación no registra nada en la bitácora', async () => {
      const fake = makeTx();
      const bitacora = makeBitacora();
      const { service } = buildService(fake.tx, { bitacora });

      await expect(marcar(service, true, EXTERNO_ID)).rejects.toBeInstanceOf(BadRequestException);
      expect(bitacora.registrarEvento).not.toHaveBeenCalled();
    });
  });

  describe('insignias (HU-190)', () => {
    it('emite el recálculo de horas del integrante al confirmar asistencia, después del commit', async () => {
      const fake = makeTx();
      const events = { emit: vi.fn() };
      const { service } = buildService(fake.tx, { events });

      await marcar(service, true);

      expect(events.emit).toHaveBeenCalledTimes(1);
      expect(events.emit).toHaveBeenCalledWith('insignias.recalcular', { claves: ['horas'], idUsuarios: [STUDENT_ID] });
    });

    it('no emite al quitar la asistencia ni si la validación falla', async () => {
      const fake = makeTx();
      const events = { emit: vi.fn() };
      const { service } = buildService(fake.tx, { events });

      await marcar(service, false);
      await expect(marcar(service, true, EXTERNO_ID)).rejects.toBeInstanceOf(BadRequestException);

      expect(events.emit).not.toHaveBeenCalled();
    });
  });

  describe('markAttendanceTx', () => {
    it('opera solo sobre el tx recibido y devuelve la asistencia resultante', async () => {
      const fake = makeTx({ horasValor: 3 });
      const prisma = { horasParticipacion: { create: vi.fn(), update: vi.fn(), delete: vi.fn() } };
      const service = new AttendanceService(
        prisma as unknown as ConstructorParameters<typeof AttendanceService>[0],
        makeProjectTransactionDouble({ tx: fake.tx }),
        makeProjectPolicyDouble(),
        makeProjectReadPolicyDouble(),
      );

      const resultado = await service.markAttendanceTx(fake.tx as unknown as Prisma.TransactionClient, {
        projectId: PROJECT_ID,
        actividad: { idActividad: ACTIVIDAD_ID, horasValor: fake.horasValor, fechaActividad: FECHA_ACTIVIDAD },
        targetUserId: STUDENT_ID,
        leaderId: LEADER_ID,
        asistio: true,
      });

      expect(resultado.asistio).toBe(true);
      expect(fake.horasDe(PARTICIPACION_STUDENT)).toBe(3);
      expect(prisma.horasParticipacion.create).not.toHaveBeenCalled();
      expect(prisma.horasParticipacion.update).not.toHaveBeenCalled();
      expect(prisma.horasParticipacion.delete).not.toHaveBeenCalled();
    });
  });
});
