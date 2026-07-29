import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ApplicationCreatedEvent } from '../events/application-created.event';
import { NotificationsService } from '../notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ApplicationNotificationListener {
  constructor(
    private notificationsService: NotificationsService,
    private prisma: PrismaService,
  ) {}

  @OnEvent('application.created')
  async handleApplicationCreated(event: ApplicationCreatedEvent) {
    const [application, project] = await Promise.all([
      this.prisma.postulacion.findUnique({
        where: { idPostulacion: event.applicationId },
        include: {
          postulante: {
            select: { nombre: true, apellido: true },
          },
          rolProyecto: {
            select: { nombreRol: true },
          },
        },
      }),
      this.prisma.proyecto.findUnique({
        where: { idProyecto: event.projectId },
        select: { tituloProyecto: true, creadoPor: true },
      }),
    ]);

    if (!application || !project) return;

    // El líder puede ser el propio postulante (ej. se postula a su propio proyecto);
    // en ese caso no se genera notificación.
    if (project.creadoPor === application.idUsuarioPostulante) return;

    await this.notificationsService.notifyFromTemplate(
      [project.creadoPor],
      'NUEVA_POSTULACION',
      {
        userName: `${application.postulante.nombre} ${application.postulante.apellido}`,
        roleName: application.rolProyecto.nombreRol,
        projectTitle: project.tituloProyecto,
        projectId: event.projectId,
        applicationId: event.applicationId,
        roleId: event.roleId,
      },
    );
  }
}
