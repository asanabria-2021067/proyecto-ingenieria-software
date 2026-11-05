/**
 * Dataset de demo final (Fase 4): asociacion oficial con su junta, dos
 * organizaciones con chat #general, proyectos de los tres tipos de duenio
 * (personal, organizacion, asociacion) en distintos estados y horas del
 * semestre actual para 15 estudiantes de Computacion, registros del semestre
 * anterior para 8 de ellos (comparativo) y un rol con requisitos de habilidad
 * y postulaciones pendientes (ordenar por coincidencia).
 *
 * Entrega 9 (DEMO-9): rol con preguntas, postulaciones con linea de tiempo y rechazo, tarea con subtareas/enlaces/responsables,
 * objetivo de sprint, hilo de chat, portafolio publico y disponibilidad semanal.
 *
 * Idempotente: todo se localiza por clave natural (correo, nombre, titulo) y
 * una segunda corrida no duplica nada. Solo crea o actualiza entidades de
 * demo y nunca toca otras cuentas. Limpieza (DEMO-11): marca como leidos los avisos
 * de nuevo inicio de sesion de demo.cs01-15 y borra definitivamente los «Mensaje
 * eliminado» de Valeria en el #general del Hackathon (si alguno es padre de un hilo
 * con respuestas vivas o esta citado por un mensaje vivo, se restaura con texto normal).
 *
 * Requiere DEMO_PASSWORD y DEMO_COORDINADOR_PASSWORD (contrasenas de las cuentas
 * demo NUEVAS; nunca se imprimen ni se guardan) y que carlos.mendoza@uvg.edu.gt ya exista.
 * DRY_RUN=1 corre todo dentro de una transaccion y la revierte al final.
 *
 * Uso: DEMO_PASSWORD="..." DEMO_COORDINADOR_PASSWORD="..." npm run prisma:seed-demo-final (en la imagen de
 * produccion no hay tsx; ver README, seccion Demo).
 */
import { Prisma, PrismaClient, type EstadoProyecto, type EstadoTarea, type RolOrganizacion, type TipoProyecto } from '@prisma/client';
import { hashSync } from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { addDaysToDay, todayInGuatemala } from '../src/common/utils/guatemala-date';
import { esEnRiesgo, semestreDe, type Semestre } from '../src/horas-semestre/semestre';

const cliente = new PrismaClient();
// En DRY_RUN pasa a ser el cliente de la transaccion que se revierte.
let prisma: Prisma.TransactionClient = cliente;

const NOMBRE_ASOCIACION = 'Asociación de Estudiantes de Ciencias de la Computación y TI';
const CORREO_PRESIDENTE = 'carlos.mendoza@uvg.edu.gt';
// Metas variadas por estudiante (indice % 3).
const METAS_BECA = [80, 60, 100];
const METAS_EXTENSION = [40, 30, 50];
// Carlos (presidente): cuenta real, solo se fija su registro del semestre.
const REGISTRO_PRESIDENTE = { metaBeca: 50, becaDeclarada: 20, metaExtension: 40, extensionDeclarada: 10 };
// Cuantas cuentas demo reciben horas del semestre anterior (>= 5 para el comparativo).
const CON_SEMESTRE_ANTERIOR = 8;
const RIESGO_MIN = 4;
const RIESGO_MAX = 8;

const stats: Record<string, { creado: number; actualizado: number }> = {};
const contar = (entidad: string, tipo: 'creado' | 'actualizado') => stats[entidad][tipo]++;

/** Busca por clave natural; crea si falta; actualiza solo si `actualizar` devuelve algo (hay diferencias). */
async function asegurar<T>(
  entidad: string,
  buscar: () => Promise<T | null>,
  crear: () => Promise<T>,
  actualizar?: (existente: T) => Promise<T> | undefined,
): Promise<T> {
  stats[entidad] ??= { creado: 0, actualizado: 0 };
  const existente = await buscar();
  if (!existente) {
    contar(entidad, 'creado');
    return crear();
  }
  const cambio = actualizar?.(existente);
  if (cambio) {
    contar(entidad, 'actualizado');
    return cambio;
  }
  return existente;
}

function enDias(n: number): Date {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + n);
  fecha.setHours(0, 0, 0, 0);
  return fecha;
}

/** Semestre inmediatamente anterior: del 2.º es el 1.º del mismo año; del 1.º, el 2.º del año previo. */
const semestreAnterior = (s: Pick<Semestre, 'anio' | 'periodo'>) => (s.periodo === 2 ? { anio: s.anio, periodo: 1 } : { anio: s.anio - 1, periodo: 2 });

const inicioDeDia = (dia: string) => new Date(`${dia}T06:00:00Z`);

// ─── Estudiantes demo ───────────────────────────────────────────────────────

const NOMBRES: [string, string][] = [
  ['Valeria', 'Castillo'], ['Diego', 'Morales'], ['Daniela', 'Pineda'], ['Andrés', 'Cifuentes'], ['Paula', 'Barrios'],
  ['Marco', 'Estrada'], ['Lucía', 'Monzón'], ['Rodrigo', 'Samayoa'], ['Gabriela', 'Orantes'], ['Javier', 'Calderón'],
  ['Mónica', 'Ruiz'], ['Esteban', 'Palencia'], ['Natalia', 'Solís'], ['Kevin', 'Arriaza'], ['Alejandra', 'Duarte'],
];

/** Desviacion (puntos porcentuales) del avance respecto al esperado a hoy; null = sin meta de ese tipo (3 estudiantes sin ninguna). Menor a -20 = en riesgo. */
const PLAN_HORAS: { beca: number | null; extension: number | null }[] = [
  { beca: 15, extension: null }, { beca: 5, extension: 10 }, { beca: -35, extension: null }, { beca: -10, extension: -5 },
  { beca: 30, extension: null }, { beca: -40, extension: -35 }, { beca: 0, extension: 20 }, { beca: -35, extension: null },
  { beca: 10, extension: null }, { beca: -38, extension: -10 }, { beca: null, extension: -33 }, { beca: null, extension: null },
  { beca: null, extension: null }, { beca: 40, extension: 5 }, { beca: null, extension: null },
];

const nn = (i: number) => String(i + 1).padStart(2, '0');
const correoDemo = (i: number) => `demo.cs${nn(i)}@uvg.edu.gt`;
const carneDemo = (i: number) => `DEMO-CS-${nn(i)}`;

/** Horas acreditadas en UVGenius (proyecto cerrado de la asociacion) por indice de estudiante; cuentan como avance de beca. */
const ACREDITADAS_BECA: Record<number, number> = { 4: 12, 8: 8 };

function avancePct(desviacion: number, esperado: number) {
  return Math.min(Math.max(esperado + desviacion, 0), 100);
}

function porcentajeEsperado(s: Semestre, hoy: string) {
  const dias = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);
  const total = dias(s.fin, s.inicio) + 1;
  return (Math.min(Math.max(dias(hoy, s.inicio) + 1, 0), total) / total) * 100;
}

interface FilaHoras { metaBeca: number | null; avanceBeca: number; metaExtension: number | null; avanceExtension: number }

/** Cuenta estudiantes en riesgo (beca o extension) con la funcion real esEnRiesgo y falla si quedan fuera de 4-8. */
function verificarRiesgo(filas: FilaHoras[], s: Semestre, hoy: string, origen: string) {
  const riesgo = (meta: number | null, avance: number) => meta !== null && meta > 0 && esEnRiesgo((avance / meta) * 100, s.inicio, s.fin, hoy);
  const enRiesgo = filas.filter((f) => riesgo(f.metaBeca, f.avanceBeca) || riesgo(f.metaExtension, f.avanceExtension)).length;
  if (enRiesgo < RIESGO_MIN || enRiesgo > RIESGO_MAX) {
    throw new Error(
      `Riesgo inesperado (${origen}): ${enRiesgo} estudiantes en riesgo al ${hoy} (se esperaban ${RIESGO_MIN}-${RIESGO_MAX}). ` +
        'Las desviaciones del plan solo producen riesgo cuando ha transcurrido mas del 20% del semestre.',
    );
  }
}

/** Plan de horas del semestre actual: devuelve metas y declaradas por estudiante, ya restadas las acreditadas. */
function planDeHoras(s: Semestre, hoy: string) {
  const esperado = porcentajeEsperado(s, hoy);
  const horas = (meta: number, desviacion: number) => Math.round((meta * avancePct(desviacion, esperado)) / 100);
  return PLAN_HORAS.map((p, i) => {
    const acreditada = ACREDITADAS_BECA[i] ?? 0;
    const metaB = METAS_BECA[i % 3];
    const metaE = METAS_EXTENSION[i % 3];
    const avanceBeca = p.beca === null ? 0 : horas(metaB, p.beca);
    const avanceExtension = p.extension === null ? 0 : horas(metaE, p.extension);
    return {
      metaBeca: p.beca === null ? null : metaB,
      becaDeclarada: Math.max(avanceBeca - acreditada, 0),
      metaExtension: p.extension === null ? null : metaE,
      extensionDeclarada: avanceExtension,
      // El avance real incluye las acreditadas aunque la declarada se haya recortado a 0.
      avanceBeca: Math.max(avanceBeca, acreditada),
      avanceExtension,
    };
  });
}

// ─── Proyectos ──────────────────────────────────────────────────────────────

interface TareaDef { titulo: string; estado: EstadoTarea; prioridad: 'BAJA' | 'MEDIA' | 'ALTA'; asignadoA: number; horas?: number; checklist?: [string, boolean][] }

interface ProyectoDef {
  titulo: string;
  descripcion: string;
  tipo: TipoProyecto;
  estado: EstadoProyecto;
  creadoPor: number;
  idAsociacion?: number;
  idOrganizacion?: number;
  participantes: number[];
  sprint: 'activo' | 'cerrado' | null;
  tareas: TareaDef[];
  acreditadas?: Record<number, number>;
}

async function armarProyecto(d: ProyectoDef) {
  const proyecto = await asegurar(
    'proyectos',
    () => prisma.proyecto.findFirst({ where: { tituloProyecto: d.titulo } }),
    () =>
      prisma.proyecto.create({
        data: {
          tituloProyecto: d.titulo,
          descripcionProyecto: d.descripcion,
          tipoProyecto: d.tipo,
          estadoProyecto: d.estado,
          creadoPor: d.creadoPor,
          idAsociacion: d.idAsociacion ?? null,
          fechaPublicacion: enDias(-45),
          fechaInicio: enDias(-40),
          fechaFinEstimada: enDias(d.estado === 'CERRADO' ? -5 : 60),
        },
      }),
    (p) =>
      p.estadoProyecto !== d.estado || p.idAsociacion !== (d.idAsociacion ?? null)
        ? prisma.proyecto.update({ where: { idProyecto: p.idProyecto }, data: { estadoProyecto: d.estado, idAsociacion: d.idAsociacion ?? null } })
        : undefined,
  );

  if (d.idOrganizacion) {
    await asegurar(
      'proyecto_organizacion',
      () => prisma.proyectoOrganizacion.findUnique({ where: { idProyecto_idOrganizacion: { idProyecto: proyecto.idProyecto, idOrganizacion: d.idOrganizacion! } } }),
      () => prisma.proyectoOrganizacion.create({ data: { idProyecto: proyecto.idProyecto, idOrganizacion: d.idOrganizacion!, rolOrganizacion: 'PRINCIPAL' } }),
    );
  }

  const nombreRol = 'Desarrollador/a';
  const rol = await asegurar(
    'roles_proyecto',
    () => prisma.rolProyecto.findFirst({ where: { idProyecto: proyecto.idProyecto, nombreRol } }),
    () => prisma.rolProyecto.create({ data: { idProyecto: proyecto.idProyecto, nombreRol, descripcionRolProyecto: 'Desarrollo del proyecto.', cupos: d.participantes.length + 2 } }),
  );

  const participaciones = new Map<number, number>();
  for (const idUsuario of d.participantes) {
    const postulacion = await asegurar(
      'postulaciones',
      () => prisma.postulacion.findFirst({ where: { idUsuarioPostulante: idUsuario, idRolProyecto: rol.idRolProyecto } }),
      () =>
        prisma.postulacion.create({
          data: { idUsuarioPostulante: idUsuario, idRolProyecto: rol.idRolProyecto, justificacion: 'Participante de demo.', estadoPostulacion: 'ACEPTADA', resueltaPor: d.creadoPor, fechaResolucion: new Date() },
        }),
    );
    const estadoParticipacion = d.estado === 'CERRADO' ? 'COMPLETADO' : 'ACTIVO';
    const participacion = await asegurar(
      'participaciones',
      () => prisma.participacionProyecto.findFirst({ where: { idUsuario, idRolProyecto: rol.idRolProyecto } }),
      () => prisma.participacionProyecto.create({ data: { idUsuario, idRolProyecto: rol.idRolProyecto, idPostulacion: postulacion.idPostulacion, estadoParticipacion } }),
      (p) => (p.estadoParticipacion !== estadoParticipacion ? prisma.participacionProyecto.update({ where: { idParticipacion: p.idParticipacion }, data: { estadoParticipacion } }) : undefined),
    );
    participaciones.set(idUsuario, participacion.idParticipacion);
  }

  if (d.sprint === null) return proyecto;

  // Nunca un segundo sprint operable (sprint_operable_unique).
  const sprint = await asegurar(
    'sprints',
    () =>
      prisma.sprint.findFirst({
        where: d.sprint === 'activo' ? { idProyecto: proyecto.idProyecto, estado: { in: ['ACTIVO', 'EN_FINALIZACION'] } } : { idProyecto: proyecto.idProyecto, numero: 1, estado: 'CERRADO' },
      }),
    () =>
      d.sprint === 'activo'
        ? prisma.sprint.create({ data: { idProyecto: proyecto.idProyecto, numero: 1, estado: 'ACTIVO', fechaInicio: enDias(-7), fechaFinPlaneada: enDias(7) } })
        : prisma.sprint.create({
            data: {
              idProyecto: proyecto.idProyecto, numero: 1, estado: 'CERRADO', fechaInicio: enDias(-30), fechaFinPlaneada: enDias(-3), fechaCierre: enDias(-2), cerradoPor: d.creadoPor,
              tareasPlanificadasCierre: d.tareas.length, tareasCompletadasCierre: d.tareas.filter((t) => t.estado === 'HECHO').length,
              hitosTotalesCierre: 0, hitosCompletadosCierre: 0, porcentajeCumplimientoCierre: 100, tareasArrastradasCierre: 0,
            },
          }),
  );

  for (const [orden, t] of d.tareas.entries()) {
    const tarea = await asegurar(
      'tareas',
      () => prisma.tarea.findFirst({ where: { idProyecto: proyecto.idProyecto, tituloTarea: t.titulo } }),
      () =>
        prisma.tarea.create({
          data: { idProyecto: proyecto.idProyecto, idSprint: sprint.idSprint, idRolProyecto: rol.idRolProyecto, tituloTarea: t.titulo, estadoTarea: t.estado, prioridad: t.prioridad, orden, creadaPor: d.creadoPor, fechaLimite: enDias(5 + orden) },
        }),
    );
    const asignacion = await asegurar(
      'asignaciones',
      () => prisma.asignacionTarea.findFirst({ where: { idTarea: tarea.idTarea, idUsuario: t.asignadoA, desasignadaEn: null } }),
      () => prisma.asignacionTarea.create({ data: { idTarea: tarea.idTarea, idUsuario: t.asignadoA, idParticipacion: participaciones.get(t.asignadoA), asignadoPor: d.creadoPor, horasReales: t.horas } }),
      (a) => (t.horas !== undefined && Number(a.horasReales) !== t.horas ? prisma.asignacionTarea.update({ where: { idAsignacion: a.idAsignacion }, data: { horasReales: t.horas } }) : undefined),
    );
    for (const [orden, [texto, completado]] of (t.checklist ?? []).entries()) {
      await asegurar(
        'checklist_items',
        () => prisma.tareaChecklistItem.findFirst({ where: { idTarea: tarea.idTarea, texto } }),
        () => prisma.tareaChecklistItem.create({ data: { idTarea: tarea.idTarea, texto, completado, orden } }),
        (c) => (c.completado !== completado || c.orden !== orden ? prisma.tareaChecklistItem.update({ where: { idItem: c.idItem }, data: { completado, orden } }) : undefined),
      );
    }
    if (t.horas === undefined) continue;
    await asegurar(
      'registros_tiempo',
      () => prisma.registroTiempoTarea.findFirst({ where: { idAsignacion: asignacion.idAsignacion, nota: 'Horas de demo' } }),
      () => prisma.registroTiempoTarea.create({ data: { idAsignacion: asignacion.idAsignacion, idUsuario: t.asignadoA, horas: t.horas!, fecha: enDias(-2), nota: 'Horas de demo' } }),
    );
  }

  for (const [idUsuario, horas] of Object.entries(d.acreditadas ?? {})) {
    const idParticipacion = participaciones.get(Number(idUsuario))!;
    await asegurar(
      'horas_acreditadas',
      () => prisma.horasParticipacion.findFirst({ where: { idParticipacion, idSprint: sprint.idSprint } }),
      () =>
        prisma.horasParticipacion.create({
          data: { idParticipacion, idSprint: sprint.idSprint, periodoInicio: enDias(-30), periodoFin: enDias(-2), horasReportadas: horas, horasCalculadas: horas, horasAprobadas: horas, estadoHoras: 'APROBADA', fechaAprobacion: new Date() },
        }),
    );
  }
  return proyecto;
}

/** Mensaje de demo: `cita` es el indice (en la misma lista) del mensaje respondido; `horas` = antiguedad. */
interface MensajeDef { de: number; texto: string; horas: number; cita?: number; reacciones?: [number, string][] }

/** Siembra #general de un proyecto (mismo canal que ChatCanalesService.sincronizar) con sus mensajes. */
async function sembrarChatProyecto(idProyecto: number, creadaPor: number, miembros: number[], mensajes: MensajeDef[]) {
  const general = await asegurar(
    'chat_proyecto_general',
    () => prisma.conversacion.findFirst({ where: { idProyecto, esCanal: true, nombreCanal: 'general' } }),
    () => prisma.conversacion.create({ data: { idProyecto, tipo: 'GRUPAL', nombre: 'general', nombreCanal: 'general', esCanal: true, creadaPor } }),
  );
  for (const idUsuario of miembros) {
    await asegurar(
      'chat_proyecto_participantes',
      () => prisma.conversacionParticipante.findUnique({ where: { idConversacion_idUsuario: { idConversacion: general.idConversacion, idUsuario } } }),
      () => prisma.conversacionParticipante.create({ data: { idConversacion: general.idConversacion, idUsuario } }),
    );
  }
  const ids: number[] = [];
  for (const m of mensajes) {
    const mensaje = await asegurar(
      'chat_proyecto_mensajes',
      () => prisma.mensajeChat.findFirst({ where: { idConversacion: general.idConversacion, idRemitente: m.de, contenido: m.texto } }),
      () =>
        prisma.mensajeChat.create({
          data: {
            idConversacion: general.idConversacion, idRemitente: m.de, contenido: m.texto,
            idMensajeCitado: m.cita === undefined ? null : ids[m.cita], enviadoEn: new Date(Date.now() - m.horas * 3_600_000),
          },
        }),
    );
    ids.push(mensaje.idMensaje);
    for (const [idUsuario, emoji] of m.reacciones ?? []) {
      await asegurar(
        'chat_proyecto_reacciones',
        () => prisma.reaccionMensajeChat.findUnique({ where: { idMensaje_idUsuario_emoji: { idMensaje: mensaje.idMensaje, idUsuario, emoji } } }),
        () => prisma.reaccionMensajeChat.create({ data: { idMensaje: mensaje.idMensaje, idUsuario, emoji } }),
      );
    }
  }
}

const TEXTOS_LIMPIEZA = [
  'Revisé el cronograma del evento y todo va en orden.',
  'Quedé pendiente de los permisos del auditorio, les aviso mañana.',
  'Ya actualicé el tablero con los avances de logística.',
  'Gracias por las ideas, las incorporo al plan del hackathon.',
  'Mañana comparto el borrador del programa con el equipo.',
  'Confirmé el horario de la charla inaugural con el equipo.',
  'Subí la agenda actualizada a la carpeta compartida.',
  'Quedamos en revisar los pendientes después de la reunión.',
];
const MAX_VIVOS_CANAL = 8;
const MIN_VIVOS_CANAL = 5;

/** Transaccion interna; en DRY_RUN `prisma` ya es el cliente de la transaccion externa y se usa tal cual. */
const enTransaccion = <T>(fn: (p: Prisma.TransactionClient) => Promise<T>): Promise<T> => ('$transaction' in prisma ? (prisma as PrismaClient).$transaction(fn) : fn(prisma));

/** Un mensaje eliminado solo se borra sin tocar datos vivos: sin encuesta, sin hilo vivo, sin cita viva y con respuestas de hilo que sean hojas muertas sin encuesta ni citas vivas. */
async function hijosBorrables(p: Prisma.TransactionClient, idMensaje: number): Promise<number[] | null> {
  const vivosDependen = (id: number) =>
    p.mensajeChat.count({ where: { OR: [{ idMensajeCitado: id }, { idMensajePadre: id }], eliminadoEn: null } });
  if ((await p.encuestaChat.count({ where: { idMensaje } })) > 0 || (await vivosDependen(idMensaje)) > 0) return null;
  const hijos = await p.mensajeChat.findMany({ where: { idMensajePadre: idMensaje }, select: { idMensaje: true, eliminadoEn: true } });
  for (const h of hijos) {
    if (h.eliminadoEn === null) return null;
    const [encuesta, nietos, citas] = await Promise.all([
      p.encuestaChat.count({ where: { idMensaje: h.idMensaje } }),
      p.mensajeChat.count({ where: { idMensajePadre: h.idMensaje } }),
      vivosDependen(h.idMensaje),
    ]);
    if (encuesta + nietos + citas > 0) return null;
  }
  return hijos.map((h) => h.idMensaje);
}

/**
 * DEMO-11: limpia los «Mensaje eliminado» de Valeria en el #general del Hackathon y deja 5 a 8 mensajes vivos.
 * - Borra definitivamente (en una transaccion por mensaje) los que no tienen dependencias vivas; las respuestas de hilo muertas se van con el padre.
 * - Los que si las tienen se restauran con texto normal, de menor a mayor id, mientras el canal no pase de 8 vivos; el resto queda intacto (nunca se altera un mensaje vivo).
 * - Si quedan menos de 5 vivos, agrega mensajes normales con textos que no existan aun en el canal.
 */
async function limpiarMensajesEliminados(idProyecto: number, valeria: number) {
  stats.limpieza_mensajes_eliminados ??= { creado: 0, actualizado: 0 };
  const general = await prisma.conversacion.findFirst({ where: { idProyecto, esCanal: true, nombreCanal: 'general' } });
  if (!general) return;
  const idConversacion = general.idConversacion;
  const candidatos = await prisma.mensajeChat.findMany({
    where: { idConversacion, idRemitente: valeria, eliminadoEn: { not: null } },
    select: { idMensaje: true },
    orderBy: { idMensaje: 'desc' },
  });
  // De mayor a menor id: las respuestas se procesan antes que su padre y los ya borrados se omiten.
  const restaurables: number[] = [];
  for (const { idMensaje } of candidatos) {
    const borrado = await enTransaccion(async (p) => {
      const actual = await p.mensajeChat.findUnique({ where: { idMensaje }, select: { eliminadoEn: true } });
      if (!actual || actual.eliminadoEn === null) return 'omitido' as const;
      const hijos = await hijosBorrables(p, idMensaje);
      if (!hijos) return 'restaurable' as const;
      const ids = [idMensaje, ...hijos];
      await p.adjuntoMensajeChat.deleteMany({ where: { idMensaje: { in: ids } } });
      await p.recordatorioMensaje.deleteMany({ where: { idMensaje: { in: ids } } });
      await p.mensajeChat.deleteMany({ where: { idMensaje: { in: hijos } } });
      await p.mensajeChat.deleteMany({ where: { idMensaje } });
      return 'borrado' as const;
    });
    if (borrado === 'restaurable') restaurables.push(idMensaje);
    if (borrado === 'borrado') contar('limpieza_mensajes_eliminados', 'actualizado');
  }

  const textoLibre = async () => {
    const usados = new Set((await prisma.mensajeChat.findMany({ where: { idConversacion, contenido: { in: TEXTOS_LIMPIEZA } }, select: { contenido: true } })).map((x) => x.contenido));
    const libre = TEXTOS_LIMPIEZA.find((t) => !usados.has(t));
    return libre ?? `${TEXTOS_LIMPIEZA[0]} (${await prisma.mensajeChat.count({ where: { idConversacion } })})`;
  };
  const vivos = () => prisma.mensajeChat.count({ where: { idConversacion, eliminadoEn: null } });
  let pendientes = 0;
  for (const idMensaje of restaurables.sort((a, b) => a - b)) {
    if ((await vivos()) >= MAX_VIVOS_CANAL) {
      pendientes++;
      continue;
    }
    await prisma.mensajeChat.update({ where: { idMensaje }, data: { contenido: await textoLibre(), eliminadoEn: null, editadoEn: null } });
    contar('limpieza_mensajes_eliminados', 'actualizado');
  }
  if (pendientes > 0) console.log(`limpieza_mensajes_pendientes: ${pendientes} (restaurarlos pasaria de ${MAX_VIVOS_CANAL} mensajes vivos; se dejan sin tocar)`);

  for (let n = await vivos(); n < MIN_VIVOS_CANAL; n++) {
    const contenido = await textoLibre();
    await asegurar(
      'limpieza_mensajes_relleno',
      () => prisma.mensajeChat.findFirst({ where: { idConversacion, idRemitente: valeria, contenido } }),
      () => prisma.mensajeChat.create({ data: { idConversacion, idRemitente: valeria, contenido, enviadoEn: new Date(Date.now() - (20 + n) * 3_600_000) } }),
    );
  }
}

interface PostulacionDef {
  idUsuario: number;
  justificacion: string;
  estado: 'PENDIENTE' | 'RECHAZADA';
  respuestas: string[];
  /** Pasos de la linea de tiempo (MEJ-100), con su antiguedad en horas. */
  pasos: ['ENVIADA' | 'VISTA' | 'EN_REVISION' | 'RECHAZADA', number][];
  rechazo?: { motivo: 'HORARIO'; comentario: string };
}

/** Rol con preguntas propias del lider (MEJ-97) y una postulacion con linea de tiempo (MEJ-100) y/o rechazo con motivo (MEJ-99). */
async function sembrarRolConPostulacion(idProyecto: number, resolutor: number, nombreRol: string, descripcion: string, preguntas: [string, 'CORTA' | 'LARGA', boolean][], p: PostulacionDef) {
  const rol = await asegurar(
    'roles_proyecto',
    () => prisma.rolProyecto.findFirst({ where: { idProyecto, nombreRol } }),
    () => prisma.rolProyecto.create({ data: { idProyecto, nombreRol, descripcionRolProyecto: descripcion, cupos: 1 } }),
  );
  const filas = [];
  for (const [orden, [enunciado, tipo, obligatoria]] of preguntas.entries()) {
    filas.push(
      await asegurar(
        'preguntas_rol',
        () => prisma.preguntaRol.findFirst({ where: { idRolProyecto: rol.idRolProyecto, enunciado } }),
        () => prisma.preguntaRol.create({ data: { idRolProyecto: rol.idRolProyecto, enunciado, tipo, obligatoria, orden } }),
      ),
    );
  }
  const rechazada = p.estado === 'RECHAZADA';
  const postulacion = await asegurar(
    'postulaciones_release9',
    () => prisma.postulacion.findFirst({ where: { idUsuarioPostulante: p.idUsuario, idRolProyecto: rol.idRolProyecto } }),
    () =>
      prisma.postulacion.create({
        data: {
          idUsuarioPostulante: p.idUsuario, idRolProyecto: rol.idRolProyecto, justificacion: p.justificacion, estadoPostulacion: p.estado,
          ...(rechazada && { resueltaPor: resolutor, fechaResolucion: new Date(), motivoRechazo: p.rechazo!.motivo, comentarioResolucion: p.rechazo!.comentario }),
        },
      }),
  );
  for (const [orden, f] of filas.entries()) {
    await asegurar(
      'respuestas_postulacion',
      () => prisma.respuestaPostulacion.findFirst({ where: { idPostulacion: postulacion.idPostulacion, idPregunta: f.idPregunta } }),
      () => prisma.respuestaPostulacion.create({ data: { idPostulacion: postulacion.idPostulacion, idPregunta: f.idPregunta, enunciado: f.enunciado, tipo: f.tipo, respuesta: p.respuestas[orden], orden } }),
    );
  }
  for (const [tipo, horas] of p.pasos) {
    await asegurar(
      'eventos_postulacion',
      () => prisma.eventoPostulacion.findUnique({ where: { idPostulacion_tipo: { idPostulacion: postulacion.idPostulacion, tipo } } }),
      () => prisma.eventoPostulacion.create({ data: { idPostulacion: postulacion.idPostulacion, tipo, fecha: new Date(Date.now() - horas * 3_600_000) } }),
    );
  }
}

/** Mejoras de la entrega 9: tarea con subtareas/enlaces/responsables, objetivo de sprint, hilo de chat, portafolio y disponibilidad. */
async function sembrarEntrega9(est: number[], tutorias: number, hackathon: number, presidente: number, habilidades: { idHabilidad: number }[]) {
  const [valeria, , daniela] = est;
  const [paula, marco, lucia] = [est[4], est[5], est[6]];

  // MEJ-97 / MEJ-100: rol con preguntas y postulacion en curso; MEJ-99: otra rechazada con motivo.
  await sembrarRolConPostulacion(
    tutorias, paula, 'Diseñador/a UX', 'Diseño de la experiencia de la app de tutorías.',
    [['¿Qué herramienta de diseño usas con más frecuencia?', 'CORTA', true], ['Cuéntanos de un proyecto de diseño en el que hayas participado.', 'LARGA', false]],
    {
      idUsuario: est[12], justificacion: 'Me gustaría aportar el diseño de la experiencia de las tutorías.', estado: 'PENDIENTE',
      respuestas: ['Figma', 'Rediseñé el flujo de inscripción de un curso del semestre pasado junto con dos compañeros.'],
      pasos: [['ENVIADA', 50], ['VISTA', 30], ['EN_REVISION', 6]],
    },
  );
  await sembrarRolConPostulacion(
    hackathon, presidente, 'Logística del evento', 'Apoyo en la logística presencial del hackathon.',
    [['¿Qué días puedes asistir al evento?', 'CORTA', true]],
    {
      idUsuario: est[14], justificacion: 'Quiero apoyar con la logística del hackathon.', estado: 'RECHAZADA', respuestas: ['Solo los sábados'],
      pasos: [['ENVIADA', 120], ['VISTA', 100], ['RECHAZADA', 90]],
      rechazo: { motivo: 'HORARIO', comentario: 'El evento es entre semana y tu disponibilidad no coincide. Te invitamos a postularte a la próxima edición.' },
    },
  );

  // MEJ-117: objetivo del sprint activo de «Tutorias».
  const objetivo = 'Entregar un prototipo navegable de la búsqueda de tutores listo para validar con estudiantes.';
  const sprint = await prisma.sprint.findFirstOrThrow({ where: { idProyecto: tutorias, estado: 'ACTIVO' } });
  await asegurar(
    'sprints_objetivo',
    async () => (sprint.objetivo === objetivo ? sprint : null),
    async () => prisma.sprint.update({ where: { idSprint: sprint.idSprint }, data: { objetivo } }),
  );

  // MEJ-106 / MEJ-107 / MEJ-109: tarea con dos subtareas, dos enlaces y dos responsables (principal + uno adicional).
  const rolDev = await prisma.rolProyecto.findFirstOrThrow({ where: { idProyecto: tutorias, nombreRol: 'Desarrollador/a' } });
  const crearTarea = (titulo: string, estado: EstadoTarea, orden: number, idTareaPadre: number | null) =>
    asegurar(
      'tareas_release9',
      () => prisma.tarea.findFirst({ where: { idProyecto: tutorias, tituloTarea: titulo } }),
      () =>
        prisma.tarea.create({
          data: { idProyecto: tutorias, idSprint: sprint.idSprint, idRolProyecto: rolDev.idRolProyecto, tituloTarea: titulo, estadoTarea: estado, prioridad: 'ALTA', orden, creadaPor: paula, fechaLimite: enDias(6), idTareaPadre },
        }),
    );
  const padre = await crearTarea('Tutorías: diseñar la pantalla de búsqueda', 'EN_PROGRESO', 20, null);
  await crearTarea('Tutorías: maquetar los filtros por curso', 'HECHO', 21, padre.idTarea);
  await crearTarea('Tutorías: conectar la búsqueda con la API', 'POR_HACER', 22, padre.idTarea);
  const participacion = await prisma.participacionProyecto.findFirst({ where: { idUsuario: marco, idRolProyecto: rolDev.idRolProyecto } });
  await asegurar(
    'asignaciones_release9',
    () => prisma.asignacionTarea.findFirst({ where: { idTarea: padre.idTarea, idUsuario: marco, desasignadaEn: null } }),
    () => prisma.asignacionTarea.create({ data: { idTarea: padre.idTarea, idUsuario: marco, idParticipacion: participacion?.idParticipacion, asignadoPor: paula } }),
  );
  await asegurar(
    'tarea_responsables',
    () => prisma.tareaResponsable.findUnique({ where: { idTarea_idUsuario: { idTarea: padre.idTarea, idUsuario: lucia } } }),
    () => prisma.tareaResponsable.create({ data: { idTarea: padre.idTarea, idUsuario: lucia } }),
  );
  for (const e of [
    { url: 'https://www.figma.com/file/demo-busqueda-de-tutores', titulo: 'Prototipo de la búsqueda de tutores', sitio: 'figma.com', tipo: 'FIGMA' },
    { url: 'https://github.com/uvg-demo/app-tutorias/issues/12', titulo: 'Issue 12: filtros por curso', sitio: 'github.com', tipo: 'GITHUB' },
  ]) {
    await asegurar(
      'tarea_enlaces',
      () => prisma.tareaEnlace.findUnique({ where: { idTarea_url: { idTarea: padre.idTarea, url: e.url } } }),
      () => prisma.tareaEnlace.create({ data: { idTarea: padre.idTarea, ...e, creadoPor: paula } }),
    );
  }

  // MEJ-131: hilo de respuestas bajo un mensaje del chat del Hackathon (canal creado por sembrarChatProyecto).
  const general = await prisma.conversacion.findFirstOrThrow({ where: { idProyecto: hackathon, esCanal: true, nombreCanal: 'general' } });
  const raiz = await prisma.mensajeChat.findFirstOrThrow({ where: { idConversacion: general.idConversacion, idRemitente: valeria, contenido: { startsWith: 'Ya tengo la lista de patrocinadores' } } });
  for (const [de, texto, horas] of [
    [presidente, 'Excelente, Valeria. ¿Ya los contactaste o lo hago yo?', 80],
    [daniela, 'Yo puedo ayudarte a escribirles esta semana.', 74],
  ] as const) {
    await asegurar(
      'chat_hilo_respuestas',
      () => prisma.mensajeChat.findFirst({ where: { idConversacion: general.idConversacion, idMensajePadre: raiz.idMensaje, idRemitente: de, contenido: texto } }),
      () => prisma.mensajeChat.create({ data: { idConversacion: general.idConversacion, idRemitente: de, contenido: texto, idMensajePadre: raiz.idMensaje, enviadoEn: new Date(Date.now() - horas * 3_600_000) } }),
    );
  }

  // MEJ-146: portafolio publico activo con token opaco (como PortafolioService: 32 bytes en base64url). Un token existente nunca se regenera.
  for (const h of habilidades) {
    await asegurar(
      'habilidades_usuario',
      () => prisma.usuarioHabilidad.findUnique({ where: { idUsuario_idHabilidad: { idUsuario: paula, idHabilidad: h.idHabilidad } } }),
      () => prisma.usuarioHabilidad.create({ data: { idUsuario: paula, idHabilidad: h.idHabilidad, nivelHabilidad: 'INTERMEDIO' } }),
    );
  }
  await asegurar(
    'portafolio_publico',
    () => prisma.portafolioPublico.findUnique({ where: { idUsuario: paula } }),
    () => prisma.portafolioPublico.create({ data: { idUsuario: paula, token: randomBytes(32).toString('base64url'), activo: true } }),
    (f) => (f.activo ? undefined : prisma.portafolioPublico.update({ where: { idUsuario: paula }, data: { activo: true } })),
  );

  // MEJ-148: disponibilidad semanal (0 = lunes), bloques de 1 hora.
  for (const [diaSemana, horas] of [[0, [16, 17]], [2, [16, 17]], [5, [9, 10]]] as const) {
    for (const hora of horas) {
      await asegurar(
        'disponibilidad_semanal',
        () => prisma.disponibilidadSemanal.findUnique({ where: { idUsuario_diaSemana_hora: { idUsuario: paula, diaSemana, hora } } }),
        () => prisma.disponibilidadSemanal.create({ data: { idUsuario: paula, diaSemana, hora } }),
      );
    }
  }
}

// ─── Principal ──────────────────────────────────────────────────────────────

const CORREO_COORDINADOR = 'demo.coordinador@uvg.edu.gt';

/** Coordinador academico de Computacion con alcance en esa carrera, un proyecto en revision y un cierre pendiente de lideres de la carrera. */
async function sembrarCoordinador(passwordCoordinador: string, idCarrera: number, lideres: [number, number]) {
  const rol = await prisma.rolAcceso.upsert({
    where: { nombrePerfil: 'coordinador_academico' },
    update: {},
    create: { nombrePerfil: 'coordinador_academico', descripcion: 'Coordinador académico con alcance por carrera' },
  });
  const coordinador = await asegurar(
    'coordinador_usuario',
    () => prisma.usuario.findUnique({ where: { correo: CORREO_COORDINADOR } }),
    () => prisma.usuario.create({ data: { correo: CORREO_COORDINADOR, contrasena: hashSync(passwordCoordinador, 10), nombre: 'Sofía', apellido: 'Arévalo', estado: 'ACTIVO' } }),
    (u) => (u.estado !== 'ACTIVO' ? prisma.usuario.update({ where: { idUsuario: u.idUsuario }, data: { estado: 'ACTIVO' } }) : undefined),
  );
  await asegurar(
    'coordinador_rol',
    () => prisma.usuarioRolAcceso.findFirst({ where: { idUsuario: coordinador.idUsuario, idRolAcceso: rol.idRolAcceso } }),
    () => prisma.usuarioRolAcceso.create({ data: { idUsuario: coordinador.idUsuario, idRolAcceso: rol.idRolAcceso } }),
  );
  await asegurar(
    'coordinador_alcance',
    () => prisma.alcanceCoordinador.findUnique({ where: { idUsuario_idCarrera: { idUsuario: coordinador.idUsuario, idCarrera } } }),
    () => prisma.alcanceCoordinador.create({ data: { idUsuario: coordinador.idUsuario, idCarrera } }),
  );

  const enRevision = await asegurar(
    'coordinador_proyectos',
    () => prisma.proyecto.findFirst({ where: { tituloProyecto: 'Demo - Plataforma de reciclaje del campus' } }),
    () =>
      prisma.proyecto.create({
        data: { tituloProyecto: 'Demo - Plataforma de reciclaje del campus', descripcionProyecto: 'Proyecto de demo enviado a revisión de publicación.', tipoProyecto: 'ACADEMICO_HORAS_BECA', estadoProyecto: 'EN_REVISION', creadoPor: lideres[0] },
      }),
    (p) => (p.estadoProyecto !== 'EN_REVISION' ? prisma.proyecto.update({ where: { idProyecto: p.idProyecto }, data: { estadoProyecto: 'EN_REVISION' } }) : undefined),
  );
  await asegurar(
    'coordinador_revisiones',
    () => prisma.revisionProyecto.findFirst({ where: { idProyecto: enRevision.idProyecto, numeroEnvio: 1 } }),
    () => prisma.revisionProyecto.create({ data: { idProyecto: enRevision.idProyecto, numeroEnvio: 1 } }),
    (r) => (r.estadoRevision !== 'PENDIENTE' ? prisma.revisionProyecto.update({ where: { idRevisionProyecto: r.idRevisionProyecto }, data: { estadoRevision: 'PENDIENTE', revisadaEn: null, idRevisor: null } }) : undefined),
  );

  const enCierre = await asegurar(
    'coordinador_proyectos',
    () => prisma.proyecto.findFirst({ where: { tituloProyecto: 'Demo - Laboratorio de robótica educativa' } }),
    () =>
      prisma.proyecto.create({
        data: { tituloProyecto: 'Demo - Laboratorio de robótica educativa', descripcionProyecto: 'Proyecto de demo con solicitud de cierre pendiente.', tipoProyecto: 'ACADEMICO_HORAS_BECA', estadoProyecto: 'EN_SOLICITUD_CIERRE', creadoPor: lideres[1], fechaPublicacion: enDias(-60), fechaInicio: enDias(-55) },
      }),
    (p) => (p.estadoProyecto !== 'EN_SOLICITUD_CIERRE' ? prisma.proyecto.update({ where: { idProyecto: p.idProyecto }, data: { estadoProyecto: 'EN_SOLICITUD_CIERRE' } }) : undefined),
  );
  await asegurar(
    'coordinador_cierres',
    () => prisma.revisionCierreProyecto.findUnique({ where: { idProyecto_numeroRevision: { idProyecto: enCierre.idProyecto, numeroRevision: 1 } } }),
    () =>
      prisma.revisionCierreProyecto.create({
        data: {
          idProyecto: enCierre.idProyecto, numeroRevision: 1, estadoRevision: 'ENVIADA', idSolicitante: lideres[1], enviadaEn: new Date(),
          fingerprintEntrega: createHash('sha256').update(`demo-cierre-${enCierre.idProyecto}`).digest('hex'),
        },
      }),
    (r) => (r.estadoRevision !== 'ENVIADA' ? prisma.revisionCierreProyecto.update({ where: { idRevisionCierre: r.idRevisionCierre }, data: { estadoRevision: 'ENVIADA', idRevisor: null, resueltaEn: null, comentarioRevisor: null } }) : undefined),
  );
}

async function main() {
  const password = process.env.DEMO_PASSWORD;
  if (!password) throw new Error('Falta la variable de entorno DEMO_PASSWORD (contraseña de las cuentas demo nuevas).');
  const passwordCoordinador = process.env.DEMO_COORDINADOR_PASSWORD;
  if (!passwordCoordinador) throw new Error('Falta la variable de entorno DEMO_COORDINADOR_PASSWORD (contraseña de la cuenta demo del coordinador).');

  const semestre = semestreDe(new Date());
  const hoy = todayInGuatemala();
  const plan = planDeHoras(semestre, hoy);
  verificarRiesgo(
    [
      ...plan.map((p) => ({ metaBeca: p.metaBeca, avanceBeca: p.avanceBeca, metaExtension: p.metaExtension, avanceExtension: p.avanceExtension })),
      { metaBeca: REGISTRO_PRESIDENTE.metaBeca, avanceBeca: REGISTRO_PRESIDENTE.becaDeclarada, metaExtension: REGISTRO_PRESIDENTE.metaExtension, avanceExtension: REGISTRO_PRESIDENTE.extensionDeclarada },
    ],
    semestre,
    hoy,
    'plan',
  );

  const presidente = await prisma.usuario.findUnique({ where: { correo: CORREO_PRESIDENTE } });
  if (!presidente) throw new Error(`No existe ${CORREO_PRESIDENTE}: debe existir antes de correr este script (corre seed.ts o crea la cuenta).`);

  const carrera = await prisma.carrera.findFirst({ where: { nombreCarrera: { contains: 'Computaci', mode: 'insensitive' } }, orderBy: { idCarrera: 'asc' } });
  if (!carrera) throw new Error('No existe la carrera de Computacion.');

  const rolEstudiante = await prisma.rolAcceso.upsert({
    where: { nombrePerfil: 'estudiante' },
    update: {},
    create: { nombrePerfil: 'estudiante', descripcion: 'Estudiante registrado en la plataforma' },
  });

  // La contrasena solo se hashea para cuentas nuevas (mismo bcryptjs y costo 10 que el registro real).
  const hash = hashSync(password, 10);
  const est: number[] = [];
  for (const [i, [nombre, apellido]] of NOMBRES.entries()) {
    const usuario = await asegurar(
      'usuarios',
      () => prisma.usuario.findUnique({ where: { correo: correoDemo(i) } }),
      () => prisma.usuario.create({ data: { correo: correoDemo(i), contrasena: hash, nombre, apellido, estado: 'ACTIVO' } }),
      (u) => (u.estado !== 'ACTIVO' ? prisma.usuario.update({ where: { idUsuario: u.idUsuario }, data: { estado: 'ACTIVO' } }) : undefined),
    );
    est.push(usuario.idUsuario);
    await asegurar(
      'perfiles',
      () => prisma.perfilEstudiante.findUnique({ where: { idUsuario: usuario.idUsuario } }),
      () => prisma.perfilEstudiante.create({ data: { idUsuario: usuario.idUsuario, carne: carneDemo(i), idCarrera: carrera.idCarrera, semestre: 3 + (i % 6) } }),
      (p) => (p.idCarrera !== carrera.idCarrera ? prisma.perfilEstudiante.update({ where: { idUsuario: p.idUsuario }, data: { idCarrera: carrera.idCarrera } }) : undefined),
    );
    await asegurar(
      'roles_acceso',
      () => prisma.usuarioRolAcceso.findFirst({ where: { idUsuario: usuario.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso } }),
      () => prisma.usuarioRolAcceso.create({ data: { idUsuario: usuario.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso } }),
    );
    const { metaBeca, becaDeclarada, metaExtension, extensionDeclarada } = plan[i];
    await asegurar(
      'registros_horas_semestre',
      () => prisma.registroHorasSemestre.findUnique({ where: { idUsuario_anio_periodo: { idUsuario: usuario.idUsuario, anio: semestre.anio, periodo: semestre.periodo } } }),
      () => prisma.registroHorasSemestre.create({ data: { idUsuario: usuario.idUsuario, anio: semestre.anio, periodo: semestre.periodo, metaBeca, becaDeclarada, metaExtension, extensionDeclarada } }),
      (r) =>
        r.metaBeca !== metaBeca || r.becaDeclarada !== becaDeclarada || r.metaExtension !== metaExtension || r.extensionDeclarada !== extensionDeclarada
          ? prisma.registroHorasSemestre.update({ where: { idRegistro: r.idRegistro }, data: { metaBeca, becaDeclarada, metaExtension, extensionDeclarada } })
          : undefined,
    );
  }
  // Historial: el semestre anterior ya cerrado, con metas cumplidas a distintos ritmos.
  const anterior = semestreAnterior(semestre);
  for (const [i, idUsuario] of est.slice(0, CON_SEMESTRE_ANTERIOR).entries()) {
    const metaBeca = METAS_BECA[i % 3];
    const metaExtension = METAS_EXTENSION[i % 3];
    const becaDeclarada = Math.round((metaBeca * (60 + 10 * (i % 4))) / 100);
    const extensionDeclarada = Math.round((metaExtension * (50 + 10 * (i % 5))) / 100);
    await asegurar(
      'registros_semestre_anterior',
      () => prisma.registroHorasSemestre.findUnique({ where: { idUsuario_anio_periodo: { idUsuario, anio: anterior.anio, periodo: anterior.periodo } } }),
      () => prisma.registroHorasSemestre.create({ data: { idUsuario, anio: anterior.anio, periodo: anterior.periodo, metaBeca, becaDeclarada, metaExtension, extensionDeclarada } }),
      (r) =>
        r.metaBeca !== metaBeca || r.becaDeclarada !== becaDeclarada || r.metaExtension !== metaExtension || r.extensionDeclarada !== extensionDeclarada
          ? prisma.registroHorasSemestre.update({ where: { idRegistro: r.idRegistro }, data: { metaBeca, becaDeclarada, metaExtension, extensionDeclarada } })
          : undefined,
    );
  }
  // Solo el registro del semestre de Carlos; su cuenta y perfil reales no se tocan.
  await asegurar(
    'registro_horas_presidente',
    () => prisma.registroHorasSemestre.findUnique({ where: { idUsuario_anio_periodo: { idUsuario: presidente.idUsuario, anio: semestre.anio, periodo: semestre.periodo } } }),
    () => prisma.registroHorasSemestre.create({ data: { idUsuario: presidente.idUsuario, anio: semestre.anio, periodo: semestre.periodo, ...REGISTRO_PRESIDENTE } }),
    (r) =>
      (Object.keys(REGISTRO_PRESIDENTE) as (keyof typeof REGISTRO_PRESIDENTE)[]).some((k) => r[k] !== REGISTRO_PRESIDENTE[k])
        ? prisma.registroHorasSemestre.update({ where: { idRegistro: r.idRegistro }, data: REGISTRO_PRESIDENTE })
        : undefined,
  );
  // est[0] = VP, est[1] = vocal; el resto son estudiantes y miembros de las orgs.
  const [vp, vocal] = est;

  // ─── Asociacion y junta ───────────────────────────────────────────────────
  const asociacion = await asegurar(
    'asociaciones',
    () => prisma.asociacion.findUnique({ where: { nombre: NOMBRE_ASOCIACION } }),
    () => prisma.asociacion.create({ data: { nombre: NOMBRE_ASOCIACION, descripcion: 'Asociación oficial de la carrera de Ingeniería en Ciencias de la Computación y TI.' } }),
    (a) => (a.archivada ? prisma.asociacion.update({ where: { idAsociacion: a.idAsociacion }, data: { archivada: false } }) : undefined),
  );
  await asegurar(
    'asociacion_carrera',
    () => prisma.asociacionCarrera.findUnique({ where: { idAsociacion_idCarrera: { idAsociacion: asociacion.idAsociacion, idCarrera: carrera.idCarrera } } }),
    () => prisma.asociacionCarrera.create({ data: { idAsociacion: asociacion.idAsociacion, idCarrera: carrera.idCarrera } }),
  );
  const junta = [
    { cargo: 'PRESIDENTE', nivelPermiso: 'ADMINISTRADOR', idUsuario: presidente.idUsuario },
    { cargo: 'VICEPRESIDENTE', nivelPermiso: 'EDITOR', idUsuario: vp },
    { cargo: 'VOCAL', nivelPermiso: 'LECTURA', idUsuario: vocal },
  ] as const;
  for (const j of junta) {
    await asegurar(
      'junta_asociacion',
      () => prisma.juntaAsociacion.findUnique({ where: { idAsociacion_cargo: { idAsociacion: asociacion.idAsociacion, cargo: j.cargo } } }),
      () => prisma.juntaAsociacion.create({ data: { idAsociacion: asociacion.idAsociacion, ...j, asignadoPor: presidente.idUsuario } }),
      (e) =>
        e.idUsuario !== j.idUsuario || e.nivelPermiso !== j.nivelPermiso
          ? prisma.juntaAsociacion.update({ where: { idJuntaAsociacion: e.idJuntaAsociacion }, data: { idUsuario: j.idUsuario, nivelPermiso: j.nivelPermiso } })
          : undefined,
    );
  }

  // ─── Organizaciones, invitacion y chat #general ───────────────────────────
  const orgsDef: { nombre: string; descripcion: string; visibilidad: 'PUBLICA' | 'PRIVADA'; propietario: number; miembros: [number, RolOrganizacion][]; mensajes: [number, string][] }[] = [
    {
      nombre: 'Laboratorio de Innovación Abierta (Demo)',
      descripcion: 'Grupo estudiantil de demo que construye prototipos abiertos para la comunidad UVG.',
      visibilidad: 'PUBLICA',
      propietario: presidente.idUsuario,
      miembros: [[est[0], 'ADMINISTRADOR'], [est[1], 'EDITOR'], [est[3], 'EDITOR'], [est[4], 'LECTURA'], [est[5], 'MIEMBRO'], [est[6], 'LECTURA']],
      mensajes: [[presidente.idUsuario, 'Bienvenidos al laboratorio. Aquí coordinamos todo.'], [est[0], 'Subí el plan del trimestre al tablero.'], [est[4], 'Genial, lo reviso hoy.']],
    },
    {
      nombre: 'Comunidad de Ciencia de Datos (Demo)',
      descripcion: 'Comunidad privada de demo para proyectos de análisis de datos.',
      visibilidad: 'PRIVADA',
      propietario: est[2],
      // demo.cs05 (est[4]) tambien esta en el Laboratorio: una sola cuenta muestra ambas organizaciones.
      miembros: [[est[7], 'ADMINISTRADOR'], [est[8], 'EDITOR'], [est[9], 'EDITOR'], [est[10], 'LECTURA'], [est[11], 'MIEMBRO'], [est[4], 'LECTURA']],
      mensajes: [[est[2], 'Hola equipo, este es el canal general.'], [est[7], 'Compartan sus datasets favoritos.'], [est[9], 'Tengo uno de datos abiertos de Guatemala.']],
    },
  ];
  const orgs: number[] = [];
  for (const [n, o] of orgsDef.entries()) {
    const org = await asegurar(
      'organizaciones',
      () => prisma.organizacion.findFirst({ where: { nombreOrganizacion: o.nombre } }),
      () => prisma.organizacion.create({ data: { nombreOrganizacion: o.nombre, tipoOrganizacion: 'GRUPO_ESTUDIANTIL', descripcionOrganizacion: o.descripcion, visibilidad: o.visibilidad, creadaPor: o.propietario } }),
      (e) =>
        e.visibilidad !== o.visibilidad || e.estadoOrganizacion !== 'ACTIVA'
          ? prisma.organizacion.update({ where: { idOrganizacion: e.idOrganizacion }, data: { visibilidad: o.visibilidad, estadoOrganizacion: 'ACTIVA' } })
          : undefined,
    );
    orgs.push(org.idOrganizacion);
    const miembros: [number, RolOrganizacion][] = [[o.propietario, 'PROPIETARIO'], ...o.miembros];
    for (const [idUsuario, rolOrganizacion] of miembros) {
      await asegurar(
        'miembros_organizacion',
        () => prisma.usuarioOrganizacion.findUnique({ where: { idUsuario_idOrganizacion: { idUsuario, idOrganizacion: org.idOrganizacion } } }),
        () => prisma.usuarioOrganizacion.create({ data: { idUsuario, idOrganizacion: org.idOrganizacion, rolOrganizacion } }),
        (m) =>
          m.rolOrganizacion !== rolOrganizacion || m.estadoMembresia !== 'ACTIVA'
            ? prisma.usuarioOrganizacion.update({ where: { idUsuarioOrganizacion: m.idUsuarioOrganizacion }, data: { rolOrganizacion, estadoMembresia: 'ACTIVA' } })
            : undefined,
      );
    }

    // Mismo canal que OrganizationChatService.sincronizar.
    const general = await asegurar(
      'chat_general',
      () => prisma.conversacion.findFirst({ where: { idOrganizacion: org.idOrganizacion, esCanal: true, nombreCanal: 'general' } }),
      () => prisma.conversacion.create({ data: { idOrganizacion: org.idOrganizacion, tipo: 'GRUPAL', nombre: 'general', nombreCanal: 'general', esCanal: true, creadaPor: o.propietario } }),
    );
    for (const [idUsuario] of miembros) {
      await asegurar(
        'chat_participantes',
        () => prisma.conversacionParticipante.findUnique({ where: { idConversacion_idUsuario: { idConversacion: general.idConversacion, idUsuario } } }),
        () => prisma.conversacionParticipante.create({ data: { idConversacion: general.idConversacion, idUsuario } }),
      );
    }
    for (const [k, [idRemitente, contenido]] of o.mensajes.entries()) {
      await asegurar(
        'chat_mensajes',
        () => prisma.mensajeChat.findFirst({ where: { idConversacion: general.idConversacion, idRemitente, contenido } }),
        () => prisma.mensajeChat.create({ data: { idConversacion: general.idConversacion, idRemitente, contenido, enviadoEn: new Date(Date.now() - (o.mensajes.length - k) * 3_600_000) } }),
      );
    }
    if (n === 0) {
      await asegurar(
        'invitaciones_organizacion',
        () => prisma.invitacionOrganizacion.findFirst({ where: { idOrganizacion: org.idOrganizacion, idInvitado: est[12], estado: 'PENDIENTE' } }),
        () => prisma.invitacionOrganizacion.create({ data: { idOrganizacion: org.idOrganizacion, idInvitado: est[12], idInvitadoPor: presidente.idUsuario, rolOrganizacion: 'EDITOR', venceEn: enDias(14) } }),
      );
    }
  }

  // ─── Proyectos: personal, de organizacion y de asociacion ─────────────────
  const tablero = (prefijo: string, a: number, b: number, c: number, d: number): TareaDef[] => [
    { titulo: `${prefijo}: definir alcance`, estado: 'HECHO', prioridad: 'ALTA', asignadoA: a, horas: 6 },
    { titulo: `${prefijo}: construir prototipo`, estado: 'EN_PROGRESO', prioridad: 'ALTA', asignadoA: b, horas: 4 },
    { titulo: `${prefijo}: revisión de pares`, estado: 'EN_REVISION', prioridad: 'MEDIA', asignadoA: c, horas: 2 },
    { titulo: `${prefijo}: documentación`, estado: 'POR_HACER', prioridad: 'BAJA', asignadoA: d },
  ];
  const cerradoPor = (a: number, b: number): TareaDef[] => [
    { titulo: 'Semana de la Computación: logística', estado: 'HECHO', prioridad: 'ALTA', asignadoA: a, horas: 12 },
    { titulo: 'Semana de la Computación: charlas', estado: 'HECHO', prioridad: 'MEDIA', asignadoA: b, horas: 8 },
  ];
  const proyectos: ProyectoDef[] = [
    {
      titulo: 'Demo - App de tutorías entre pares', descripcion: 'Proyecto personal de demo en progreso con sprint activo.', tipo: 'ACADEMICO_HORAS_BECA', estado: 'EN_PROGRESO',
      creadoPor: est[4], participantes: [est[5], est[6], est[13]], sprint: 'activo', tareas: tablero('Tutorías', est[5], est[6], est[13], est[5]),
    },
    {
      titulo: 'Demo - Estación meteorológica comunitaria', descripcion: 'Proyecto de organización de demo ya publicado.', tipo: 'EXTRACURRICULAR_EXTENSION', estado: 'PUBLICADO',
      creadoPor: est[1], idOrganizacion: orgs[0], participantes: [], sprint: null, tareas: [],
    },
    {
      titulo: 'Demo - Tablero de datos abiertos de Guatemala', descripcion: 'Proyecto de organización de demo en progreso con sprint activo.', tipo: 'EXTRACURRICULAR_EXTENSION', estado: 'EN_PROGRESO',
      creadoPor: est[8], idOrganizacion: orgs[1], participantes: [est[7], est[9]], sprint: 'activo', tareas: tablero('Datos abiertos', est[7], est[9], est[7], est[9]),
    },
    {
      titulo: 'Demo - Hackathon de Computación', descripcion: 'Proyecto de la asociación en progreso con sprint activo.', tipo: 'ACADEMICO_HORAS_BECA', estado: 'EN_PROGRESO',
      creadoPor: presidente.idUsuario, idAsociacion: asociacion.idAsociacion, participantes: [presidente.idUsuario, vp, est[2], est[3]], sprint: 'activo',
      tareas: [
        ...tablero('Hackathon', vp, est[2], est[3], vp),
        // Tarea de Carlos: «Mis tareas en este proyecto», checklist y registro de horas.
        {
          titulo: 'Hackathon: coordinar la logística del evento', estado: 'EN_PROGRESO', prioridad: 'ALTA', asignadoA: presidente.idUsuario,
          checklist: [['Reservar el auditorio', true], ['Confirmar a los jurados', false], ['Preparar el material de registro', false]],
        },
      ],
    },
    {
      titulo: 'Demo - Semana de la Computación (cerrado)', descripcion: 'Proyecto de la asociación ya cerrado, con horas acreditadas.', tipo: 'ACADEMICO_HORAS_BECA', estado: 'CERRADO',
      creadoPor: presidente.idUsuario, idAsociacion: asociacion.idAsociacion, participantes: [est[4], est[8]], sprint: 'cerrado', tareas: cerradoPor(est[4], est[8]),
      acreditadas: { [est[4]]: ACREDITADAS_BECA[4], [est[8]]: ACREDITADAS_BECA[8] },
    },
  ];
  const armados: Awaited<ReturnType<typeof armarProyecto>>[] = [];
  for (const p of proyectos) armados.push(await armarProyecto(p));

  // ─── Chat #general de los proyectos en progreso (tutorias y hackathon) ────
  const nombre = (i: number) => `${NOMBRES[i][0]} ${NOMBRES[i][1]}`;
  const mencion = (idUsuario: number, etiqueta: string) => `@[${etiqueta}](${idUsuario})`;
  const [paula, marco, lucia, kevin] = [est[4], est[5], est[6], est[13]];
  await sembrarChatProyecto(armados[0].idProyecto, paula, [paula, marco, lucia, kevin], [
    { de: paula, texto: 'Equipo, ya arrancó el sprint 1 de la app de tutorías. Revisen sus tareas en el tablero.', horas: 96 },
    { de: marco, texto: 'Listo, ya subí el prototipo de la pantalla de búsqueda de tutores.', horas: 80 },
    { de: paula, texto: `Excelente ${mencion(marco, nombre(5))}. ${mencion(lucia, nombre(6))}, ¿puedes revisar esa pantalla antes del viernes?`, horas: 70, reacciones: [[kevin, '👍']] },
    { de: lucia, texto: 'Sí, la reviso mañana en la tarde y dejo mis comentarios en la tarea.', horas: 52, cita: 2, reacciones: [[paula, '🙏']] },
    { de: kevin, texto: '¿Quién tiene el borrador de la documentación? Quiero ajustar los diagramas.', horas: 30 },
    { de: marco, texto: 'Está en la carpeta compartida, ya lo marqué con tu nombre.', horas: 26, cita: 4 },
    { de: paula, texto: 'Gracias a todos. Nos vemos en la reunión del lunes.', horas: 5 },
  ]);
  const [valeria, daniela, andres] = [est[0], est[2], est[3]];
  await sembrarChatProyecto(armados[3].idProyecto, presidente.idUsuario, [presidente.idUsuario, valeria, daniela, andres], [
    { de: presidente.idUsuario, texto: 'Bienvenidos al equipo del Hackathon de Computación. Este canal es para coordinar la logística.', horas: 100 },
    { de: valeria, texto: 'Ya tengo la lista de patrocinadores, la subo hoy al tablero.', horas: 84, reacciones: [[presidente.idUsuario, '👍']] },
    { de: presidente.idUsuario, texto: `Perfecto ${mencion(valeria, nombre(0))}. ${mencion(daniela, nombre(2))}, ¿ya tienes confirmados a los jurados?`, horas: 72 },
    { de: daniela, texto: 'Tengo a dos confirmados, me faltan tres. Los cierro esta semana.', horas: 60, cita: 2 },
    { de: andres, texto: 'Puedo encargarme del material de registro si Carlos lo aprueba.', horas: 40 },
    { de: presidente.idUsuario, texto: 'Aprobado, Andrés. Yo sigo con la reserva del auditorio.', horas: 28, cita: 4, reacciones: [[andres, '🙏']] },
  ]);

  // ─── Calendario del Laboratorio: 3 eventos futuros en su proyecto ─────────
  // Solo cuentan los eventos sin invitados (EventsService.findForOrganizationInRange).
  const alHora = (dias: number, hora: number) => {
    const f = enDias(dias);
    f.setHours(hora);
    return f;
  };
  const eventos = [
    { titulo: 'Demo - Reunión de planeación del laboratorio', tipo: 'REUNION', modalidad: 'VIRTUAL', dias: 6, hora: 18, duracion: 1, link: 'https://meet.example.com/demo-laboratorio' },
    { titulo: 'Demo - Taller de prototipado abierto', tipo: 'TALLER', modalidad: 'PRESENCIAL', dias: 18, hora: 14, duracion: 2, lugar: 'Laboratorio de Innovación, UVG' },
    { titulo: 'Demo - Entrega del prototipo de la estación', tipo: 'ENTREGA', modalidad: 'VIRTUAL', dias: 35, hora: 12, duracion: 1 },
  ] as const;
  for (const e of eventos) {
    const fechaInicio = alHora(e.dias, e.hora);
    const fechaFin = alHora(e.dias, e.hora + e.duracion);
    await asegurar(
      'eventos_calendario_organizacion',
      () => prisma.eventoProyecto.findFirst({ where: { idProyecto: armados[1].idProyecto, tituloEvento: e.titulo } }),
      () =>
        prisma.eventoProyecto.create({
          data: {
            idProyecto: armados[1].idProyecto, idCreador: est[1], tituloEvento: e.titulo, descripcionEvento: 'Evento de demo del calendario de la organización.',
            fechaInicio, fechaFin, tipoEvento: e.tipo, modalidad: e.modalidad, linkSesion: 'link' in e ? e.link : null, ubicacionNombre: 'lugar' in e ? e.lugar : null,
          },
        }),
      // Una corrida posterior los mantiene a futuro.
      (v) =>
        v.eliminadoEn !== null || v.fechaInicio.getTime() !== fechaInicio.getTime()
          ? prisma.eventoProyecto.update({ where: { idEvento: v.idEvento }, data: { fechaInicio, fechaFin, eliminadoEn: null } })
          : undefined,
    );
  }

  // ─── Hitos de «Tutorias»: uno atrasado (alerta roja) y uno proximo ────────
  const dia = (n: number) => new Date(`${addDaysToDay(hoy, n)}T00:00:00Z`);
  const hitos = [
    { titulo: 'Demo - Prototipo navegable de tutorías', descripcion: 'Hito atrasado de demo: su fecha límite ya pasó y sigue sin terminar.', estado: 'EN_PROGRESO', dias: -6, orden: 1 },
    { titulo: 'Demo - Lanzamiento piloto con 20 estudiantes', descripcion: 'Hito próximo de demo.', estado: 'PENDIENTE', dias: 10, orden: 2 },
  ] as const;
  for (const h of hitos) {
    await asegurar(
      'hitos',
      () => prisma.hito.findFirst({ where: { idProyecto: armados[0].idProyecto, tituloHito: h.titulo } }),
      () => prisma.hito.create({ data: { idProyecto: armados[0].idProyecto, tituloHito: h.titulo, descripcionHito: h.descripcion, fechaLimite: dia(h.dias), estadoHito: h.estado, orden: h.orden } }),
      // Si alguien lo completo o la fecha quedo vieja, vuelve a su estado de demo.
      (v) =>
        v.estadoHito !== h.estado || v.fechaLimite?.getTime() !== dia(h.dias).getTime()
          ? prisma.hito.update({ where: { idHito: v.idHito }, data: { estadoHito: h.estado, fechaLimite: dia(h.dias), alertaAtrasoEnviadaEn: null } })
          : undefined,
    );
  }

  // ─── Postulaciones pendientes con requisitos de habilidad (MEJ-21) ────────
  // «Tutorías» lo lidera demo.cs05 (est[4]). Cumplimiento: est[10] 2 de 3 (67 %), est[11] 1 de 3 (33 %).
  const habilidad = (nombreHabilidad: string) =>
    asegurar(
      'habilidades',
      () => prisma.habilidad.findFirst({ where: { nombreHabilidad } }),
      () => prisma.habilidad.create({ data: { nombreHabilidad } }),
    );
  const [react, typescript, figma] = [await habilidad('React'), await habilidad('TypeScript'), await habilidad('Figma')];
  const rolFrontend = await asegurar(
    'roles_proyecto',
    () => prisma.rolProyecto.findFirst({ where: { idProyecto: armados[0].idProyecto, nombreRol: 'Desarrollador/a front-end' } }),
    () => prisma.rolProyecto.create({ data: { idProyecto: armados[0].idProyecto, nombreRol: 'Desarrollador/a front-end', descripcionRolProyecto: 'Interfaz de la app de tutorías.', cupos: 2 } }),
  );
  for (const [h, nivelMinimo] of [[react, 'INTERMEDIO'], [typescript, 'BASICO'], [figma, 'BASICO']] as const) {
    await asegurar(
      'requisitos_habilidad_rol',
      () => prisma.requisitoHabilidadRol.findUnique({ where: { idRolProyecto_idHabilidad: { idRolProyecto: rolFrontend.idRolProyecto, idHabilidad: h.idHabilidad } } }),
      () => prisma.requisitoHabilidadRol.create({ data: { idRolProyecto: rolFrontend.idRolProyecto, idHabilidad: h.idHabilidad, nivelMinimo } }),
      (r) => (r.nivelMinimo !== nivelMinimo ? prisma.requisitoHabilidadRol.update({ where: { idRequisitoHabilidad: r.idRequisitoHabilidad }, data: { nivelMinimo } }) : undefined),
    );
  }
  const postulantes = [
    { idUsuario: est[10], habilidades: [[react, 'AVANZADO'], [typescript, 'INTERMEDIO']] },
    { idUsuario: est[11], habilidades: [[react, 'BASICO'], [figma, 'BASICO']] },
  ] as const;
  for (const { idUsuario, habilidades } of postulantes) {
    for (const [h, nivelHabilidad] of habilidades) {
      await asegurar(
        'habilidades_usuario',
        () => prisma.usuarioHabilidad.findUnique({ where: { idUsuario_idHabilidad: { idUsuario, idHabilidad: h.idHabilidad } } }),
        () => prisma.usuarioHabilidad.create({ data: { idUsuario, idHabilidad: h.idHabilidad, nivelHabilidad } }),
        (u) => (u.nivelHabilidad !== nivelHabilidad ? prisma.usuarioHabilidad.update({ where: { idUsuarioHabilidad: u.idUsuarioHabilidad }, data: { nivelHabilidad } }) : undefined),
      );
    }
    await asegurar(
      'postulaciones_pendientes',
      () => prisma.postulacion.findFirst({ where: { idUsuarioPostulante: idUsuario, idRolProyecto: rolFrontend.idRolProyecto } }),
      () => prisma.postulacion.create({ data: { idUsuarioPostulante: idUsuario, idRolProyecto: rolFrontend.idRolProyecto, justificacion: 'Me interesa sumarme al equipo de la app de tutorías.' } }),
    );
  }

  await sembrarCoordinador(passwordCoordinador, carrera.idCarrera, [est[2], est[3]]);
  await sembrarEntrega9(est, armados[0].idProyecto, armados[3].idProyecto, presidente.idUsuario, [react, typescript]);

  // ─── Verificacion final contra la base ────────────────────────────────────
  // Mismo universo que la asociacion: estudiantes activos de sus carreras.
  const registros = await prisma.registroHorasSemestre.findMany({
    where: {
      anio: semestre.anio,
      periodo: semestre.periodo,
      usuario: { estado: 'ACTIVO', perfil: { is: { carrera: { asociaciones: { some: { idAsociacion: asociacion.idAsociacion } } } } } },
    },
  });
  const idsRegistros = registros.map((r) => r.idUsuario);
  const acreditadas = await prisma.horasParticipacion.findMany({
    where: {
      estadoHoras: 'APROBADA',
      fechaAprobacion: { gte: inicioDeDia(semestre.inicio), lt: inicioDeDia(addDaysToDay(semestre.fin, 1)) },
      participacion: { idUsuario: { in: idsRegistros } },
    },
    select: { horasAprobadas: true, participacion: { select: { idUsuario: true, rolProyecto: { select: { proyecto: { select: { tipoProyecto: true } } } } } } },
  });
  const acred = (idUsuario: number, tipo: TipoProyecto) =>
    acreditadas.filter((h) => h.participacion.idUsuario === idUsuario && h.participacion.rolProyecto.proyecto.tipoProyecto === tipo).reduce((s, h) => s + Number(h.horasAprobadas ?? 0), 0);
  const demoConRegistro = registros.filter((r) => est.includes(r.idUsuario)).length;
  if (demoConRegistro !== est.length) throw new Error(`Se esperaban ${est.length} registros de horas del semestre y hay ${demoConRegistro}.`);
  verificarRiesgo(
    registros.map((r) => ({
      metaBeca: r.metaBeca,
      avanceBeca: r.becaDeclarada + acred(r.idUsuario, 'ACADEMICO_HORAS_BECA'),
      metaExtension: r.metaExtension,
      avanceExtension: r.extensionDeclarada + acred(r.idUsuario, 'EXTRACURRICULAR_EXTENSION'),
    })),
    semestre,
    hoy,
    'base de datos',
  );

  // DEMO-11: solo las cuentas demo.cs01-15 (ids de `est`); nunca otras cuentas.
  await limpiarMensajesEliminados(armados[3].idProyecto, est[0]);
  stats.notificaciones_inicio_sesion_leidas ??= { creado: 0, actualizado: 0 };
  const leidas = await prisma.notificacion.updateMany({
    where: { idUsuario: { in: est }, tipoNotificacion: 'NUEVO_INICIO_SESION', leidaEn: null },
    data: { leidaEn: new Date() },
  });
  stats.notificaciones_inicio_sesion_leidas.actualizado += leidas.count;

  for (const [entidad, c] of Object.entries(stats)) console.log(`${entidad}: creados ${c.creado}, actualizados ${c.actualizado}`);
  console.log('Demo final seed completed successfully');
}

class Rollback extends Error {}

// Solo corre como entrypoint.
if (require.main === module) {
  const ejecutar = async () => {
    if (process.env.DRY_RUN !== '1') return main();
    try {
      await cliente.$transaction(
        async (tx) => {
          prisma = tx;
          await main();
          throw new Rollback();
        },
        { timeout: 300_000, maxWait: 30_000 },
      );
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
      console.log('DRY_RUN=1: transaccion revertida, no se guardo nada.');
    }
  };
  ejecutar()
    .then(async () => {
      await cliente.$disconnect();
    })
    .catch(async (e) => {
      console.error(e instanceof Error ? e.message : e);
      await cliente.$disconnect();
      process.exit(1);
    });
}
