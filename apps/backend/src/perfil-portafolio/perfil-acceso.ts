import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FILTRO_DIRECTORIO } from '../social/social.service';

/** Perfil propio, o el de alguien que el directorio tambien muestra; si no, 404 (misma regla que el resto del perfil social). */
export async function assertPerfilAccesible(prisma: PrismaService, idVisor: number, idObjetivo: number) {
  if (idVisor === idObjetivo) return;
  const visible = await prisma.usuario.findFirst({
    where: { idUsuario: idObjetivo, ...FILTRO_DIRECTORIO },
    select: { idUsuario: true },
  });
  if (!visible) throw new NotFoundException(`Usuario con id ${idObjetivo} no encontrado`);
}
