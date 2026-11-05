import { BadRequestException, Injectable } from '@nestjs/common';
import { estaEnNoMolestar } from '../chat/chat-silencio.util';
import { assertSinBloqueo } from '../common/bloqueos';
import { addDaysToDay, dateOnlyToDay, todayInGuatemala } from '../common/utils/guatemala-date';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { DisponibilidadSemanalService } from './disponibilidad-semanal.service';
import { assertPerfilAccesible } from './perfil-acceso';

/** Franjas que se ofrecen en la cuadricula del asistente: 7:00 a 21:00 (hora de Guatemala). */
export const HORA_INICIO_JORNADA = 7;
export const HORA_FIN_JORNADA = 21;
export const MAX_INVITADOS = 10;
export const MAX_DIAS = 14;

const OFFSET_GUATEMALA = '-06:00'; // sin horario de verano

const instante = (dia: string, hora: number) => new Date(`${dia}T${String(hora).padStart(2, '0')}:00:00${OFFSET_GUATEMALA}`);
/** 0 = lunes ... 6 = domingo, igual que la disponibilidad semanal. */
const diaSemanaDe = (dia: string) => (new Date(`${dia}T00:00:00Z`).getUTCDay() + 6) % 7;

export interface FranjaSugerida {
  fecha: string;
  horaInicio: number;
  horaFin: number;
}

/**
 * Primeras `max` franjas de `horas` horas seguidas en que TODAS las personas estan libres. Una franja no empieza
 * antes de `ahora` y las sugerencias de un mismo dia no se solapan. Pura: la prueba de la logica no necesita base de datos.
 */
export function sugerirFranjas(
  dias: Array<{ fecha: string; libresPorPersona: Array<ReadonlySet<number>> }>,
  horas: number,
  ahora: Date,
  max = 3,
): FranjaSugerida[] {
  const sugeridas: FranjaSugerida[] = [];
  for (const { fecha, libresPorPersona } of dias) {
    let h = HORA_INICIO_JORNADA;
    while (h + horas <= HORA_FIN_JORNADA && sugeridas.length < max) {
      const libreParaTodos = libresPorPersona.every((libres) => Array.from({ length: horas }, (_, i) => h + i).every((x) => libres.has(x)));
      if (libreParaTodos && instante(fecha, h) > ahora) {
        sugeridas.push({ fecha, horaInicio: h, horaFin: h + horas });
        h += horas;
      } else {
        h += 1;
      }
    }
    if (sugeridas.length >= max) break;
  }
  return sugeridas;
}

/**
 * MEJ-142: asistente para agendar reuniones. Solo devuelve «libre» u «ocupado» por hora: nunca el titulo,
 * el proyecto ni el detalle de un evento ajeno (esos campos ni siquiera se leen aqui).
 */
@Injectable()
export class AsistenteReunionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventos: EventsService,
    private readonly disponibilidad: DisponibilidadSemanalService,
  ) {}

  async consultar(idUsuario: number, invitados: number[], desdeSolicitado: string | undefined, diasPedidos: number, horas: number) {
    const ids = [...new Set([idUsuario, ...invitados])];
    if (ids.length > MAX_INVITADOS + 1) throw new BadRequestException(`Maximo ${MAX_INVITADOS} invitados`);
    for (const id of ids) {
      if (id === idUsuario) continue;
      await assertPerfilAccesible(this.prisma, idUsuario, id);
      await assertSinBloqueo(this.prisma, idUsuario, id);
    }

    const hoy = todayInGuatemala();
    const desde = desdeSolicitado && desdeSolicitado >= hoy ? desdeSolicitado : hoy;
    const fechas = Array.from({ length: diasPedidos }, (_, i) => addDaysToDay(desde, i));
    const inicioRango = instante(fechas[0], 0);
    const finRango = instante(addDaysToDay(desde, diasPedidos), 0);

    const [personas, ...porPersona] = await Promise.all([
      this.prisma.usuario.findMany({
        where: { idUsuario: { in: ids } },
        select: { idUsuario: true, nombre: true, apellido: true, fotoUrl: true, preferenciaNoMolestar: true },
      }),
      ...ids.map((id) => this.datosDe(id, fechas[0], fechas[fechas.length - 1], inicioRango, finRango)),
    ]);

    const nombres = new Map(personas.map((p) => [p.idUsuario, p]));
    const salida = ids.map((id, i) => {
      const persona = nombres.get(id);
      const datos = porPersona[i];
      const dnd = persona?.preferenciaNoMolestar ?? null;
      const dias = fechas.map((fecha) => {
        const libres = new Set<number>();
        for (let h = HORA_INICIO_JORNADA; h < HORA_FIN_JORNADA; h++) {
          const ini = instante(fecha, h);
          const fin = instante(fecha, h + 1);
          const enDisponibilidad = datos.bloques === null || datos.bloques.has(diaSemanaDe(fecha) * 24 + h);
          const conEvento = datos.eventos.some((e) => e.inicio < fin && e.fin > ini);
          const noMolestar = !!dnd && estaEnNoMolestar(dnd, ini);
          if (enDisponibilidad && !conEvento && !noMolestar) libres.add(h);
        }
        return { fecha, libres, fechaLimite: datos.fechasLimite.has(fecha) };
      });
      return {
        idUsuario: id,
        nombre: persona?.nombre ?? '',
        apellido: persona?.apellido ?? '',
        fotoUrl: persona?.fotoUrl ?? null,
        esYo: id === idUsuario,
        sinDisponibilidad: datos.bloques === null,
        dias,
      };
    });

    return {
      zonaHoraria: 'America/Guatemala',
      horaInicio: HORA_INICIO_JORNADA,
      horaFin: HORA_FIN_JORNADA,
      fechas,
      personas: salida.map((p) => ({
        idUsuario: p.idUsuario,
        nombre: p.nombre,
        apellido: p.apellido,
        fotoUrl: p.fotoUrl,
        esYo: p.esYo,
        sinDisponibilidad: p.sinDisponibilidad,
        // Solo lo propio incluye fechas limite; de los demas unicamente las horas libres.
        dias: p.dias.map((d) => ({
          fecha: d.fecha,
          libres: [...d.libres].sort((a, b) => a - b),
          ...(p.esYo ? { fechaLimite: d.fechaLimite } : {}),
        })),
      })),
      sugerencias: sugerirFranjas(
        fechas.map((fecha, i) => ({ fecha, libresPorPersona: salida.map((p) => p.dias[i].libres) })),
        horas,
        new Date(),
      ),
    };
  }

  /** Solo horas: los eventos se reducen a su intervalo y las tareas a la fecha limite. */
  private async datosDe(idUsuario: number, primerDia: string, ultimoDia: string, inicioRango: Date, finRango: Date) {
    const [eventos, tareas, bloques] = await Promise.all([
      this.eventos.findForUserInRange(idUsuario, inicioRango.toISOString(), finRango.toISOString()),
      this.prisma.tarea.findMany({
        where: {
          eliminadoEn: null,
          estadoTarea: { not: 'HECHO' },
          fechaLimite: { gte: new Date(`${primerDia}T00:00:00Z`), lte: new Date(`${ultimoDia}T00:00:00Z`) },
          asignaciones: { some: { idUsuario, desasignadaEn: null } },
        },
        select: { fechaLimite: true },
      }),
      this.disponibilidad.bloquesDe(idUsuario),
    ]);
    return {
      eventos: eventos.map((e) => ({ inicio: e.fechaInicio, fin: e.fechaFin })),
      fechasLimite: new Set(tareas.flatMap((t) => (t.fechaLimite ? [dateOnlyToDay(t.fechaLimite)] : []))),
      // null = no configuro su disponibilidad: no se le descarta ninguna hora por eso.
      bloques: bloques.length === 0 ? null : new Set(bloques.map((b) => b.dia * 24 + b.hora)),
    };
  }
}
