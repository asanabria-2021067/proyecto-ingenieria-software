import { Module } from '@nestjs/common';
import { SprintsModule } from '../sprints/sprints.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * C125 (06 v2 §39): Users importa Sprints para delegar las horas en
 * `ProjectHoursSummaryService`; Sprints no importa Users, así que no hay ciclo.
 */
@Module({
  imports: [SprintsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
