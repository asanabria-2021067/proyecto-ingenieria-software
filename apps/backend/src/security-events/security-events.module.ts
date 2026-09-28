import { Global, Module } from '@nestjs/common';
import { SecurityEventsService } from './security-events.service';

/** G05 (OWASP25-C037): writer de eventos de seguridad, disponible para auth y admin. */
@Global()
@Module({
  providers: [SecurityEventsService],
  exports: [SecurityEventsService],
})
export class SecurityEventsModule {}
