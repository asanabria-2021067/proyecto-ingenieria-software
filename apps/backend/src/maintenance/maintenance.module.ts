import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MaintenanceMiddleware } from './maintenance.middleware';
import { MaintenanceService } from './maintenance.service';
import { MantenimientoAdminController, MantenimientoController } from './maintenance.controller';

@Module({
  imports: [JwtModule.register({})],
  controllers: [MantenimientoController, MantenimientoAdminController],
  providers: [MaintenanceService, MaintenanceMiddleware],
})
export class MaintenanceModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MaintenanceMiddleware).forRoutes('{*path}');
  }
}
