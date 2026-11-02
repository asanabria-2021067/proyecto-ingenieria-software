import { PrismaService } from '../prisma/prisma.service';

/**
 * Acceso en tiempo real a una conversación (join/typing). Mismo criterio que
 * ChatService.getConversacionOrThrow: participante, conversación no eliminada
 * y, en canales, membresía vigente del proyecto (líder o participación ACTIVO)
 * o de la organización (membresía ACTIVA).
 */
export async function puedeEntrarAConversacion(
  prisma: PrismaService,
  idConversacion: number,
  userId: number,
): Promise<boolean> {
  const conversacion = await prisma.conversacion.findFirst({
    where: { idConversacion, eliminadaEn: null, participantes: { some: { idUsuario: userId } } },
    select: {
      esCanal: true,
      idProyecto: true,
      idOrganizacion: true,
      proyecto: { select: { creadoPor: true, eliminadoEn: true } },
    },
  });
  if (!conversacion) return false;
  if (conversacion.idOrganizacion) {
    const miembro = await prisma.usuarioOrganizacion.findFirst({
      where: { idUsuario: userId, idOrganizacion: conversacion.idOrganizacion, estadoMembresia: 'ACTIVA' },
      select: { idUsuarioOrganizacion: true },
    });
    return !!miembro;
  }
  if (!conversacion.esCanal) return true;
  if (conversacion.idProyecto === null || !conversacion.proyecto || conversacion.proyecto.eliminadoEn) return false;
  if (conversacion.proyecto.creadoPor === userId) return true;

  const participa = await prisma.participacionProyecto.findFirst({
    where: { idUsuario: userId, estadoParticipacion: 'ACTIVO', rolProyecto: { idProyecto: conversacion.idProyecto } },
    select: { idParticipacion: true },
  });
  return !!participa;
}
