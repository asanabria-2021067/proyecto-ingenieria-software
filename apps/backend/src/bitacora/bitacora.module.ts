import { Module } from '@nestjs/common';
import { BitacoraController } from './bitacora.controller';
import { BitacoraEventosService } from './bitacora-eventos.service';
import { BitacoraContextService } from './bitacora-context.service';
import { BitacoraConsultaService } from './bitacora-consulta.service';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';

@Module({
  imports: [ProjectPolicyModule],
  controllers: [BitacoraController],
  providers: [BitacoraEventosService, BitacoraContextService, BitacoraConsultaService],
  exports: [BitacoraEventosService],
})
export class BitacoraModule {}
