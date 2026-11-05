import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TipoRestriccion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FILTRO_DIRECTORIO } from '../social/social.service';

const PERSONA = { idUsuario: true, nombre: true, apellido: true, fotoUrl: true } as const;

/** MEJ-153: bloquear (impide DM, amistad e invitaciones, en ambos sentidos) y silenciar (oculta sus avisos). Siempre sobre lo propio. */
@Injectable()
export class RestriccionesService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(idUsuario: number) {
    const filas = await this.prisma.restriccionUsuario.findMany({
      where: { idUsuario },
      orderBy: { creadaEn: 'desc' },
      select: { tipo: true, objetivo: { select: PERSONA } },
    });
    return {
      bloqueados: filas.filter((f) => f.tipo === 'BLOQUEO').map((f) => f.objetivo),
      silenciados: filas.filter((f) => f.tipo === 'SILENCIO').map((f) => f.objetivo),
    };
  }

  async aplicar(idUsuario: number, idObjetivo: number, tipo: TipoRestriccion) {
    if (idUsuario === idObjetivo) throw new BadRequestException('No puedes aplicarte esto a ti mismo');
    const existe = await this.prisma.usuario.findFirst({ where: { idUsuario: idObjetivo, ...FILTRO_DIRECTORIO }, select: { idUsuario: true } });
    if (!existe) throw new NotFoundException(`Usuario con id ${idObjetivo} no encontrado`);
    await this.prisma.$transaction([
      this.prisma.restriccionUsuario.upsert({
        where: { idUsuario_idObjetivo_tipo: { idUsuario, idObjetivo, tipo } },
        create: { idUsuario, idObjetivo, tipo },
        update: {},
      }),
      // Bloquear tambien deshace amistad (aceptada o pendiente) y seguimientos entre ambos.
      ...(tipo === 'BLOQUEO'
        ? [
            this.prisma.amistad.deleteMany({
              where: {
                OR: [
                  { idUsuarioSolicitante: idUsuario, idUsuarioReceptor: idObjetivo },
                  { idUsuarioSolicitante: idObjetivo, idUsuarioReceptor: idUsuario },
                ],
              },
            }),
            this.prisma.seguimiento.deleteMany({
              where: {
                OR: [
                  { idSeguidor: idUsuario, idSeguido: idObjetivo },
                  { idSeguidor: idObjetivo, idSeguido: idUsuario },
                ],
              },
            }),
          ]
        : []),
    ]);
    return this.listar(idUsuario);
  }

  async quitar(idUsuario: number, idObjetivo: number, tipo: TipoRestriccion) {
    await this.prisma.restriccionUsuario.deleteMany({ where: { idUsuario, idObjetivo, tipo } });
    return this.listar(idUsuario);
  }
}
