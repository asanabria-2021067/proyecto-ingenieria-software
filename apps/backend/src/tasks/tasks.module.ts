import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksContextService } from './tasks-context.service';
import { ComentariosModule } from '../comentarios/comentarios.module';

@Module({
  imports: [ComentariosModule],
  controllers: [TasksController],
  providers: [TasksService, TasksContextService],
  exports: [TasksService],
})
export class TasksModule {}
