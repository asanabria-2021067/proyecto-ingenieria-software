import { afterAll, beforeAll, expect, it } from 'vitest';
import { EstadoProyecto, type PrismaClient } from '@prisma/client';
import { ForbiddenException } from '@nestjs/common';
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

/**
 * T-269 (HU-170), FASE 5 — flujo integral: en vez de repartir cada criterio
 * de aceptación en specs separados (ya cubiertos por bitacora-eventos.
 * integration.spec.ts y los unitarios de ProjectReadPolicyService /
 * BitacoraConsultaService / BitacoraController), esta suite recorre el
 * mismo escenario contra PostgreSQL real de punta a punta: líder, un único
 * participante ACTIVO e un usuario externo al proyecto, todos leyendo el
 * mismo conjunto de eventos a través de `BitacoraController.findAll` —el
 * método real que expone el endpoint, no solo el servicio interno—, con
 * filtros y paginación reales de por medio.
 *
 * Se activa solo con INTEGRATION_DATABASE_URL; sin esa variable, SKIP
 * limpio (describeIntegration), mismo patrón que el resto de
 * test/integration/.
 */
describeIntegration('HU-170/T-269 — flujo integral de la bitácora (PostgreSQL real)', () => {
  let prisma: PrismaClient;
  let bitacoraEventos: BitacoraEventosService;
  let controller: BitacoraController;

  beforeAll(async () => {
    prisma = createIntegrationPrismaClient();
    bitacoraEventos = new BitacoraEventosService();
    const context = new BitacoraContextService(prisma as unknown as PrismaService);
    const bitacoraConsulta = new BitacoraConsultaService(
      prisma as unknown as PrismaService,
      context,
      new ProjectReadPolicyService(prisma as unknown as PrismaService),
      new UserNameSearchService(prisma as unknown as PrismaService),
    );
    // El controller real, no un stand-in: findAll es exactamente el método
    // que Nest invoca para GET /proyectos/:id/bitacora.
    controller = new BitacoraController(bitacoraConsulta);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it(
    'líder crea eventos operativos y administrativos; líder, participante activo y usuario ajeno leen ' +
      'a través del endpoint con distintos resultados; filtros y paginación del participante nunca alcanzan lo administrativo',
    async () => {
      const scope: IntegrationCleanupScope = {};
      const auditoriaIds: number[] = [];
      try {
        // ---- Fase 0: no hay superficie de escritura que probar por HTTP ----
        // (T-269 parte 2): BitacoraController solo registra GET; no existe
        // POST/PUT/PATCH/DELETE para forjar/editar/borrar una entrada — se
        // verifica aquí en el mismo lugar que ejercita todo lo demás, sin
        // necesidad de DB.
        const metodos = Object.getOwnPropertyNames(BitacoraController.prototype).filter(
          (nombre) => nombre !== 'constructor',
        );
        expect(metodos).toEqual(['findAll']);

        // ---- Fase 1: arranque — líder, un participante ACTIVO real y un usuario ajeno ----
        const leader = await createIntegrationUser(prisma);
        const member = await createIntegrationUser(prisma);
        const outsider = await createIntegrationUser(prisma);
        scope.userIds = [leader.idUsuario, member.idUsuario, outsider.idUsuario];

        const project = await createIntegrationProject(prisma, leader.idUsuario, {
          estadoProyecto: EstadoProyecto.EN_PROGRESO,
        });
        scope.projectIds = [project.idProyecto];

        const rol = await createIntegrationProjectRole(prisma, project.idProyecto);
        scope.roleIds = [rol.idRolProyecto];
        const participacion = await createIntegrationParticipation(prisma, member.idUsuario, rol.idRolProyecto, {
          estadoParticipacion: 'ACTIVO',
        });
        scope.participationIds = [participacion.idParticipacion];

        // ---- Fase 2: el líder genera actividad — 3 eventos operativos + 1 administrativo ----
        const filas = await prisma.$transaction(async (tx) => {
          for (let i = 1; i <= 3; i += 1) {
            await bitacoraEventos.registrarEvento({
              tx,
              tipoEvento: TipoEventoBitacora.TASK_CREATED,
              idActor: leader.idUsuario,
              idProyecto: project.idProyecto,
              tipoEntidad: 'TAREA',
              idEntidad: i,
              valorNuevo: { tituloTarea: `Tarea operativa ${i}` },
            });
          }
          await bitacoraEventos.registrarEvento({
            tx,
            tipoEvento: TipoEventoBitacora.LEADERSHIP_CHANGED,
            idActor: leader.idUsuario,
            idProyecto: project.idProyecto,
            tipoEntidad: 'PROYECTO',
            idEntidad: project.idProyecto,
            valorNuevo: { idLiderNuevo: member.idUsuario },
          });
          return tx.bitacoraAuditoria.findMany({ where: { idUsuario: leader.idUsuario } });
        });
        auditoriaIds.push(...filas.map((f) => f.idAuditoria));
        expect(filas).toHaveLength(4);

        // ---- Fase 3: el líder lee su bitácora por el endpoint — ve las 4 filas, administrativa incluida ----
        const comoLider = await controller.findAll(project.idProyecto, { userId: leader.idUsuario });
        expect(comoLider.total).toBe(4);
        expect(comoLider.data.map((e) => e.tipoEvento).sort()).toEqual(
          [
            TipoEventoBitacora.TASK_CREATED,
            TipoEventoBitacora.TASK_CREATED,
            TipoEventoBitacora.TASK_CREATED,
            TipoEventoBitacora.LEADERSHIP_CHANGED,
          ].sort(),
        );

        // ---- Fase 4 (HU-170): el participante activo lee la MISMA bitácora por el endpoint — sin la entrada administrativa ----
        const comoIntegrante = await controller.findAll(project.idProyecto, { userId: member.idUsuario });
        expect(comoIntegrante.total).toBe(3);
        expect(comoIntegrante.data.every((e) => e.tipoEvento === TipoEventoBitacora.TASK_CREATED)).toBe(true);
        expect(comoIntegrante.data.some((e) => e.tipoEvento === TipoEventoBitacora.LEADERSHIP_CHANGED)).toBe(false);

        // ---- Fase 5: paginación del integrante (limit=2) nunca revela la entrada administrativa, en ninguna página ----
        const paginaUno = await controller.findAll(
          project.idProyecto,
          { userId: member.idUsuario },
          undefined,
          undefined,
          undefined,
          '1',
          '2',
        );
        const paginaDos = await controller.findAll(
          project.idProyecto,
          { userId: member.idUsuario },
          undefined,
          undefined,
          undefined,
          '2',
          '2',
        );
        expect(paginaUno.data).toHaveLength(2);
        expect(paginaDos.data).toHaveLength(1);
        expect(paginaUno.total).toBe(3);
        expect(paginaDos.total).toBe(3);
        const idsPaginados = [...paginaUno.data, ...paginaDos.data].map((e) => e.idAuditoria);
        expect(new Set(idsPaginados).size).toBe(3); // sin duplicados ni huecos
        expect([...paginaUno.data, ...paginaDos.data].every((e) => e.tipoEvento === TipoEventoBitacora.TASK_CREATED)).toBe(
          true,
        );

        // ---- Fase 6: filtros del integrante — el operativo funciona, el administrativo nunca "cuela" nada ----
        const filtradoOperativo = await controller.findAll(
          project.idProyecto,
          { userId: member.idUsuario },
          undefined,
          undefined,
          TipoEventoBitacora.TASK_CREATED,
        );
        expect(filtradoOperativo.total).toBe(3);

        const filtradoAdministrativo = await controller.findAll(
          project.idProyecto,
          { userId: member.idUsuario },
          undefined,
          undefined,
          TipoEventoBitacora.LEADERSHIP_CHANGED,
        );
        expect(filtradoAdministrativo.total).toBe(0);
        expect(filtradoAdministrativo.data).toEqual([]);

        // ---- Fase 7: el líder, con ese mismo filtro administrativo, sí lo recibe (sin restricción) ----
        const filtradoAdministrativoComoLider = await controller.findAll(
          project.idProyecto,
          { userId: leader.idUsuario },
          undefined,
          undefined,
          TipoEventoBitacora.LEADERSHIP_CHANGED,
        );
        expect(filtradoAdministrativoComoLider.total).toBe(1);

        // ---- Fase 8: un usuario ajeno al proyecto (sin participación) es rechazado por el endpoint ----
        await expect(controller.findAll(project.idProyecto, { userId: outsider.idUsuario })).rejects.toBeInstanceOf(
          ForbiddenException,
        );
      } finally {
        // bitacora_auditoria.idUsuario -> Usuario sin onDelete configurado
        // (RESTRICT por defecto): debe limpiarse antes que los usuarios.
        if (auditoriaIds.length > 0) {
          await prisma.bitacoraAuditoria.deleteMany({ where: { idAuditoria: { in: auditoriaIds } } });
        }
        await cleanupIntegrationFixtures(prisma, scope);
      }
    },
  );
});
