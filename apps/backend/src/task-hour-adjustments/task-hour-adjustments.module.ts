import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';
import { BitacoraModule } from '../bitacora/bitacora.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TaskHourAdjustmentsController } from './task-hour-adjustments.controller';
import { TaskHourAdjustmentsService } from './task-hour-adjustments.service';

/**
 * C070 (06 v2 §39): módulo de ajustes de horas por tramo. Importa Policy,
 * Bitacora y Notifications. NO se registra en AppModule en este commit: sin
 * ese registro ninguna ruta responde y la superficie sigue siendo cero.
 */
@Module({
  imports: [PrismaModule, ProjectPolicyModule, BitacoraModule, NotificationsModule],
  controllers: [TaskHourAdjustmentsController],
  providers: [TaskHourAdjustmentsService],
  exports: [TaskHourAdjustmentsService],
})
export class TaskHourAdjustmentsModule {}
