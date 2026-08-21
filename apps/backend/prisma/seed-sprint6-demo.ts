/**
 * Dataset de showcase "Sprint 6 Demo": puebla un namespace de datos
 * completamente separado (usuarios con correo `s6.*@uvg.edu.gt`, proyectos
 * con títulos propios) para recorrer visualmente los flujos de Sprint 6
 * (Sprints, cierre de Sprint, salida de proyecto en dos pasos, resumen de
 * miembros, postulaciones, cierre de proyecto) sin tocar ningún dato
 * preexistente de otros usuarios/proyectos.
 *
 * No cambia reglas de negocio, schema, migraciones ni frontend: solo puebla
 * datos. Nunca fija IDs explícitos; localiza todo por clave natural (correo,
 * título de proyecto, nombre de rol, número de Sprint, título de tarea) para
 * que una segunda ejecución produzca exactamente el mismo dataset lógico sin
 * duplicar filas.
 *
 * Estrategia de idempotencia para el árbol de asignaciones/horas/solicitudes
 * de cada proyecto demo (sin llave natural simple, ver Sección 10/55 de la
 * tarea): se localizan los proyectos/participaciones/tareas demo por clave
 * natural (upsert normal), y SOLO las filas hijas sin llave natural propia
 * (AsignacionTarea, RegistroAvanceAsignacion, HorasParticipacion,
 * SolicitudSalidaProyecto) se borran y reconstruyen en cada corrida —
 * exclusivamente dentro del conjunto de proyectos/usuarios de este
 * namespace, nunca fuera de él.
 *
 * Uso (base LOCAL/desechable únicamente):
 *   DATABASE_URL="postgresql://postgres:postgres@localhost:5433/uvg_collab" \
 *   DIRECT_URL="postgresql://postgres:postgres@localhost:5433/uvg_collab" \
 *     npx tsx prisma/seed-sprint6-demo.ts
 */
import { hashSync } from 'bcryptjs';
import {
  EstadoParticipacion,
  EstadoPostulacion,
  EstadoProyecto,
  EstadoSolicitudSalida,
  EstadoSprint,
  EstadoTarea,
  Prioridad,
  Prisma,
  PrismaClient,
} from '@prisma/client';

const prisma = new PrismaClient();

const NOW = new Date();
const ts = (days: number) => new Date(NOW.getTime() + days * 86_400_000);
function dateOnly(days: number): Date {
  const d = ts(days);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const PASSWORD_HASH = hashSync('Test1234!', 10);

function abort(msg: string): never {
  console.error(`\n[ABORT] ${msg}\n`);
  throw new Error(msg);
}

// ─── Namespace de usuarios demo ───────────────────────────────────────────
const USERS = {
  lider: { correo: 's6.lider@uvg.edu.gt', nombre: 'Valeria', apellido: 'Ortiz' },
  beatriz: { correo: 's6.beatriz@uvg.edu.gt', nombre: 'Beatriz', apellido: 'Solano' },
  carlos: { correo: 's6.carlos@uvg.edu.gt', nombre: 'Carlos', apellido: 'Pineda' },
  diego: { correo: 's6.diego@uvg.edu.gt', nombre: 'Diego', apellido: 'Fuentes' },
  estefania: { correo: 's6.estefania@uvg.edu.gt', nombre: 'Estefanía', apellido: 'Marroquín' },
  fernando: { correo: 's6.fernando@uvg.edu.gt', nombre: 'Fernando', apellido: 'Girón' },
  gabriela: { correo: 's6.gabriela@uvg.edu.gt', nombre: 'Gabriela', apellido: 'Recinos' },
  hugo: { correo: 's6.hugo@uvg.edu.gt', nombre: 'Hugo', apellido: 'Paredes' },
  ingrid: { correo: 's6.ingrid@uvg.edu.gt', nombre: 'Ingrid', apellido: 'Cabrera' },
  karla: { correo: 's6.karla@uvg.edu.gt', nombre: 'Karla', apellido: 'Ixchel' },
  laura: { correo: 's6.laura@uvg.edu.gt', nombre: 'Laura', apellido: 'Xitumul' },
} as const;

type UserKey = keyof typeof USERS;

async function ensureUsuario(key: UserKey) {
  const u = USERS[key];
  return prisma.usuario.upsert({
    where: { correo: u.correo },
    update: { nombre: u.nombre, apellido: u.apellido, estado: 'ACTIVO' },
    create: { correo: u.correo, contrasena: PASSWORD_HASH, nombre: u.nombre, apellido: u.apellido, estado: 'ACTIVO' },
  });
}

async function ensureProyecto(
  titulo: string,
  creadoPor: number,
  data: Omit<Prisma.ProyectoUncheckedCreateInput, 'tituloProyecto' | 'creadoPor'>,
) {
  const existente = await prisma.proyecto.findFirst({ where: { tituloProyecto: titulo, creadoPor } });
  if (existente) {
    return prisma.proyecto.update({ where: { idProyecto: existente.idProyecto }, data });
  }
  return prisma.proyecto.create({ data: { tituloProyecto: titulo, creadoPor, ...data } });
}

async function ensureRol(idProyecto: number, nombreRol: string, cupos: number, descripcionRolProyecto?: string) {
  const existente = await prisma.rolProyecto.findFirst({ where: { idProyecto, nombreRol } });
  const data = { cupos, descripcionRolProyecto };
  if (existente) return prisma.rolProyecto.update({ where: { idRolProyecto: existente.idRolProyecto }, data });
  return prisma.rolProyecto.create({ data: { idProyecto, nombreRol, ...data } });
}

async function ensureSprint(idProyecto: number, numero: number, estado: EstadoSprint, fechas: Partial<Prisma.SprintUncheckedCreateInput>) {
  const existente = await prisma.sprint.findFirst({ where: { idProyecto, numero } });
  const data = { estado, ...fechas };
  if (existente) return prisma.sprint.update({ where: { idSprint: existente.idSprint }, data });
  return prisma.sprint.create({ data: { idProyecto, numero, estado, ...fechas } });
}

async function ensureHito(idProyecto: number, tituloHito: string, orden: number, fechaLimite: Date) {
  const existente = await prisma.hito.findFirst({ where: { idProyecto, tituloHito } });
  const data = { orden, fechaLimite };
  if (existente) return prisma.hito.update({ where: { idHito: existente.idHito }, data });
  return prisma.hito.create({ data: { idProyecto, tituloHito, ...data, estadoHito: 'PENDIENTE' } });
}

async function setHitoEstado(idHito: number, estadoHito: 'PENDIENTE' | 'EN_PROGRESO' | 'COMPLETADO') {
  await prisma.hito.update({ where: { idHito }, data: { estadoHito } });
}

/**
 * Idéntico patrón que seed-tutoring-workspace-demo.ts (FND-08.B): para el
 * objetivo ACTIVO nunca reactiva una fila histórica (RETIRADO/COMPLETADO) —
 * reutiliza una fila YA ACTIVO si existe, o crea una nueva. Para cualquier
 * otro objetivo, el patrón find/update-or-create original es seguro porque
 * esos estados no están protegidos por el índice parcial.
 */
async function ensureParticipacion(
  idUsuario: number,
  idRolProyecto: number,
  estado: EstadoParticipacion,
  fechaIngreso: Date,
  fechaSalida: Date | null,
  idPostulacion?: number,
) {
  if (estado === EstadoParticipacion.ACTIVO) {
    const activa = await prisma.participacionProyecto.findFirst({
      where: { idUsuario, idRolProyecto, estadoParticipacion: EstadoParticipacion.ACTIVO },
    });
    if (activa) {
      return prisma.participacionProyecto.update({
        where: { idParticipacion: activa.idParticipacion },
        data: { fechaIngreso, fechaSalida, idPostulacion },
      });
    }
    return prisma.participacionProyecto.create({
      data: { idUsuario, idRolProyecto, estadoParticipacion: estado, fechaIngreso, fechaSalida, idPostulacion },
    });
  }

  const existente = await prisma.participacionProyecto.findFirst({ where: { idUsuario, idRolProyecto } });
  if (existente) {
    return prisma.participacionProyecto.update({
      where: { idParticipacion: existente.idParticipacion },
      data: { estadoParticipacion: estado, fechaIngreso, fechaSalida, idPostulacion },
    });
  }
  return prisma.participacionProyecto.create({
    data: { idUsuario, idRolProyecto, estadoParticipacion: estado, fechaIngreso, fechaSalida, idPostulacion },
  });
}

async function ensurePostulacion(
  idUsuarioPostulante: number,
  idRolProyecto: number,
  data: {
    justificacion: string;
    estadoPostulacion: EstadoPostulacion;
    fechaPostulacion: Date;
    resueltaPor?: number;
    fechaResolucion?: Date;
    comentarioResolucion?: string;
  },
) {
  const existente = await prisma.postulacion.findFirst({ where: { idUsuarioPostulante, idRolProyecto } });
  if (existente) return prisma.postulacion.update({ where: { idPostulacion: existente.idPostulacion }, data });
  return prisma.postulacion.create({ data: { idUsuarioPostulante, idRolProyecto, ...data } });
}

async function ensureTarea(
  idProyecto: number,
  tituloTarea: string,
  data: Omit<Prisma.TareaUncheckedCreateInput, 'idProyecto' | 'tituloTarea' | 'creadaPor'>,
  creadaPor: number,
) {
  const existente = await prisma.tarea.findFirst({ where: { idProyecto, tituloTarea } });
  if (existente) return prisma.tarea.update({ where: { idTarea: existente.idTarea }, data });
  return prisma.tarea.create({ data: { idProyecto, tituloTarea, creadaPor, ...data } });
}

// ─── Textos de RegistroAvanceAsignacion (>=200 caracteres, contenido creíble) ──
const REGISTROS = {
  diagnostico:
    'Durante este tramo se levantó un diagnóstico completo de las necesidades de tutoría por facultad, entrevistando a coordinadores académicos y revisando los índices de reprobación de los últimos dos semestres. El resultado se documentó en una matriz priorizada por curso.',
  planTrabajo:
    'Se elaboró el plan de trabajo inicial del programa de tutorías, definiendo responsables, cronograma y los cursos piloto con mayor demanda. El documento fue revisado con el equipo coordinador y quedó como base para la convocatoria de tutores del primer ciclo.',
  guiaBuenasPracticas:
    'Se publicó la guía de buenas prácticas para tutores, incluyendo recomendaciones de manejo de sesiones grupales, criterios de derivación de casos complejos y una plantilla estándar para el reporte de avance de cada sesión de tutoría.',
  retroalimentacion:
    'Se revisaron y consolidaron las encuestas de retroalimentación recolectadas durante el ciclo anterior, identificando los cursos con mejor recepción y las áreas donde los estudiantes solicitaron más acompañamiento. El resumen se compartió con la coordinación.',
  pruebaReserva:
    'Se ejecutaron pruebas completas del flujo de reserva de sesiones de tutoría, cubriendo la selección de curso, horario disponible y confirmación por correo. Se documentaron dos inconsistencias menores de horario que ya fueron reportadas para corrección.',
  protocoloSeguimiento:
    'Se documentó el protocolo de seguimiento académico que utilizará el equipo coordinador para dar continuidad a los estudiantes referidos a tutoría, incluyendo los criterios de reincorporación y el formato de bitácora compartida entre tutores.',
};

async function main() {
  console.log('== Sprint 6 Demo dataset ==\n');

  // ── 1. Usuarios ───────────────────────────────────────────────────────
  const u: Record<UserKey, Prisma.PromiseReturnType<typeof ensureUsuario>> = {} as never;
  for (const key of Object.keys(USERS) as UserKey[]) {
    u[key] = await ensureUsuario(key);
  }
  const lider = u.lider;
  console.log(`Líder demo: ${lider.correo} (#${lider.idUsuario})`);

  // ══════════════════════════════════════════════════════════════════════
  // PROYECTO 1 — PRINCIPAL, Sprint ACTIVO + histórico CERRADO x2
  // ══════════════════════════════════════════════════════════════════════
  const P1_TITLE = 'Sistema de Tutorías Académicas UVG — Sprint 6 Demo';
  const p1 = await ensureProyecto(P1_TITLE, lider.idUsuario, {
    descripcionProyecto:
      'Programa institucional de tutorías académicas entre pares: conecta estudiantes con tutores de su misma carrera para reforzar cursos con alta demanda de apoyo.',
    objetivosProyecto: 'Reducir la tasa de reprobación en cursos priorizados mediante acompañamiento entre pares.',
    tipoProyecto: 'ACADEMICO_HORAS_BECA',
    estadoProyecto: EstadoProyecto.EN_PROGRESO,
    modalidadProyecto: 'MIXTA',
    fechaInicio: dateOnly(-70),
    fechaFinEstimada: dateOnly(120),
    fechaPublicacion: dateOnly(-70),
  });
  console.log(`Proyecto 1 (principal) → #${p1.idProyecto} "${p1.tituloProyecto}"`);

  const rCoord = await ensureRol(p1.idProyecto, 'Coordinación de tutorías', 5, 'Coordina la operación semanal del programa de tutorías.');
  const rCont = await ensureRol(p1.idProyecto, 'Contenidos académicos', 5, 'Prepara y actualiza el material de apoyo por curso.');
  const rPlat = await ensureRol(p1.idProyecto, 'Plataforma y soporte', 5, 'Da soporte técnico a la plataforma de reservas de tutoría.');

  // Postulaciones
  const postBeatriz = await ensurePostulacion(u.beatriz.idUsuario, rCoord.idRolProyecto, {
    justificacion: 'Ya fui tutora de Cálculo I el semestre pasado y quiero seguir apoyando al programa desde la coordinación.',
    estadoPostulacion: EstadoPostulacion.ACEPTADA,
    fechaPostulacion: ts(-78),
    resueltaPor: lider.idUsuario,
    fechaResolucion: ts(-75),
  });
  await ensurePostulacion(u.hugo.idUsuario, rCont.idRolProyecto, {
    justificacion: 'Tengo experiencia preparando material de estudio para mis compañeros de carrera y quiero aportar al banco de recursos.',
    estadoPostulacion: EstadoPostulacion.PENDIENTE,
    fechaPostulacion: ts(-3),
  });
  await ensurePostulacion(u.ingrid.idUsuario, rPlat.idRolProyecto, {
    justificacion: 'Curso Ingeniería en Ciencias de la Computación y me interesa dar soporte técnico a la plataforma de reservas.',
    estadoPostulacion: EstadoPostulacion.PENDIENTE,
    fechaPostulacion: ts(-2),
  });
  await ensurePostulacion(u.ingrid.idUsuario, rCoord.idRolProyecto, {
    justificacion: 'Quiero unirme a la coordinación del programa para apoyar la logística de las sesiones semanales.',
    estadoPostulacion: EstadoPostulacion.RECHAZADA,
    fechaPostulacion: ts(-20),
    resueltaPor: lider.idUsuario,
    fechaResolucion: ts(-18),
    comentarioResolucion: 'Ya cubrimos los cupos de coordinación disponibles este ciclo; te animamos a postular a plataforma y soporte.',
  });

  // Participaciones
  const partBeatriz = await ensureParticipacion(u.beatriz.idUsuario, rCoord.idRolProyecto, 'ACTIVO', dateOnly(-75), null, postBeatriz.idPostulacion);
  const partCarlosCoord = await ensureParticipacion(u.carlos.idUsuario, rCoord.idRolProyecto, 'ACTIVO', dateOnly(-70), null);
  const partCarlosPlat = await ensureParticipacion(u.carlos.idUsuario, rPlat.idRolProyecto, 'ACTIVO', dateOnly(-15), null);
  const partDiego = await ensureParticipacion(u.diego.idUsuario, rCont.idRolProyecto, 'ACTIVO', dateOnly(-60), null);
  const partEstefania = await ensureParticipacion(u.estefania.idUsuario, rPlat.idRolProyecto, 'ACTIVO', dateOnly(-55), null);
  const partFernando = await ensureParticipacion(u.fernando.idUsuario, rCont.idRolProyecto, 'RETIRADO', dateOnly(-68), dateOnly(-10));
  const partKarla = await ensureParticipacion(u.karla.idUsuario, rCoord.idRolProyecto, 'RETIRADO', dateOnly(-65), dateOnly(-30));
  const partGabriela = await ensureParticipacion(u.gabriela.idUsuario, rCont.idRolProyecto, 'RETIRADO', dateOnly(-50), dateOnly(-6));

  // Hitos
  const h1 = await ensureHito(p1.idProyecto, 'Diagnóstico y planeación del programa', 1, dateOnly(-50));
  const h2 = await ensureHito(p1.idProyecto, 'Consolidación de recursos y capacitación', 2, dateOnly(-10));
  const h3 = await ensureHito(p1.idProyecto, 'Piloto y operación del semestre', 3, dateOnly(20));
  const h4 = await ensureHito(p1.idProyecto, 'Evaluación y cierre del ciclo', 4, dateOnly(60));

  // Sprints
  const s1 = await ensureSprint(p1.idProyecto, 1, EstadoSprint.CERRADO, {
    fechaInicio: ts(-70),
    fechaCierre: ts(-50),
    cerradoPor: lider.idUsuario,
  });
  const s2 = await ensureSprint(p1.idProyecto, 2, EstadoSprint.CERRADO, {
    fechaInicio: ts(-49),
    fechaCierre: ts(-25),
    cerradoPor: lider.idUsuario,
  });
  const s3 = await ensureSprint(p1.idProyecto, 3, EstadoSprint.ACTIVO, {
    fechaInicio: ts(-24),
  });

  // ── Tareas Sprint 1 (histórico CERRADO, 3 tareas, todas HECHO) ─────────
  const t1_1 = await ensureTarea(p1.idProyecto, 'Diagnosticar necesidades de tutoría por facultad', {
    idSprint: s1.idSprint, idHito: h1.idHito, idRolProyecto: rCoord.idRolProyecto,
    descripcionTarea: 'Levantar un diagnóstico de necesidades de tutoría por facultad para priorizar cursos.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.ALTA, tiempoEstimadoHoras: 6,
  }, lider.idUsuario);
  const t1_2 = await ensureTarea(p1.idProyecto, 'Elaborar plan de trabajo del programa de tutorías', {
    idSprint: s1.idSprint, idHito: h1.idHito, idRolProyecto: rCont.idRolProyecto,
    descripcionTarea: 'Definir responsables, cronograma y cursos piloto del primer ciclo.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.ALTA, tiempoEstimadoHoras: 5,
  }, lider.idUsuario);
  const t1_3 = await ensureTarea(p1.idProyecto, 'Configurar catálogo inicial de cursos con tutoría', {
    idSprint: s1.idSprint, idHito: h1.idHito, idRolProyecto: rCoord.idRolProyecto,
    descripcionTarea: 'Cargar en la plataforma el catálogo de cursos habilitados para tutoría.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.MEDIA, tiempoEstimadoHoras: 7,
  }, lider.idUsuario);
  await setHitoEstado(h1.idHito, 'COMPLETADO');

  // ── Tareas Sprint 2 (histórico CERRADO, 3 tareas, todas HECHO) ─────────
  const t2_1 = await ensureTarea(p1.idProyecto, 'Publicar guía de buenas prácticas para tutores', {
    idSprint: s2.idSprint, idHito: h2.idHito, idRolProyecto: rCoord.idRolProyecto,
    descripcionTarea: 'Redactar y publicar la guía de buenas prácticas para las sesiones de tutoría.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.MEDIA, tiempoEstimadoHoras: 4,
  }, lider.idUsuario);
  const t2_2 = await ensureTarea(p1.idProyecto, 'Revisar y consolidar retroalimentación de tutores', {
    idSprint: s2.idSprint, idHito: h2.idHito, idRolProyecto: rCont.idRolProyecto,
    descripcionTarea: 'Consolidar la retroalimentación del ciclo anterior para ajustar el programa.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.MEDIA, tiempoEstimadoHoras: 5,
  }, lider.idUsuario);
  const t2_3 = await ensureTarea(p1.idProyecto, 'Actualizar recursos de apoyo para primer parcial', {
    idSprint: s2.idSprint, idHito: null, idRolProyecto: rPlat.idRolProyecto,
    descripcionTarea: 'Actualizar los recursos de apoyo publicados antes del primer parcial.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.BAJA, tiempoEstimadoHoras: 6,
  }, lider.idUsuario);

  // ── Tareas Sprint 3 (ACTIVO, 10 tareas distribuidas en el Kanban) ──────
  const t3_1 = await ensureTarea(p1.idProyecto, 'Publicar calendario de tutorías del próximo semestre', {
    idSprint: s3.idSprint, idHito: null, idRolProyecto: null,
    descripcionTarea: 'Publicar el calendario de sesiones del siguiente semestre académico.',
    estadoTarea: EstadoTarea.POR_HACER, prioridad: Prioridad.ALTA, tiempoEstimadoHoras: 3, fechaLimite: dateOnly(10),
  }, lider.idUsuario);
  const t3_2 = await ensureTarea(p1.idProyecto, 'Preparar taller de técnicas de estudio para tutores nuevos', {
    idSprint: s3.idSprint, idHito: null, idRolProyecto: rCont.idRolProyecto,
    descripcionTarea: 'Diseñar el taller de inducción para los tutores que se incorporan este semestre.',
    estadoTarea: EstadoTarea.POR_HACER, prioridad: Prioridad.MEDIA, tiempoEstimadoHoras: 4, fechaLimite: dateOnly(12),
  }, lider.idUsuario);
  const t3_3 = await ensureTarea(p1.idProyecto, 'Actualizar banco de recursos de Cálculo I', {
    idSprint: s3.idSprint, idHito: null, idRolProyecto: rCont.idRolProyecto,
    descripcionTarea: 'Revisar y actualizar los materiales de apoyo del curso de Cálculo I.',
    estadoTarea: EstadoTarea.POR_HACER, prioridad: Prioridad.BAJA, tiempoEstimadoHoras: 3, fechaLimite: dateOnly(15),
  }, lider.idUsuario);
  const t3_4 = await ensureTarea(p1.idProyecto, 'Configurar agenda semanal de sesiones de tutoría', {
    idSprint: s3.idSprint, idHito: h3.idHito, idRolProyecto: rPlat.idRolProyecto,
    descripcionTarea: 'Configurar en la plataforma la agenda semanal de sesiones disponibles.',
    estadoTarea: EstadoTarea.EN_PROGRESO, prioridad: Prioridad.ALTA, tiempoEstimadoHoras: 6, fechaLimite: dateOnly(8),
  }, lider.idUsuario);
  const t3_5 = await ensureTarea(p1.idProyecto, 'Elaborar guía de atención y derivación de casos', {
    idSprint: s3.idSprint, idHito: h2.idHito, idRolProyecto: rCont.idRolProyecto,
    descripcionTarea: 'Redactar la guía de atención y los criterios de derivación de casos complejos.',
    estadoTarea: EstadoTarea.EN_PROGRESO, prioridad: Prioridad.MEDIA, tiempoEstimadoHoras: 4, fechaLimite: dateOnly(9),
  }, lider.idUsuario);
  const t3_6 = await ensureTarea(p1.idProyecto, 'Revisar solicitudes de tutoría pendientes del semestre', {
    idSprint: s3.idSprint, idHito: null, idRolProyecto: null,
    descripcionTarea: 'Depurar y priorizar las solicitudes de tutoría recibidas este semestre.',
    estadoTarea: EstadoTarea.EN_PROGRESO, prioridad: Prioridad.ALTA, tiempoEstimadoHoras: 3, fechaLimite: dateOnly(6),
  }, lider.idUsuario);
  const t3_7 = await ensureTarea(p1.idProyecto, 'Probar flujo de reserva de sesiones de tutoría', {
    idSprint: s3.idSprint, idHito: h3.idHito, idRolProyecto: rPlat.idRolProyecto,
    descripcionTarea: 'Ejecutar pruebas del flujo de reserva de sesiones de principio a fin.',
    estadoTarea: EstadoTarea.EN_REVISION, prioridad: Prioridad.ALTA, tiempoEstimadoHoras: 4, fechaLimite: dateOnly(2),
  }, lider.idUsuario);
  const t3_8 = await ensureTarea(p1.idProyecto, 'Validar criterios de selección de nuevos tutores', {
    idSprint: s3.idSprint, idHito: null, idRolProyecto: rCoord.idRolProyecto,
    descripcionTarea: 'Validar los criterios y el proceso de selección de tutores nuevos.',
    estadoTarea: EstadoTarea.EN_REVISION, prioridad: Prioridad.BAJA, tiempoEstimadoHoras: 3, fechaLimite: dateOnly(9),
  }, lider.idUsuario);
  const t3_9 = await ensureTarea(p1.idProyecto, 'Levantar necesidades de cursos prioritarios para el ciclo', {
    idSprint: s3.idSprint, idHito: h3.idHito, idRolProyecto: rCoord.idRolProyecto,
    descripcionTarea: 'Levantar la demanda de tutorías por curso para priorizar la oferta del ciclo.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.ALTA, tiempoEstimadoHoras: 3, fechaLimite: dateOnly(-2),
  }, lider.idUsuario);
  const t3_10 = await ensureTarea(p1.idProyecto, 'Documentar protocolo de seguimiento académico', {
    idSprint: s3.idSprint, idHito: null, idRolProyecto: rCoord.idRolProyecto,
    descripcionTarea: 'Documentar el protocolo de seguimiento y sus indicadores.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.MEDIA, tiempoEstimadoHoras: 3, fechaLimite: dateOnly(-5),
  }, lider.idUsuario);
  await setHitoEstado(h2.idHito, 'EN_PROGRESO'); // 2/3 HECHO (t2_1,t2_2 HECHO + t3_5 EN_PROGRESO)
  await setHitoEstado(h3.idHito, 'EN_PROGRESO'); // 1/3 HECHO (t3_4 EN_PROGRESO, t3_7 EN_REVISION, t3_9 HECHO)
  await setHitoEstado(h4.idHito, 'PENDIENTE'); // sin tareas

  // Solicitudes de salida
  const solDiego = { idProyecto: p1.idProyecto, idUsuario: u.diego.idUsuario };
  const solEstefania = { idProyecto: p1.idProyecto, idUsuario: u.estefania.idUsuario };
  const solFernando = { idProyecto: p1.idProyecto, idUsuario: u.fernando.idUsuario };
  const solGabriela = { idProyecto: p1.idProyecto, idUsuario: u.gabriela.idUsuario };

  // ── Reconstrucción idempotente de las filas sin llave natural propia ───
  const p1TaskIds = [t1_1, t1_2, t1_3, t2_1, t2_2, t2_3, t3_1, t3_2, t3_3, t3_4, t3_5, t3_6, t3_7, t3_8, t3_9, t3_10].map((t) => t.idTarea);
  const p1ParticipationIds = [partBeatriz, partCarlosCoord, partCarlosPlat, partDiego, partEstefania, partFernando, partKarla, partGabriela].map((p) => p.idParticipacion);
  const p1DemoUserIds = [u.diego.idUsuario, u.estefania.idUsuario, u.fernando.idUsuario, u.gabriela.idUsuario];

  await prisma.$transaction(
    async (tx) => {
      await tx.registroAvanceAsignacion.deleteMany({ where: { asignacion: { idTarea: { in: p1TaskIds } } } });
      await tx.asignacionTarea.deleteMany({ where: { idTarea: { in: p1TaskIds } } });
      await tx.horasParticipacion.deleteMany({ where: { idParticipacion: { in: p1ParticipationIds } } });
      await tx.solicitudSalidaProyecto.deleteMany({ where: { idProyecto: p1.idProyecto, idUsuario: { in: p1DemoUserIds } } });

      // Asignaciones Sprint 1 (cerradas, con horas reales, reconocidas)
      const a1_1 = await tx.asignacionTarea.create({ data: { idTarea: t1_1.idTarea, idUsuario: u.carlos.idUsuario, idParticipacion: partCarlosCoord.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-70), desasignadaEn: ts(-50), horasReales: 6, reconocidoEn: ts(-50) } });
      const a1_2 = await tx.asignacionTarea.create({ data: { idTarea: t1_2.idTarea, idUsuario: u.fernando.idUsuario, idParticipacion: partFernando.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-69), desasignadaEn: ts(-50), horasReales: 5, reconocidoEn: ts(-50) } });
      await tx.asignacionTarea.create({ data: { idTarea: t1_3.idTarea, idUsuario: u.karla.idUsuario, idParticipacion: partKarla.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-68), desasignadaEn: ts(-50), horasReales: 7, reconocidoEn: ts(-50) } });

      // Asignaciones Sprint 2 (cerradas, con horas reales, reconocidas)
      const a2_1 = await tx.asignacionTarea.create({ data: { idTarea: t2_1.idTarea, idUsuario: u.carlos.idUsuario, idParticipacion: partCarlosCoord.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-45), desasignadaEn: ts(-25), horasReales: 4, reconocidoEn: ts(-25) } });
      const a2_2 = await tx.asignacionTarea.create({ data: { idTarea: t2_2.idTarea, idUsuario: u.diego.idUsuario, idParticipacion: partDiego.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-44), desasignadaEn: ts(-25), horasReales: 5, reconocidoEn: ts(-25) } });
      await tx.asignacionTarea.create({ data: { idTarea: t2_3.idTarea, idUsuario: u.estefania.idUsuario, idParticipacion: partEstefania.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-43), desasignadaEn: ts(-25), horasReales: 6, reconocidoEn: ts(-25) } });

      // Asignaciones Sprint 3 (activo)
      await tx.asignacionTarea.create({ data: { idTarea: t3_2.idTarea, idUsuario: u.beatriz.idUsuario, idParticipacion: partBeatriz.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-6), desasignadaEn: null } });
      // Diego (PREPARACION): 3 asignaciones activas = blockers del workspace F9. Una COMPLETA (horas+avance), dos PENDIENTES.
      await tx.asignacionTarea.create({ data: { idTarea: t3_3.idTarea, idUsuario: u.diego.idUsuario, idParticipacion: partDiego.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-20), desasignadaEn: null } });
      await tx.asignacionTarea.create({ data: { idTarea: t3_5.idTarea, idUsuario: u.diego.idUsuario, idParticipacion: partDiego.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-18), desasignadaEn: null } });
      const a3_7_diego = await tx.asignacionTarea.create({ data: { idTarea: t3_7.idTarea, idUsuario: u.diego.idUsuario, idParticipacion: partDiego.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-15), desasignadaEn: null, horasReales: 3 } });

      await tx.asignacionTarea.create({ data: { idTarea: t3_4.idTarea, idUsuario: u.carlos.idUsuario, idParticipacion: partCarlosPlat.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-14), desasignadaEn: null } });
      await tx.asignacionTarea.create({ data: { idTarea: t3_6.idTarea, idUsuario: u.beatriz.idUsuario, idParticipacion: partBeatriz.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-13), desasignadaEn: null } });
      await tx.asignacionTarea.create({ data: { idTarea: t3_8.idTarea, idUsuario: u.carlos.idUsuario, idParticipacion: partCarlosCoord.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-12), desasignadaEn: null } });
      await tx.asignacionTarea.create({ data: { idTarea: t3_9.idTarea, idUsuario: u.beatriz.idUsuario, idParticipacion: partBeatriz.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-11), desasignadaEn: null, horasReales: 4 } });
      await tx.asignacionTarea.create({ data: { idTarea: t3_10.idTarea, idUsuario: u.carlos.idUsuario, idParticipacion: partCarlosCoord.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-9), desasignadaEn: ts(-1), horasReales: 3 } });

      // Registros de avance (>=200 caracteres, contenido creíble y distinto)
      await tx.registroAvanceAsignacion.create({ data: { idAsignacion: a1_1.idAsignacion, idAutor: u.carlos.idUsuario, contenido: REGISTROS.diagnostico, creadoEn: ts(-51) } });
      await tx.registroAvanceAsignacion.create({ data: { idAsignacion: a1_2.idAsignacion, idAutor: u.fernando.idUsuario, contenido: REGISTROS.planTrabajo, creadoEn: ts(-51) } });
      await tx.registroAvanceAsignacion.create({ data: { idAsignacion: a2_1.idAsignacion, idAutor: u.carlos.idUsuario, contenido: REGISTROS.guiaBuenasPracticas, creadoEn: ts(-26) } });
      await tx.registroAvanceAsignacion.create({ data: { idAsignacion: a2_2.idAsignacion, idAutor: u.diego.idUsuario, contenido: REGISTROS.retroalimentacion, creadoEn: ts(-26) } });
      await tx.registroAvanceAsignacion.create({ data: { idAsignacion: a3_7_diego.idAsignacion, idAutor: u.diego.idUsuario, contenido: REGISTROS.pruebaReserva, creadoEn: ts(-14) } });

      // HorasParticipacion Sprint 1 y 2 (histórico ya reconocido/aprobado; horas distintas por Sprint)
      await tx.horasParticipacion.create({ data: { idParticipacion: partCarlosCoord.idParticipacion, idSprint: s1.idSprint, periodoInicio: dateOnly(-70), periodoFin: dateOnly(-50), horasReportadas: 6, horasCalculadas: 6, horasAprobadas: 6, estadoHoras: 'APROBADA', aprobadoPor: lider.idUsuario, fechaAprobacion: ts(-49) } });
      await tx.horasParticipacion.create({ data: { idParticipacion: partFernando.idParticipacion, idSprint: s1.idSprint, periodoInicio: dateOnly(-70), periodoFin: dateOnly(-50), horasReportadas: 5, horasCalculadas: 5, horasAprobadas: 5, estadoHoras: 'APROBADA', aprobadoPor: lider.idUsuario, fechaAprobacion: ts(-49) } });
      await tx.horasParticipacion.create({ data: { idParticipacion: partKarla.idParticipacion, idSprint: s1.idSprint, periodoInicio: dateOnly(-70), periodoFin: dateOnly(-50), horasReportadas: 7, horasCalculadas: 7, horasAprobadas: 7, estadoHoras: 'APROBADA', aprobadoPor: lider.idUsuario, fechaAprobacion: ts(-49) } });

      await tx.horasParticipacion.create({ data: { idParticipacion: partCarlosCoord.idParticipacion, idSprint: s2.idSprint, periodoInicio: dateOnly(-49), periodoFin: dateOnly(-25), horasReportadas: 4, horasCalculadas: 4, horasAprobadas: 4, estadoHoras: 'APROBADA', aprobadoPor: lider.idUsuario, fechaAprobacion: ts(-24) } });
      await tx.horasParticipacion.create({ data: { idParticipacion: partDiego.idParticipacion, idSprint: s2.idSprint, periodoInicio: dateOnly(-49), periodoFin: dateOnly(-25), horasReportadas: 5, horasCalculadas: 5, horasAprobadas: 5, estadoHoras: 'APROBADA', aprobadoPor: lider.idUsuario, fechaAprobacion: ts(-24) } });
      await tx.horasParticipacion.create({ data: { idParticipacion: partEstefania.idParticipacion, idSprint: s2.idSprint, periodoInicio: dateOnly(-49), periodoFin: dateOnly(-25), horasReportadas: 6, horasCalculadas: 6, horasAprobadas: 6, estadoHoras: 'APROBADA', aprobadoPor: lider.idUsuario, fechaAprobacion: ts(-24) } });

      // Solicitudes de salida
      // Diego -> PREPARACION (tiene 3 asignaciones activas = blockers de F9/F10)
      await tx.solicitudSalidaProyecto.create({
        data: { ...solDiego, motivo: 'Necesito reducir mi carga de proyectos este semestre por motivos académicos.', estadoSolicitud: EstadoSolicitudSalida.PREPARACION, solicitadaEn: ts(-2) },
      });
      // Estefanía -> PENDIENTE_LIDER (ya sin asignaciones activas, esperando revisión del líder)
      await tx.solicitudSalidaProyecto.create({
        data: { ...solEstefania, motivo: 'Terminé el período de colaboración que había planeado y quiero cerrar mi participación formalmente.', estadoSolicitud: EstadoSolicitudSalida.PENDIENTE_LIDER, solicitadaEn: ts(-5) },
      });
      // Fernando -> histórico APROBADA (retirado CON contribución: sus tramos de Sprint 1 tienen horasReales)
      await tx.solicitudSalidaProyecto.create({
        data: { ...solFernando, motivo: 'Voy a enfocarme en mi tesis y no podré continuar aportando activamente al programa.', estadoSolicitud: EstadoSolicitudSalida.APROBADA, solicitadaEn: ts(-12), resueltaEn: ts(-10), resueltaPor: lider.idUsuario },
      });
      // Gabriela -> histórico APROBADA (retirada SIN contribución: nunca tuvo un tramo con horasReales)
      await tx.solicitudSalidaProyecto.create({
        data: { ...solGabriela, motivo: 'Cambié de horario de clases y ya no puedo cumplir con las horas comprometidas.', estadoSolicitud: EstadoSolicitudSalida.APROBADA, solicitadaEn: ts(-8), resueltaEn: ts(-6), resueltaPor: lider.idUsuario },
      });
    },
    { timeout: 60_000 },
  );

  // ══════════════════════════════════════════════════════════════════════
  // PROYECTO 2 — SIN Sprint activo (F2: empty state + "Iniciar Sprint")
  // ══════════════════════════════════════════════════════════════════════
  const P2_TITLE = 'Plataforma de Seguimiento de Laboratorios — Sprint 6 Demo';
  const p2 = await ensureProyecto(P2_TITLE, lider.idUsuario, {
    descripcionProyecto: 'Sistema para que los encargados de laboratorio registren uso de equipo, mantenimiento e incidencias.',
    objetivosProyecto: 'Centralizar el registro de uso y mantenimiento de los laboratorios de la facultad.',
    tipoProyecto: 'ACADEMICO_EXPERIENCIA',
    estadoProyecto: EstadoProyecto.EN_PROGRESO,
    modalidadProyecto: 'PRESENCIAL',
    fechaInicio: dateOnly(-5),
    fechaFinEstimada: dateOnly(150),
    fechaPublicacion: dateOnly(-5),
  });
  const rSoporte = await ensureRol(p2.idProyecto, 'Soporte de laboratorio', 3, 'Da soporte técnico a los laboratorios de la facultad.');
  await ensureParticipacion(u.beatriz.idUsuario, rSoporte.idRolProyecto, 'ACTIVO', dateOnly(-4), null);
  console.log(`Proyecto 2 (sin Sprint) → #${p2.idProyecto} "${p2.tituloProyecto}"`);

  // ══════════════════════════════════════════════════════════════════════
  // PROYECTO 3 — Sprint EN_FINALIZACION (F5/F6/F16 bloqueado)
  // ══════════════════════════════════════════════════════════════════════
  const P3_TITLE = 'Portal de Voluntariado Universitario — Sprint 6 Demo';
  const p3 = await ensureProyecto(P3_TITLE, lider.idUsuario, {
    descripcionProyecto: 'Plataforma para coordinar jornadas de voluntariado y llevar seguimiento de horas de servicio comunitario.',
    objetivosProyecto: 'Facilitar la organización de jornadas de voluntariado y el reconocimiento de horas de servicio.',
    tipoProyecto: 'EXTRACURRICULAR_EXTENSION',
    estadoProyecto: EstadoProyecto.EN_PROGRESO,
    modalidadProyecto: 'PRESENCIAL',
    fechaInicio: dateOnly(-20),
    fechaFinEstimada: dateOnly(100),
    fechaPublicacion: dateOnly(-20),
  });
  const rCoordV = await ensureRol(p3.idProyecto, 'Coordinación de voluntariado', 3, 'Coordina la logística general de las jornadas de voluntariado.');
  const rLog = await ensureRol(p3.idProyecto, 'Logística de eventos', 3, 'Organiza la logística de cada jornada de voluntariado.');
  const rCom = await ensureRol(p3.idProyecto, 'Comunicación y difusión', 3, 'Prepara materiales de difusión para las campañas de voluntariado.');

  const partBeatrizP3 = await ensureParticipacion(u.beatriz.idUsuario, rCoordV.idRolProyecto, 'ACTIVO', dateOnly(-19), null);
  const partCarlosP3 = await ensureParticipacion(u.carlos.idUsuario, rLog.idRolProyecto, 'ACTIVO', dateOnly(-19), null);
  const partLauraP3 = await ensureParticipacion(u.laura.idUsuario, rCom.idRolProyecto, 'ACTIVO', dateOnly(-19), null);

  const s1p3 = await ensureSprint(p3.idProyecto, 1, EstadoSprint.EN_FINALIZACION, {
    fechaInicio: ts(-20),
    fechaFinalizacionIniciada: ts(-1),
  });

  const tp3_1 = await ensureTarea(p3.idProyecto, 'Organizar jornada de bienvenida a voluntarios', {
    idSprint: s1p3.idSprint, idRolProyecto: rCoordV.idRolProyecto,
    descripcionTarea: 'Organizar la jornada de bienvenida para los voluntarios nuevos del semestre.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.ALTA, tiempoEstimadoHoras: 10,
  }, lider.idUsuario);
  const tp3_2 = await ensureTarea(p3.idProyecto, 'Coordinar logística de eventos del semestre', {
    idSprint: s1p3.idSprint, idRolProyecto: rLog.idRolProyecto,
    descripcionTarea: 'Coordinar la logística de las jornadas de voluntariado programadas este semestre.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.ALTA, tiempoEstimadoHoras: 12,
  }, lider.idUsuario);
  const tp3_3 = await ensureTarea(p3.idProyecto, 'Diseñar materiales de difusión para campañas', {
    idSprint: s1p3.idSprint, idRolProyecto: rCom.idRolProyecto,
    descripcionTarea: 'Diseñar los materiales de difusión de las campañas de voluntariado del semestre.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.MEDIA, tiempoEstimadoHoras: 5,
  }, lider.idUsuario);
  const tp3_4 = await ensureTarea(p3.idProyecto, 'Consolidar reporte de voluntariado del semestre', {
    idSprint: s1p3.idSprint, idRolProyecto: rCom.idRolProyecto,
    descripcionTarea: 'Consolidar el reporte final de horas y participación del semestre.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.MEDIA, tiempoEstimadoHoras: 3,
  }, lider.idUsuario);

  const p3TaskIds = [tp3_1, tp3_2, tp3_3, tp3_4].map((t) => t.idTarea);
  const p3ParticipationIds = [partBeatrizP3, partCarlosP3, partLauraP3].map((p) => p.idParticipacion);

  await prisma.$transaction(async (tx) => {
    await tx.registroAvanceAsignacion.deleteMany({ where: { asignacion: { idTarea: { in: p3TaskIds } } } });
    await tx.asignacionTarea.deleteMany({ where: { idTarea: { in: p3TaskIds } } });
    await tx.horasParticipacion.deleteMany({ where: { idParticipacion: { in: p3ParticipationIds } } });

    await tx.asignacionTarea.create({ data: { idTarea: tp3_1.idTarea, idUsuario: u.beatriz.idUsuario, idParticipacion: partBeatrizP3.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-19), desasignadaEn: ts(-1), horasReales: 10, reconocidoEn: ts(-1) } });
    await tx.asignacionTarea.create({ data: { idTarea: tp3_2.idTarea, idUsuario: u.carlos.idUsuario, idParticipacion: partCarlosP3.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-19), desasignadaEn: ts(-1), horasReales: 12, reconocidoEn: ts(-1) } });
    await tx.asignacionTarea.create({ data: { idTarea: tp3_3.idTarea, idUsuario: u.laura.idUsuario, idParticipacion: partLauraP3.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-19), desasignadaEn: ts(-1), horasReales: 5, reconocidoEn: ts(-1) } });
    await tx.asignacionTarea.create({ data: { idTarea: tp3_4.idTarea, idUsuario: u.laura.idUsuario, idParticipacion: partLauraP3.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-19), desasignadaEn: ts(-1), horasReales: 1, reconocidoEn: ts(-1) } });

    // Beatriz: sin ajuste. Carlos: ajuste a la baja (con justificación). Laura: ajuste al alza (con justificación).
    await tx.horasParticipacion.create({ data: { idParticipacion: partBeatrizP3.idParticipacion, idSprint: s1p3.idSprint, periodoInicio: dateOnly(-20), periodoFin: dateOnly(-1), horasReportadas: 10, horasCalculadas: 10, horasAprobadas: 10, estadoHoras: 'PENDIENTE' } });
    await tx.horasParticipacion.create({
      data: {
        idParticipacion: partCarlosP3.idParticipacion, idSprint: s1p3.idSprint, periodoInicio: dateOnly(-20), periodoFin: dateOnly(-1), horasReportadas: 12, horasCalculadas: 12, horasAprobadas: 9, estadoHoras: 'PENDIENTE',
        justificacionAjuste: 'Se ajustaron las horas reportadas porque parte del tiempo registrado correspondía a coordinación de otro proyecto paralelo y no debía reconocerse aquí.',
      },
    });
    await tx.horasParticipacion.create({
      data: {
        idParticipacion: partLauraP3.idParticipacion, idSprint: s1p3.idSprint, periodoInicio: dateOnly(-20), periodoFin: dateOnly(-1), horasReportadas: 6, horasCalculadas: 6, horasAprobadas: 8, estadoHoras: 'PENDIENTE',
        justificacionAjuste: 'Se reconocieron horas adicionales de apoyo en la jornada de cierre que no habían quedado registradas en los tramos cerrados.',
      },
    });
  }, { timeout: 60_000 });
  console.log(`Proyecto 3 (EN_FINALIZACION) → #${p3.idProyecto} "${p3.tituloProyecto}" · Sprint #${s1p3.idSprint}`);

  // ══════════════════════════════════════════════════════════════════════
  // PROYECTO 4 — sin Sprint operable, cierre de proyecto PERMITIDO (F16)
  // ══════════════════════════════════════════════════════════════════════
  const P4_TITLE = 'Gestión de Mentorías Estudiantiles — Sprint 6 Demo';
  const p4 = await ensureProyecto(P4_TITLE, lider.idUsuario, {
    descripcionProyecto: 'Programa de mentorías entre estudiantes avanzados y estudiantes de primer ingreso.',
    objetivosProyecto: 'Acompañar a estudiantes de primer ingreso durante su primer año mediante mentores voluntarios.',
    tipoProyecto: 'ACADEMICO_EXPERIENCIA',
    estadoProyecto: EstadoProyecto.EN_PROGRESO,
    modalidadProyecto: 'VIRTUAL',
    fechaInicio: dateOnly(-45),
    fechaFinEstimada: dateOnly(-15),
  });
  const rMentoria = await ensureRol(p4.idProyecto, 'Coordinación de mentorías', 2, 'Coordina la asignación de mentores a estudiantes de primer ingreso.');
  const partBeatrizP4 = await ensureParticipacion(u.beatriz.idUsuario, rMentoria.idRolProyecto, 'ACTIVO', dateOnly(-44), null);
  const s1p4 = await ensureSprint(p4.idProyecto, 1, EstadoSprint.CERRADO, {
    fechaInicio: ts(-44),
    fechaCierre: ts(-16),
    cerradoPor: lider.idUsuario,
  });
  const tp4_1 = await ensureTarea(p4.idProyecto, 'Emparejar mentores con estudiantes de primer ingreso', {
    idSprint: s1p4.idSprint, idRolProyecto: rMentoria.idRolProyecto,
    descripcionTarea: 'Emparejar a cada estudiante de primer ingreso con un mentor de su misma carrera.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.ALTA, tiempoEstimadoHoras: 6,
  }, lider.idUsuario);
  const tp4_2 = await ensureTarea(p4.idProyecto, 'Cerrar reporte final del ciclo de mentorías', {
    idSprint: s1p4.idSprint, idRolProyecto: rMentoria.idRolProyecto,
    descripcionTarea: 'Consolidar el reporte final de participación del ciclo de mentorías.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.MEDIA, tiempoEstimadoHoras: 4,
  }, lider.idUsuario);
  await prisma.$transaction(async (tx) => {
    const ids = [tp4_1.idTarea, tp4_2.idTarea];
    await tx.asignacionTarea.deleteMany({ where: { idTarea: { in: ids } } });
    await tx.asignacionTarea.create({ data: { idTarea: tp4_1.idTarea, idUsuario: u.beatriz.idUsuario, idParticipacion: partBeatrizP4.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-44), desasignadaEn: ts(-16), horasReales: 3 } });
    await tx.asignacionTarea.create({ data: { idTarea: tp4_2.idTarea, idUsuario: u.beatriz.idUsuario, idParticipacion: partBeatrizP4.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-30), desasignadaEn: ts(-16), horasReales: 4 } });
  });
  console.log(`Proyecto 4 (cierre permitido) → #${p4.idProyecto} "${p4.tituloProyecto}"`);

  // ══════════════════════════════════════════════════════════════════════
  // PROYECTO 5 — EN_SOLICITUD_CIERRE (opcional, F16 bloque de aprobar/rechazar)
  // ══════════════════════════════════════════════════════════════════════
  const P5_TITLE = 'Laboratorio de Datos Abiertos UVG — Sprint 6 Demo';
  const p5 = await ensureProyecto(P5_TITLE, lider.idUsuario, {
    descripcionProyecto: 'Consolidación de datasets universitarios abiertos para investigación aplicada.',
    objetivosProyecto: 'Publicar un catálogo de datasets universitarios reutilizables para investigación.',
    tipoProyecto: 'ACADEMICO_EXPERIENCIA',
    estadoProyecto: EstadoProyecto.EN_SOLICITUD_CIERRE,
    modalidadProyecto: 'VIRTUAL',
    fechaInicio: dateOnly(-90),
    fechaFinEstimada: dateOnly(-20),
    fechaActualizacion: ts(-3),
  });
  const rCuraduria = await ensureRol(p5.idProyecto, 'Curaduría de datos', 2, 'Cura y documenta los datasets publicados en el catálogo.');
  const partCarlosP5 = await ensureParticipacion(u.carlos.idUsuario, rCuraduria.idRolProyecto, 'ACTIVO', dateOnly(-89), null);
  const s1p5 = await ensureSprint(p5.idProyecto, 1, EstadoSprint.CERRADO, {
    fechaInicio: ts(-89),
    fechaCierre: ts(-25),
    cerradoPor: lider.idUsuario,
  });
  const tp5_1 = await ensureTarea(p5.idProyecto, 'Publicar catálogo inicial de datasets abiertos', {
    idSprint: s1p5.idSprint, idRolProyecto: rCuraduria.idRolProyecto,
    descripcionTarea: 'Publicar el catálogo inicial de datasets abiertos disponibles para investigación.',
    estadoTarea: EstadoTarea.HECHO, prioridad: Prioridad.ALTA, tiempoEstimadoHoras: 8,
  }, lider.idUsuario);
  await prisma.$transaction(async (tx) => {
    await tx.asignacionTarea.deleteMany({ where: { idTarea: tp5_1.idTarea } });
    await tx.asignacionTarea.create({ data: { idTarea: tp5_1.idTarea, idUsuario: u.carlos.idUsuario, idParticipacion: partCarlosP5.idParticipacion, asignadoPor: lider.idUsuario, fechaAsignacion: ts(-89), desasignadaEn: ts(-25), horasReales: 8 } });
  });
  console.log(`Proyecto 5 (EN_SOLICITUD_CIERRE) → #${p5.idProyecto} "${p5.tituloProyecto}"`);

  // ── Validaciones de consistencia post-seed ──────────────────────────────
  await validar(p1.idProyecto, u, lider.idUsuario);

  console.log('\n== Sprint 6 Demo dataset ready ==');
  console.log(`Users: ${Object.keys(USERS).length}`);
  console.log('Projects: 5');
  console.log(`Demo projects:`);
  console.log(`  #${p1.idProyecto} ${p1.tituloProyecto} (EN_PROGRESO, Sprint ACTIVO)`);
  console.log(`  #${p2.idProyecto} ${p2.tituloProyecto} (EN_PROGRESO, sin Sprint)`);
  console.log(`  #${p3.idProyecto} ${p3.tituloProyecto} (EN_PROGRESO, Sprint EN_FINALIZACION)`);
  console.log(`  #${p4.idProyecto} ${p4.tituloProyecto} (EN_PROGRESO, cierre permitido)`);
  console.log(`  #${p5.idProyecto} ${p5.tituloProyecto} (EN_SOLICITUD_CIERRE)`);
}

async function validar(idProyecto: number, u: Record<UserKey, { idUsuario: number }>, liderId: number) {
  const problemas: string[] = [];

  const solPreparacion = await prisma.solicitudSalidaProyecto.findFirst({
    where: { idProyecto, idUsuario: u.diego.idUsuario, estadoSolicitud: 'PREPARACION' },
  });
  if (!solPreparacion) problemas.push('Diego no tiene una solicitud PREPARACION');

  const solPendienteLider = await prisma.solicitudSalidaProyecto.findFirst({
    where: { idProyecto, idUsuario: u.estefania.idUsuario, estadoSolicitud: 'PENDIENTE_LIDER' },
  });
  if (!solPendienteLider) problemas.push('Estefanía no tiene una solicitud PENDIENTE_LIDER');

  const fernandoContribucion = await prisma.asignacionTarea.count({
    where: { idUsuario: u.fernando.idUsuario, horasReales: { not: null }, tarea: { idProyecto } },
  });
  if (fernandoContribucion === 0) problemas.push('Fernando no tiene contribución (AsignacionTarea.horasReales)');

  const gabrielaContribucion = await prisma.asignacionTarea.count({
    where: { idUsuario: u.gabriela.idUsuario, horasReales: { not: null }, tarea: { idProyecto } },
  });
  if (gabrielaContribucion > 0) problemas.push('Gabriela tiene contribución y debería caer en RETIRADOS_SIN_CONTRIBUCION');

  const activasPorTarea = await prisma.asignacionTarea.groupBy({
    by: ['idTarea'],
    where: { tarea: { idProyecto }, desasignadaEn: null },
    _count: { idAsignacion: true },
  });
  for (const g of activasPorTarea) if (g._count.idAsignacion > 1) problemas.push(`Tarea ${g.idTarea} con ${g._count.idAsignacion} asignaciones activas`);

  const porEstado = await prisma.tarea.groupBy({
    by: ['estadoTarea'],
    where: { idProyecto, idSprint: (await prisma.sprint.findFirstOrThrow({ where: { idProyecto, estado: 'ACTIVO' } })).idSprint },
    _count: { idTarea: true },
  });
  const conteo = Object.fromEntries(porEstado.map((g) => [g.estadoTarea, g._count.idTarea]));
  const esperado = { POR_HACER: 3, EN_PROGRESO: 3, EN_REVISION: 2, HECHO: 2 };
  for (const [estado, n] of Object.entries(esperado)) if ((conteo[estado] ?? 0) !== n) problemas.push(`Kanban Sprint activo ${estado}: ${conteo[estado] ?? 0} (esperado ${n})`);

  if (problemas.length) abort(`Validación fallida:\n  - ${problemas.join('\n  - ')}`);
  console.log(`\nValidación OK · Kanban Sprint activo: POR_HACER=${conteo.POR_HACER} EN_PROGRESO=${conteo.EN_PROGRESO} EN_REVISION=${conteo.EN_REVISION} HECHO=${conteo.HECHO}`);
  void liderId;
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
