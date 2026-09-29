import { afterAll, beforeAll, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { EstadoProyecto, type PrismaClient } from '@prisma/client';
import { describeIntegration, createIntegrationPrismaClient } from './setup/database';
import {
  createIntegrationUser,
  createIntegrationProject,
  createIntegrationProjectRole,
  createIntegrationParticipation,
} from './setup/fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './setup/cleanup';
import { BitacoraEventosService } from '../../src/bitacora/bitacora-eventos.service';
import { BitacoraContextService } from '../../src/bitacora/bitacora-context.service';
import { BitacoraConsultaService } from '../../src/bitacora/bitacora-consulta.service';
import { BitacoraController } from '../../src/bitacora/bitacora.controller';
import { TipoEventoBitacora } from '../../src/bitacora/tipos-evento-bitacora';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { ProjectReadPolicyService } from '../../src/common/project-policy/project-read-policy.service';
import { UserNameSearchService } from '../../src/common/search/user-name-search.service';
import { SecurityEventsService } from '../../src/security-events/security-events.service';
import { TIPO_OBJETO_SEGURIDAD, TipoEventoSeguridad } from '../../src/security-events/tipos-evento-seguridad';

/**
 * G05-C08 · OWASP25-C037 (A01/A09). Contra PostgreSQL real, a través del
 * controller REAL de GET /proyectos/:id/bitacora: los eventos de seguridad
 * (sin idProyecto) nunca salen por la bitácora funcional del proyecto, ni para
 * un integrante, ni para el líder, ni para un admin en ese contexto; tampoco
 * pidiéndolos por nombre ni aunque una fila de seguridad llevara un
 * idProyecto en su detalle. Los eventos quedan persistidos para el contexto
 * administrativo (acceso a datos de auditoría), y la bitácora funcional sigue
 * funcionando igual.
 */
describeIntegration('G05-C08 — visibilidad de eventos de seguridad (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let controller: BitacoraController;
  let securityEvents: SecurityEventsService;

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    const consulta = new BitacoraConsultaService(
      prisma as unknown as PrismaService,
      new BitacoraContextService(prisma as unknown as PrismaService),
      new ProjectReadPolicyService(prisma as unknown as PrismaService),
      new UserNameSearchService(prisma as unknown as PrismaService),
    );
    controller = new BitacoraController(consulta);
    securityEvents = new SecurityEventsService(prisma as unknown as PrismaService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('integrante, líder y admin no obtienen eventos de seguridad por la bitácora del proyecto', async () => {
    const scope: IntegrationCleanupScope = {};
    let adminRolId: number | undefined;
    const ids: number[] = [];
    try {
      const leader = await createIntegrationUser(prisma);
      const member = await createIntegrationUser(prisma);
      const admin = await createIntegrationUser(prisma);
      scope.userIds = [leader.idUsuario, member.idUsuario, admin.idUsuario];
      const rolAdmin = await prisma.rolAcceso.upsert({
        where: { nombrePerfil: 'administrador' },
        update: {},
        create: { nombrePerfil: 'administrador' },
      });
      const vinculo = await prisma.usuarioRolAcceso.create({ data: { idUsuario: admin.idUsuario, idRolAcceso: rolAdmin.idRolAcceso } });
      adminRolId = vinculo.idUsuarioRolAcceso;

      const project = await createIntegrationProject(prisma, leader.idUsuario, { estadoProyecto: EstadoProyecto.EN_PROGRESO });
      scope.projectIds = [project.idProyecto];
      const rol = await createIntegrationProjectRole(prisma, project.idProyecto);
      scope.roleIds = [rol.idRolProyecto];
      const participacion = await createIntegrationParticipation(prisma, member.idUsuario, rol.idRolProyecto, {
        estadoParticipacion: 'ACTIVO',
      });
      scope.participationIds = [participacion.idParticipacion];

      // Control: un evento funcional del proyecto.
      await prisma.$transaction((tx) =>
        new BitacoraEventosService().registrarEvento({
          tx,
          tipoEvento: TipoEventoBitacora.TASK_CREATED,
          idActor: leader.idUsuario,
          idProyecto: project.idProyecto,
          tipoEntidad: 'TAREA',
          idEntidad: 1,
        }),
      );
      // Eventos de seguridad reales de los miembros del proyecto.
      await securityEvents.record({ tipo: TipoEventoSeguridad.LOGIN_SUCCEEDED, idActor: member.idUsuario, idUsuarioAfectado: member.idUsuario });
      await securityEvents.record({ tipo: TipoEventoSeguridad.LOGIN_FAILED, idUsuarioAfectado: leader.idUsuario, detalle: { motivo: 'CREDENCIALES' } });
      await securityEvents.record({
        tipo: TipoEventoSeguridad.USER_STATUS_CHANGED,
        idActor: admin.idUsuario,
        idUsuarioAfectado: member.idUsuario,
        detalle: { estadoAnterior: 'ACTIVO', estadoNuevo: 'ACTIVO' },
      });
      // Defensa en profundidad: aunque una fila de seguridad llevara idProyecto, no se cuela.
      await securityEvents.record({
        tipo: TipoEventoSeguridad.ACCOUNT_LOCKED,
        idUsuarioAfectado: member.idUsuario,
        detalle: { idProyecto: project.idProyecto },
      });

      const filas = await prisma.bitacoraAuditoria.findMany({
        where: { OR: [{ idUsuario: { in: scope.userIds } }, { idObjeto: { in: scope.userIds.map(String) } }] },
      });
      ids.push(...filas.map((fila) => fila.idAuditoria));

      // Contexto administrativo: los eventos de seguridad existen y se identifican por catálogo.
      const seguridad = filas.filter((fila) => fila.tipoObjeto === TIPO_OBJETO_SEGURIDAD);
      expect(seguridad.map((fila) => fila.accion).sort()).toEqual(
        ['ACCOUNT_LOCKED', 'LOGIN_FAILED', 'LOGIN_SUCCEEDED', 'USER_STATUS_CHANGED'].sort(),
      );

      // Bitácora funcional por el endpoint real: solo el evento del proyecto, para los tres perfiles.
      for (const lector of [member, leader, admin]) {
        const resultado = await controller.findAll(project.idProyecto, { userId: lector.idUsuario });
        expect(resultado.data.map((evento) => evento.tipoEvento)).toEqual([TipoEventoBitacora.TASK_CREATED]);
        expect(resultado.total).toBe(1);
      }

      // Pedirlos por nombre no es un filtro válido de la bitácora funcional.
      for (const tipo of TipoEventoSeguridad.VALORES) {
        await expect(
          Promise.resolve().then(() =>
            controller.findAll(project.idProyecto, { userId: member.idUsuario }, undefined, undefined, undefined, tipo),
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
      // Filtrar por el actor de los eventos de seguridad tampoco los revela.
      const porActor = await controller.findAll(project.idProyecto, { userId: leader.idUsuario }, undefined, String(member.idUsuario));
      expect(porActor.total).toBe(0);
    } finally {
      if (ids.length > 0) {
        await prisma.bitacoraAuditoria.deleteMany({ where: { idAuditoria: { in: ids } } });
      }
      if (adminRolId !== undefined) {
        await prisma.usuarioRolAcceso.deleteMany({ where: { idUsuarioRolAcceso: adminRolId } });
      }
      await cleanupIntegrationFixtures(prisma, scope);
    }
  });
});
