import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { v2 as cloudinary } from 'cloudinary';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { assertAdmin } from '../common/guards/assert-admin';

export type EstadoServicio = 'operativo' | 'caido' | 'no_configurado';

const TIMEOUT_MS = 3000;

const conLimite = <T>(promesa: Promise<T>): Promise<T> =>
  Promise.race([promesa, new Promise<never>((_, rechazo) => setTimeout(() => rechazo(new Error('timeout')), TIMEOUT_MS))]);

const comoEstado = async (prueba: () => Promise<boolean>): Promise<EstadoServicio> => {
  try {
    return (await conLimite(prueba())) ? 'operativo' : 'caido';
  } catch {
    return 'caido';
  }
};

@Injectable()
export class AdminEstadoSistemaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsGateway,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  private async cloudinaryEstado(): Promise<EstadoServicio> {
    const cloud_name = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const api_key = this.config.get<string>('CLOUDINARY_API_KEY');
    const api_secret = this.config.get<string>('CLOUDINARY_API_SECRET');
    if (!cloud_name || !api_key || !api_secret) return 'no_configurado';
    cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
    return comoEstado(async () => (await cloudinary.api.ping()).status?.toLowerCase() === 'ok');
  }

  async obtener(idActor: number) {
    await assertAdmin(this.prisma, idActor);
    const clave = 'estado-sistema:ping';
    const [baseDatos, redis, cloudinaryEstado, migraciones] = await Promise.all([
      comoEstado(async () => (await this.prisma.$queryRaw`SELECT 1 AS ok`) !== null),
      comoEstado(async () => {
        await this.cache.set(clave, 'ok', 5000);
        return (await this.cache.get(clave)) === 'ok';
      }),
      this.cloudinaryEstado(),
      this.prisma.$queryRaw<{ nombre: string; fecha: Date | null }[]>`
        SELECT migration_name AS nombre, finished_at AS fecha
        FROM _prisma_migrations
        ORDER BY started_at DESC
        LIMIT 5`.catch(() => []),
    ]);
    // Con namespace, `server` es un Namespace: el engine vive en el Server raiz, que cuenta los dos gateways (/chat y /notifications).
    const gw = this.notifications.server as { server?: unknown } | undefined;
    const server = (gw?.server ?? gw) as { engine?: { clientsCount: number } } | undefined;
    return {
      baseDatos,
      redis,
      cloudinary: cloudinaryEstado,
      socket: server?.engine ? 'operativo' : ('caido' as EstadoServicio),
      conexionesSocket: server?.engine?.clientsCount ?? 0,
      version: {
        commit: process.env.GIT_SHA || 'desconocido',
        fecha: process.env.BUILD_DATE || 'desconocido',
      },
      migraciones,
    };
  }
}
