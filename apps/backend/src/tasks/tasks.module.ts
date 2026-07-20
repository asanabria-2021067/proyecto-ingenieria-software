import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TareaComentariosController } from './tarea-comentarios.controller';
import { TasksService } from './tasks.service';
import { TasksContextService } from './tasks-context.service';
import { TasksAuthorizationService } from './tasks-authorization.service';
import { ComentariosModule } from '../comentarios/comentarios.module';

@Module({
  imports: [ComentariosModule],
  controllers: [TasksController, TareaComentariosController],
  providers: [TasksService, TasksContextService, TasksAuthorizationService],
  exports: [TasksService],
})
export class TasksModule {}
