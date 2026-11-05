import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateSilencioDto } from './dto/update-silencio.dto';
import { enHorarioSilencio, ZONA_SILENCIO } from './silencio-horario';

const SIN_CONFIGURAR = { activo: false, horaInicio: '22:00', horaFin: '07:00' };

/** MEJ-136: horario de silencio por usuario; solo toca su propia fila. */
@Injectable()
export class NotificationSilencioService {
  constructor(private prisma: PrismaService) {}

  async obtener(userId: number) {
    const fila = await this.prisma.preferenciaSilencioNotificacion.findUnique({
      where: { idUsuario: userId },
      select: { activo: true, horaInicio: true, horaFin: true },
    });
    const pref = fila ?? SIN_CONFIGURAR;
    return { ...pref, zona: ZONA_SILENCIO, enSilencio: enHorarioSilencio(pref) };
  }

  async guardar(userId: number, dto: UpdateSilencioDto) {
    const data = { activo: dto.activo, horaInicio: dto.horaInicio, horaFin: dto.horaFin };
    await this.prisma.preferenciaSilencioNotificacion.upsert({
      where: { idUsuario: userId },
      create: { idUsuario: userId, ...data },
      update: data,
    });
    return this.obtener(userId);
  }
}
