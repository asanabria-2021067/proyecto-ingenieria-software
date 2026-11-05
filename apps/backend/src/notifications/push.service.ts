import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { estaEnNoMolestar } from '../chat/chat-silencio.util';
import { readVapidConfig, type VapidConfig } from '../config/vapid-config';
import { PrismaService } from '../prisma/prisma.service';
import { SuscripcionPushDto } from './dto/suscripcion-push.dto';
import { enHorarioSilencio } from './silencio-horario';

export const MAX_SUSCRIPCIONES_PUSH = 5;

// El servidor hace POST al endpoint guardado: solo los servicios push de los navegadores, nunca una URL interna.
const HOSTS_PUSH =
  /^(fcm\.googleapis\.com|android\.googleapis\.com|web\.push\.apple\.com|([\w-]+\.)+push\.services\.mozilla\.com|([\w-]+\.)+notify\.windows\.com|([\w-]+\.)+push\.apple\.com)$/;

export interface PushPayload {
  titulo: string;
  mensaje?: string;
}

/** MEJ-137: Web Push con VAPID. Cada usuario gestiona solo sus suscripciones. */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  private vapid(): VapidConfig | null {
    const env = Object.fromEntries(
      ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'].map((n) => [n, this.config.get<string>(n)]),
    );
    return readVapidConfig(env).config;
  }

  /** La clave publica viaja por la API (no por NEXT_PUBLIC_*, que se hornea en build). */
  clavePublica() {
    return { clave: this.vapid()?.publicKey ?? null };
  }

  async suscribir(userId: number, dto: SuscripcionPushDto) {
    if (!HOSTS_PUSH.test(new URL(dto.endpoint).hostname)) {
      throw new BadRequestException('El servicio de notificaciones del navegador no es compatible');
    }
    const data = { idUsuario: userId, p256dh: dto.p256dh, auth: dto.auth };
    await this.prisma.suscripcionPush.upsert({
      where: { endpoint: dto.endpoint },
      create: { endpoint: dto.endpoint, ...data },
      update: data,
    });
    // Limite por usuario: se descartan las mas antiguas.
    const sobrantes = await this.prisma.suscripcionPush.findMany({
      where: { idUsuario: userId },
      orderBy: { creadaEn: 'desc' },
      skip: MAX_SUSCRIPCIONES_PUSH,
      select: { idSuscripcion: true },
    });
    if (sobrantes.length > 0) {
      await this.prisma.suscripcionPush.deleteMany({
        where: { idSuscripcion: { in: sobrantes.map((s) => s.idSuscripcion) }, idUsuario: userId },
      });
    }
    return { suscrito: true };
  }

  async cancelar(userId: number, endpoint: string) {
    await this.prisma.suscripcionPush.deleteMany({ where: { idUsuario: userId, endpoint } });
  }

  /**
   * Los destinatarios llegan ya filtrados por sus preferencias de categoria. Aqui se omiten quienes
   * estan en su horario de silencio o en no molestar; la notificacion ya quedo guardada en la bandeja.
   * Un 404/410 del servicio push significa suscripcion vencida: se borra. Nunca lanza.
   */
  async enviar(userIds: number[], payload: PushPayload, ahora: Date = new Date()): Promise<void> {
    const vapid = this.vapid();
    if (!vapid || userIds.length === 0) return;
    try {
      const ids = [...new Set(userIds)];
      const [suscripciones, silencios, noMolestar] = await Promise.all([
        this.prisma.suscripcionPush.findMany({ where: { idUsuario: { in: ids } } }),
        this.prisma.preferenciaSilencioNotificacion.findMany({ where: { idUsuario: { in: ids }, activo: true } }),
        this.prisma.preferenciaNoMolestar.findMany({ where: { idUsuario: { in: ids }, activo: true } }),
      ]);
      const callados = new Set([
        ...silencios.filter((s) => enHorarioSilencio(s, ahora)).map((s) => s.idUsuario),
        ...noMolestar.filter((n) => estaEnNoMolestar(n, ahora)).map((n) => n.idUsuario),
      ]);
      const cuerpo = JSON.stringify({ titulo: payload.titulo, mensaje: payload.mensaje ?? '' });
      await Promise.all(
        suscripciones
          .filter((s) => !callados.has(s.idUsuario))
          .map(async (s) => {
            try {
              await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, cuerpo, {
                vapidDetails: { subject: vapid.subject, publicKey: vapid.publicKey, privateKey: vapid.privateKey },
                TTL: 3600,
              });
            } catch (error) {
              const status = (error as { statusCode?: number }).statusCode;
              if (status === 404 || status === 410) {
                await this.prisma.suscripcionPush.deleteMany({ where: { idSuscripcion: s.idSuscripcion } });
              } else {
                this.logger.warn(`Push no enviado (estado ${status ?? 'desconocido'})`);
              }
            }
          }),
      );
    } catch {
      this.logger.warn('Push no enviado');
    }
  }
}
