import { Module } from '@nestjs/common';
import { SprintsController } from './sprints.controller';
import { SprintsContextService } from './sprints-context.service';
import { SprintsAuthorizationService } from './sprints-authorization.service';
import { SprintsService } from './sprints.service';

@Module({
  controllers: [SprintsController],
  providers: [SprintsContextService, SprintsAuthorizationService, SprintsService],
  exports: [SprintsContextService, SprintsAuthorizationService, SprintsService],
})
export class SprintsModule {}
