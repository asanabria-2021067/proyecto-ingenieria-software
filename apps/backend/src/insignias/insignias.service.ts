import { Injectable } from '@nestjs/common';
import { NivelInsignia, PrismaClient } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CATALOGO_INSIGNIAS,
  ClaveInsignia,
  NIVELES,
  NOMBRE_NIVEL,
  nivelPara,
  rangoNivel,
} from './insignias.catalog';
import { calcularMetrica } from './insignias.metricas';

export interface InsigniaPublica {
  clave: string;
  nombre: string;
  descripcion: string;
  icono: string;
  nivel: NivelInsignia | null;
  progreso: number;
  umbrales: number[];
  /** Umbral del siguiente nivel; null si ya tiene Diamante. */
  siguienteUmbral: number | null;
  fechas: Record<NivelInsignia, string | null>;
}

const FECHA_POR_NIVEL = {
  BRONCE: 'fechaBronce',
  PLATA: 'fechaPlata',
  ORO: 'fechaOro',
  DIAMANTE: 'fechaDiamante',
} as const;

/** Catálogo completo con el avance del usuario; `soloObtenidas` oculta lo bloqueado (perfil público). */
export async function listarInsigniasUsuario(
  db: Pick<PrismaClient, 'insignia'>,
  idUsuario: number,
  soloObtenidas = false,
): Promise<InsigniaPublica[]> {
  const filas = await db.insignia.findMany({
    orderBy: { idInsignia: 'asc' },
    include: { usuarios: { where: { idUsuario } } },
  });
  const lista = filas.map((i): InsigniaPublica => {
    const u = i.usuarios[0];
    const umbrales = [i.umbralBronce, i.umbralPlata, i.umbralOro, i.umbralDiamante];
    const nivel = u?.nivel ?? null;
    return {
      clave: i.clave,
      nombre: i.nombre,
      descripcion: i.descripcion,
      icono: i.icono,
      nivel,
      progreso: u?.progreso ?? 0,
      umbrales,
      siguienteUmbral: umbrales[rangoNivel(nivel)] ?? null,
      fechas: Object.fromEntries(
        NIVELES.map((n) => [n, u?.[FECHA_POR_NIVEL[n]]?.toISOString() ?? null]),
      ) as InsigniaPublica['fechas'],
    };
  });
  return soloObtenidas ? lista.filter((i) => i.nivel !== null) : lista;
}

@Injectable()
export class InsigniasService {
  /** `notifications` ausente = modo silencioso (script de backfill). */
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications?: NotificationsService,
  ) {}

  listarMias(idUsuario: number) {
    return listarInsigniasUsuario(this.prisma, idUsuario);
  }

  /** Deja el catálogo de la BD igual al de código (idempotente). */
  async sincronizarCatalogo(): Promise<void> {
    for (const d of CATALOGO_INSIGNIAS) {
      const datos = {
        nombre: d.nombre,
        descripcion: d.descripcion,
        icono: d.icono,
        metrica: d.clave,
        umbralBronce: d.umbrales[0],
        umbralPlata: d.umbrales[1],
        umbralOro: d.umbrales[2],
        umbralDiamante: d.umbrales[3],
      };
      await this.prisma.insignia.upsert({ where: { clave: d.clave }, update: datos, create: { clave: d.clave, ...datos } });
    }
  }

  /**
   * Recalcula las insignias `claves` de un usuario. Nunca baja progreso ni
   * nivel. Devuelve las claves que subieron de nivel; notifica una vez por
   * insignia con el nivel más alto alcanzado; `notificar = false` la omite.
   */
  async recalcular(idUsuario: number, claves: ClaveInsignia[], notificar = true): Promise<ClaveInsignia[]> {
    const insignias = await this.prisma.insignia.findMany({
      where: { clave: { in: claves } },
      include: { usuarios: { where: { idUsuario } } },
    });
    const subidas: ClaveInsignia[] = [];

    for (const insignia of insignias) {
      const actual = insignia.usuarios[0];
      const valor = await calcularMetrica(this.prisma, insignia.clave as ClaveInsignia, idUsuario);
      const progreso = Math.max(actual?.progreso ?? 0, valor);
      const previo = actual?.nivel ?? null;
      const calculado = nivelPara(progreso, [
        insignia.umbralBronce,
        insignia.umbralPlata,
        insignia.umbralOro,
        insignia.umbralDiamante,
      ]);
      const nivel = rangoNivel(calculado) > rangoNivel(previo) ? calculado : previo;

      if (actual && progreso === actual.progreso && nivel === previo) continue;

      // Fecha de cada nivel recién alcanzado (si salta varios, comparten instante).
      const ahora = new Date();
      const fechas: Partial<Record<(typeof FECHA_POR_NIVEL)[NivelInsignia], Date>> = {};
      NIVELES.forEach((n, i) => {
        if (i < rangoNivel(nivel) && !actual?.[FECHA_POR_NIVEL[n]]) fechas[FECHA_POR_NIVEL[n]] = ahora;
      });
      await this.prisma.insigniaUsuario.upsert({
        where: { idUsuario_idInsignia: { idUsuario, idInsignia: insignia.idInsignia } },
        update: { progreso, nivel, ...fechas },
        create: { idUsuario, idInsignia: insignia.idInsignia, progreso, nivel, ...fechas },
      });

      if (nivel !== null && rangoNivel(nivel) > rangoNivel(previo)) {
        subidas.push(insignia.clave as ClaveInsignia);
        if (notificar) await this.notificar(idUsuario, insignia.clave, insignia.nombre, nivel);
      }
    }
    return subidas;
  }

  /** Backfill idempotente y silencioso: recalcula todas las insignias de todos los usuarios. */
  async backfillTodos(): Promise<number> {
    await this.sincronizarCatalogo();
    const claves = CATALOGO_INSIGNIAS.map((c) => c.clave);
    let total = 0;
    let cursor: number | undefined;
    for (;;) {
      const lote = await this.prisma.usuario.findMany({
        select: { idUsuario: true },
        orderBy: { idUsuario: 'asc' },
        take: 200,
        ...(cursor === undefined ? {} : { cursor: { idUsuario: cursor }, skip: 1 }),
      });
      if (lote.length === 0) return total;
      for (const { idUsuario } of lote) await this.recalcular(idUsuario, claves, false);
      total += lote.length;
      cursor = lote[lote.length - 1].idUsuario;
    }
  }

  private async notificar(idUsuario: number, clave: string, insigniaNombre: string, nivel: NivelInsignia) {
    // notifyFromTemplate respeta PreferenciaNotificacion.
    await this.notifications?.notifyFromTemplate([idUsuario], 'INSIGNIA_OBTENIDA', {
      insigniaClave: clave,
      insigniaNombre,
      nivel,
      nivelNombre: NOMBRE_NIVEL[nivel],
    });
  }
}
