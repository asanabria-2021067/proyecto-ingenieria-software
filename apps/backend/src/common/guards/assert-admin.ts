import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { ADMIN_ONLY_MESSAGE } from './roles.guard';

/** Segunda barrera en los servicios: el rol se consulta en la base, no en el token. */
export async function assertAdmin(prisma: PrismaService, idUsuario: number): Promise<void> {
  const rol = await prisma.usuarioRolAcceso.findFirst({
    where: { idUsuario, rolAcceso: { nombrePerfil: 'administrador' } },
    select: { idUsuarioRolAcceso: true },
  });
  if (!rol) throw new ForbiddenException(ADMIN_ONLY_MESSAGE);
}
