import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TareaComentariosController } from './tarea-comentarios.controller';
import { TasksService } from './tasks.service';
import { TasksContextService } from './tasks-context.service';
import { TasksAuthorizationService } from './tasks-authorization.service';
import { TasksRelationsService } from './tasks-relations.service';
import { ComentariosModule } from '../comentarios/comentarios.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ComentariosModule, NotificationsModule],
  controllers: [TasksController, TareaComentariosController],
  providers: [TasksService, TasksContextService, TasksAuthorizationService, TasksRelationsService],
  exports: [TasksService],
})
export class TasksModule {}
