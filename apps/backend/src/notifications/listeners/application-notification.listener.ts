import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ApplicationCreatedEvent } from '../events/application-created.event';
import { NotificationsService } from '../notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * C030 (06 v2 §23): la notificación NUEVA_POSTULACION se persiste dentro de
 * la transacción que crea la postulación (ApplicationsService.create), con
 * el líder y los datos capturados allí, y su socket se publica después del
 * commit. Este listener ya NO emite una segunda notificación para ese
 * productor: hacerlo duplicaba la fila y podía sobrevivir a un rollback del
 * dominio o seleccionar un líder posterior. Se conserva registrado (el
 * evento `application.created` sigue emitiéndose para cualquier otro
 * consumidor) sin ninguna otra responsabilidad.
 */
@Injectable()
export class ApplicationNotificationListener {
  constructor(
    private notificationsService: NotificationsService,
    private prisma: PrismaService,
  ) {}

  @OnEvent('application.created')
  async handleApplicationCreated(_event: ApplicationCreatedEvent): Promise<void> {
    // Sin efecto: la notificación ya fue persistida en la transacción de creación.
    void this.notificationsService;
    void this.prisma;
  }
}
