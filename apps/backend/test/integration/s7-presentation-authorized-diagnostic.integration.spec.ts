import { expect, it } from 'vitest';
import { createIntegrationPrismaClient, describeIntegration } from './setup/database';
import { closureReadyFixture, cleanupClosureLifecycle } from './setup/closure-lifecycle';
import { createIntegrationAdmin } from './setup/leadership';
import type { ClosureCleanupScope } from './setup/closure-storage';

describeIntegration('S7 reutilizacion de presentacion historica', () => {
  it('un cambio de perfil externo no produce stale y un nombre operativo del proyecto si lo produce', async () => {
    const db = createIntegrationPrismaClient();
    const scope: ClosureCleanupScope = {};
    try {
      const f = await closureReadyFixture(db, scope);
      await db.usuario.update({ where: { idUsuario: f.leader.idUsuario }, data: { nombre: 'Ana', apellido: 'L\u00f3pez' } });
      const generated = await f.stack.report.generateAutoReport(f.project.idProyecto, f.leader.idUsuario, f.dto.revisionId);
      const dto = { ...f.dto, expectedFingerprint: generated.fingerprintEjecucion };
      const admin = await createIntegrationAdmin(db, scope);
      await f.stack.closure.requestClose(f.project.idProyecto, f.leader.idUsuario, dto);
      const corrected = await f.stack.review.requestDocumentaryCorrection(f.project.idProyecto, admin.idUsuario, {
        revisionId: dto.revisionId, comentario: 'Correccion documental',
      });
      const linked = await db.documentoRevisionCierre.findFirstOrThrow({ where: { idRevisionCierre: corrected.revisionId, orden: 0 }, include: { documento: true } });
      const original = linked.documento;
      const evaluate = () => f.stack.readiness.evaluate(undefined, f.project.idProyecto, {
        phase: 'RESUBMIT', revisionId: corrected.revisionId, expectedFingerprint: dto.expectedFingerprint,
      });
      expect((await evaluate()).canSubmit).toBe(true);
      await db.usuario.update({ where: { idUsuario: f.leader.idUsuario }, data: { nombre: 'Ana Mar\u00eda' } });
      expect((await evaluate()).canSubmit).toBe(true);
      await db.rolProyecto.update({ where: { idRolProyecto: f.role.idRolProyecto }, data: { nombreRol: 'Cambio operativo real' } });
      expect((await evaluate()).blockers.map((row) => row.code)).toContain('INFORME_DESACTUALIZADO');
      expect(await db.documentoCierre.findUniqueOrThrow({ where: { idDocumentoCierre: original.idDocumentoCierre } })).toEqual(original);
    } finally {
      await cleanupClosureLifecycle(db, scope);
      await db.$disconnect();
    }
  });
});
