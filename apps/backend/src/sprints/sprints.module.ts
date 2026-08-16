import { Module } from '@nestjs/common';
import { SprintsController } from './sprints.controller';
import { SprintsContextService } from './sprints-context.service';
import { SprintsAuthorizationService } from './sprints-authorization.service';

@Module({
  controllers: [SprintsController],
  providers: [SprintsContextService, SprintsAuthorizationService],
  exports: [SprintsContextService, SprintsAuthorizationService],
})
export class SprintsModule {}
