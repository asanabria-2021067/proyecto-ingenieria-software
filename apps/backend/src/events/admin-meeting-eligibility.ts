import { EstadoProyecto, type Prisma } from '@prisma/client';

/**
 * HU-195 (T-362): qué proyectos puede convocar Administración a una reunión.
 * `PUBLICADO` y `EN_PROGRESO` siempre; `CERRADO` solo durante dos meses
 * calendario desde su cierre oficial. No reutiliza ADMIN_ACTIVE_PROJECT_STATES
 * a propósito: esa constante define "proyecto activo" para KPIs y bandejas y no
 * debe ampliarse por esta regla.
 */
export const MESES_VENTANA_POSCIERRE = 2;

const ESTADOS_ACTIVOS: readonly EstadoProyecto[] = [EstadoProyecto.PUBLICADO, EstadoProyecto.EN_PROGRESO];

// America/Guatemala es UTC-6 fijo (sin horario de verano desde 2006); los
// meses calendario se cuentan sobre la hora local de Guatemala.
const GUATEMALA_OFFSET_MS = -6 * 60 * 60 * 1000;

/**
 * Suma meses calendario a un instante en hora de Guatemala, recortando al
 * último día del mes destino (31-oct + 1 mes = 30-nov; 31-dic + 2 = 28/29-feb).
 */
export function sumarMesesCalendario(instante: Date, meses: number): Date {
  const local = new Date(instante.getTime() + GUATEMALA_OFFSET_MS);
  const mesDestino = local.getUTCMonth() + meses;
  const anio = local.getUTCFullYear() + Math.floor(mesDestino / 12);
  const mes = ((mesDestino % 12) + 12) % 12;
  const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  const dia = Math.min(local.getUTCDate(), ultimoDia);
  const msDelDia = local.getTime() - Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(Date.UTC(anio, mes, dia) + msDelDia - GUATEMALA_OFFSET_MS);
}

/** Intervalo inclusivo `[cierreOficial, cierreOficial + 2 meses]`. */
export function ventanaPoscierre(cierreOficial: Date): { desde: Date; hasta: Date } {
  return { desde: cierreOficial, hasta: sumarMesesCalendario(cierreOficial, MESES_VENTANA_POSCIERRE) };
}

export type MotivoNoElegible =
  | 'PROYECTO_ELIMINADO'
  | 'ESTADO_NO_ELEGIBLE'
  | 'SIN_FECHA_OFICIAL_CIERRE'
  | 'FUERA_DE_VENTANA_POSCIERRE';

export interface ProyectoParaReunion {
  idProyecto: number;
  tituloProyecto: string;
  estadoProyecto: EstadoProyecto;
  eliminadoEn: Date | null;
  creadoPor: number;
  /** `resueltaEn` de la revisión de cierre APROBADA; null si no hay prueba oficial. */
  cierreOficial: Date | null;
}

/**
 * `null` = elegible. `ahora` se pasa para una convocatoria NUEVA (crear o
 * añadir el proyecto): también el instante de creación debe caer en la
 * ventana. Al reprogramar un proyecto ya convocado se omite y solo se validan
 * inicio y fin.
 */
export function motivoNoElegible(
  proyecto: Pick<ProyectoParaReunion, 'estadoProyecto' | 'eliminadoEn' | 'cierreOficial'>,
  rango: { fechaInicio: Date; fechaFin: Date },
  ahora?: Date,
): MotivoNoElegible | null {
  if (proyecto.eliminadoEn) return 'PROYECTO_ELIMINADO';
  if (ESTADOS_ACTIVOS.includes(proyecto.estadoProyecto)) return null;
  if (proyecto.estadoProyecto !== EstadoProyecto.CERRADO) return 'ESTADO_NO_ELEGIBLE';
  if (!proyecto.cierreOficial) return 'SIN_FECHA_OFICIAL_CIERRE';

  const { desde, hasta } = ventanaPoscierre(proyecto.cierreOficial);
  const dentro = (instante: Date) => instante.getTime() >= desde.getTime() && instante.getTime() <= hasta.getTime();
  const instantes = ahora ? [ahora, rango.fechaInicio, rango.fechaFin] : [rango.fechaInicio, rango.fechaFin];
  return instantes.every(dentro) ? null : 'FUERA_DE_VENTANA_POSCIERRE';
}

/**
 * Carga los proyectos con su cierre oficial: la revisión APROBADA es la única
 * escritura de CERRADO (project-closure-review.service), y su `resueltaEn` es
 * la fecha de aprobación de esa misma transacción. Nunca se usa
 * `fechaActualizacion` como sustituto.
 */
export async function cargarProyectosParaReunion(
  db: Prisma.TransactionClient,
  ids: number[],
): Promise<Map<number, ProyectoParaReunion>> {
  const filas = await db.proyecto.findMany({
    where: { idProyecto: { in: ids } },
    select: {
      idProyecto: true,
      tituloProyecto: true,
      estadoProyecto: true,
      eliminadoEn: true,
      creadoPor: true,
      revisionesCierre: {
        where: { estadoRevision: 'APROBADA', resueltaEn: { not: null } },
        orderBy: { resueltaEn: 'desc' },
        take: 1,
        select: { resueltaEn: true },
      },
    },
  });
  return new Map(
    filas.map(({ revisionesCierre, ...proyecto }) => [
      proyecto.idProyecto,
      { ...proyecto, cierreOficial: revisionesCierre[0]?.resueltaEn ?? null },
    ]),
  );
}
