import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertAdmin } from '../common/guards/assert-admin';
import { UpdateMaintenanceDto } from './dto/update-maintenance.dto';

export const MAINTENANCE_KEY = 'mantenimiento';
export const MAINTENANCE_DEFAULT_MESSAGE = 'La plataforma está en mantenimiento. Disculpa las molestias.';
const CACHE_TTL_MS = 10_000;

interface MaintenanceConfig {
  activo: boolean;
  mensaje: string;
  regresoEstimado: string | null;
  inicioProgramado: string | null;
}

const DEFAULT_CONFIG: MaintenanceConfig = {
  activo: false,
  mensaje: MAINTENANCE_DEFAULT_MESSAGE,
  regresoEstimado: null,
  inicioProgramado: null,
};

/** `bloqueando` se calcula en cada lectura: un inicio programado vencido activa el modo sin cron. */
const withState = (config: MaintenanceConfig, now = new Date()) => ({
  ...config,
  bloqueando: config.activo || (config.inicioProgramado !== null && new Date(config.inicioProgramado) <= now),
});

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  private async readConfig(): Promise<MaintenanceConfig> {
    const cached = await this.cache.get<MaintenanceConfig>(MAINTENANCE_KEY).catch(() => undefined);
    if (cached) return cached;
    const row = await this.prisma.configuracionSistema.findUnique({ where: { clave: MAINTENANCE_KEY } });
    const config: MaintenanceConfig = row?.valor ? { ...DEFAULT_CONFIG, ...JSON.parse(row.valor) } : DEFAULT_CONFIG;
    await this.cache.set(MAINTENANCE_KEY, config, CACHE_TTL_MS).catch(() => undefined);
    return config;
  }

  async estado() {
    return withState(await this.readConfig());
  }

  async actualizar(idActor: number, dto: UpdateMaintenanceDto) {
    await assertAdmin(this.prisma, idActor);
    const antes = await this.readConfig();
    const ahora = new Date();
    const despues: MaintenanceConfig = {
      activo: dto.activo,
      mensaje: dto.mensaje?.trim() || MAINTENANCE_DEFAULT_MESSAGE,
      regresoEstimado: dto.regresoEstimado ?? null,
      inicioProgramado: dto.inicioProgramado ?? null,
    };
    // Apagar el interruptor con un inicio ya vencido lo descarta: si no, seguiría bloqueando.
    if (!despues.activo && despues.inicioProgramado && new Date(despues.inicioProgramado) <= ahora) {
      despues.inicioProgramado = null;
    }
    const { inicioProgramado, regresoEstimado } = despues;
    if (inicioProgramado && regresoEstimado && new Date(regresoEstimado) <= new Date(inicioProgramado)) {
      throw new BadRequestException('El regreso estimado debe ser posterior al inicio programado');
    }
    const valor = JSON.stringify(despues);
    const accion =
      antes.activo !== despues.activo
        ? despues.activo
          ? 'MANTENIMIENTO_ACTIVADO'
          : 'MANTENIMIENTO_DESACTIVADO'
        : withState(antes, ahora).bloqueando && !withState(despues, ahora).bloqueando
          ? 'MANTENIMIENTO_DESACTIVADO'
          : inicioProgramado && inicioProgramado !== antes.inicioProgramado
          ? 'MANTENIMIENTO_PROGRAMADO'
          : 'MANTENIMIENTO_EDITADO';
    await this.prisma.$transaction([
      this.prisma.configuracionSistema.upsert({
        where: { clave: MAINTENANCE_KEY },
        update: { valor, actualizadoPor: idActor, actualizadoEn: new Date() },
        create: {
          clave: MAINTENANCE_KEY,
          valor,
          descripcionParametro: 'Modo mantenimiento',
          actualizadoPor: idActor,
          actualizadoEn: new Date(),
        },
      }),
      this.prisma.bitacoraAuditoria.create({
        data: {
          idUsuario: idActor,
          accion,
          tipoObjeto: 'Mantenimiento',
          detalleJson: { antes, despues } as unknown as Prisma.InputJsonValue,
        },
      }),
    ]);
    await this.cache.set(MAINTENANCE_KEY, despues, CACHE_TTL_MS).catch(() => undefined);
    return withState(despues, ahora);
  }
}
