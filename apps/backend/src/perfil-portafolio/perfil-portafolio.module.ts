import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { EventsModule } from '../events/events.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { HorasSemestreModule } from '../horas-semestre/horas-semestre.module';
import { SocialModule } from '../social/social.module';
import { AsistenteReunionesService } from './asistente-reuniones.service';
import { PersonasParecidasService } from './personas-parecidas.service';
import { ReportesPerfilService } from './reportes-perfil.service';
import { RestriccionesController } from './restricciones.controller';
import { RestriccionesService } from './restricciones.service';
import { DisponibilidadSemanalService } from './disponibilidad-semanal.service';
import { EnlacesPerfilService } from './enlaces-perfil.service';
import { HabilidadConfirmacionesService } from './habilidad-confirmaciones.service';
import { PerfilPortafolioController } from './perfil-portafolio.controller';
import { PortafolioPublicoController } from './portafolio-publico.controller';
import { PortafolioService } from './portafolio.service';
import { SemestreResumenService } from './semestre-resumen.service';

@Module({
  imports: [ChatModule, EventsModule, HorasSemestreModule, NotificationsModule, SocialModule],
  controllers: [PerfilPortafolioController, PortafolioPublicoController, RestriccionesController],
  providers: [
    PortafolioService,
    HabilidadConfirmacionesService,
    DisponibilidadSemanalService,
    EnlacesPerfilService,
    SemestreResumenService,
    AsistenteReunionesService,
    PersonasParecidasService,
    RestriccionesService,
    ReportesPerfilService,
  ],
  exports: [DisponibilidadSemanalService],
})
export class PerfilPortafolioModule {}
