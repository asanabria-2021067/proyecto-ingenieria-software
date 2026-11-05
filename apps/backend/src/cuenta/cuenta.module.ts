import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CuentaController } from './cuenta.controller';
import { SolicitudesDesactivacionAdminController } from './solicitudes-desactivacion-admin.controller';
import { SesionesService } from './sesiones.service';
import { MisDatosService } from './mis-datos.service';
import { DesactivacionService } from './desactivacion.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [CuentaController, SolicitudesDesactivacionAdminController],
  providers: [SesionesService, MisDatosService, DesactivacionService],
})
export class CuentaModule {}
