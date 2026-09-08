import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';
import { BitacoraModule } from '../bitacora/bitacora.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TaskHourAdjustmentsController } from './task-hour-adjustments.controller';
import { TaskHourAdjustmentsService } from './task-hour-adjustments.service';

/**
 * C070/C071 (06 v2 §39): módulo de ajustes de horas por tramo. Importa
 * Policy, Bitacora y Notifications, y desde C071 queda registrado en
 * AppModule, que es cuando sus rutas empiezan a responder.
 */
@Module({
  imports: [PrismaModule, ProjectPolicyModule, BitacoraModule, NotificationsModule],
  controllers: [TaskHourAdjustmentsController],
  providers: [TaskHourAdjustmentsService],
  exports: [TaskHourAdjustmentsService],
})
export class TaskHourAdjustmentsModule {}
