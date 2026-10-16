/**
 * HU-190: backfill de insignias. Recalcula todas las insignias de todos los
 * usuarios existentes. Idempotente (puede correrse N veces) y SILENCIOSO: se
 * construye el servicio sin NotificationsService y además el backfill pasa
 * `notificar = false`, así que nunca crea notificaciones.
 *
 * Uso (después del deploy): npm run insignias:backfill
 */
import { PrismaClient } from '@prisma/client';
import { InsigniasService } from '../src/insignias/insignias.service';
import type { PrismaService } from '../src/prisma/prisma.service';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const usuarios = await new InsigniasService(prisma as unknown as PrismaService).backfillTodos();
    console.log(`Insignias recalculadas para ${usuarios} usuarios.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
