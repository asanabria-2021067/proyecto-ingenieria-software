import { BadRequestException, Injectable } from '@nestjs/common';
import { TipoEstadoChat } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ChatGateway } from './chat.gateway';
import { SetEstadoChatDto } from './dto/set-estado-chat.dto';

export const ESTADO_CHAT_SELECT = { select: { tipo: true, texto: true, venceEn: true } } as const;

interface EstadoChatRow {
  tipo: TipoEstadoChat;
  texto: string | null;
  venceEn: Date | null;
}

/** Un estado vencido (venceEn <= ahora) se trata como inexistente; se evalúa al leer, sin job. */
export function estadoVigente(estado: EstadoChatRow | null | undefined, ahora: Date = new Date()) {
  if (!estado) return null;
  if (estado.venceEn && estado.venceEn.getTime() <= ahora.getTime()) return null;
  return { tipo: estado.tipo, texto: estado.texto, venceEn: estado.venceEn };
}

const MAX_CADUCIDAD_MS = 24 * 60 * 60 * 1000;
// Tolerancia por desfase de reloj entre cliente y servidor (la caducidad "hoy" llega calculada en el cliente).
const HOLGURA_RELOJ_MS = 5 * 60 * 1000;

@Injectable()
export class ChatEstadoService {
  constructor(
    private prisma: PrismaService,
    private gateway: ChatGateway,
  ) {}

  async obtener(userId: number) {
    const estado = await this.prisma.estadoChatUsuario.findUnique({
      where: { idUsuario: userId },
      ...ESTADO_CHAT_SELECT,
    });
    return estadoVigente(estado);
  }

  async definir(userId: number, dto: SetEstadoChatDto) {
    const ahora = Date.now();
    const venceEn = dto.venceEn ? new Date(dto.venceEn) : null;
    if (venceEn && (venceEn.getTime() <= ahora || venceEn.getTime() > ahora + MAX_CADUCIDAD_MS + HOLGURA_RELOJ_MS)) {
      throw new BadRequestException('La caducidad debe ser futura y de máximo 24 horas');
    }

    const data = {
      tipo: dto.tipo,
      texto: dto.tipo === TipoEstadoChat.PERSONALIZADO ? (dto.texto ?? null) : null,
      venceEn,
    };
    const estado = await this.prisma.estadoChatUsuario.upsert({
      where: { idUsuario: userId },
      create: { idUsuario: userId, ...data },
      update: data,
      ...ESTADO_CHAT_SELECT,
    });
    await this.avisarACompaneros(userId);
    return estadoVigente(estado);
  }

  async limpiar(userId: number) {
    await this.prisma.estadoChatUsuario.deleteMany({ where: { idUsuario: userId } });
    await this.avisarACompaneros(userId);
  }

  /** Solo quienes comparten una conversación activa con el usuario refrescan su lista. */
  private async avisarACompaneros(userId: number) {
    const companeros = await this.prisma.conversacionParticipante.findMany({
      where: {
        idUsuario: { not: userId },
        conversacion: { eliminadaEn: null, participantes: { some: { idUsuario: userId } } },
      },
      select: { idConversacion: true, idUsuario: true },
    });
    for (const { idConversacion, idUsuario } of companeros) {
      this.gateway.notifyConversationCreated(idConversacion, [idUsuario]);
    }
  }
}
