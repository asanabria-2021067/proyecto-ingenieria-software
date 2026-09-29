import { PrismaClient, Prisma, type TipoNotificacion, type ModalidadEvento } from '@prisma/client';
import { hashSync } from 'bcryptjs';

const prisma = new PrismaClient();

/** Igual que en seed.ts: fecha relativa a "ahora" para que el contenido de
 * demo (tareas, eventos) no termine mostrando fechas pasadas sin importar
 * cuándo se corra este script. */
function enDias(n: number): Date {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + n);
  fecha.setHours(0, 0, 0, 0);
  return fecha;
}

function enDiasHora(n: number, hora: number, minuto = 0): Date {
  const fecha = enDias(n);
  fecha.setHours(hora, minuto, 0, 0);
  return fecha;
}

/** Mismo criterio que resolveSeedSprint en seed.ts: nunca crea un segundo
 * Sprint operable para el mismo proyecto (violaría sprint_operable_unique).
 */
async function resolveSprint(idProyecto: number, numero: number) {
  const existente = await prisma.sprint.findFirst({
    where: { idProyecto, estado: { in: ['ACTIVO', 'EN_FINALIZACION'] } },
  });
  if (existente) return existente;
  return prisma.sprint.create({ data: { idProyecto, numero, estado: 'ACTIVO' } });
}

async function ensureTarea(data: {
  idProyecto: number;
  idSprint: number;
  tituloTarea: string;
  estadoTarea: 'POR_HACER' | 'EN_PROGRESO' | 'EN_REVISION' | 'HECHO';
  prioridad: 'BAJA' | 'MEDIA' | 'ALTA';
  creadaPor: number;
  idRolProyecto?: number;
  fechaLimite?: Date;
}) {
  const existente = await prisma.tarea.findFirst({
    where: { idProyecto: data.idProyecto, tituloTarea: data.tituloTarea },
  });
  if (existente) return existente;
  return prisma.tarea.create({ data });
}

async function ensureAsignacion(idTarea: number, idUsuario: number, asignadoPor: number) {
  const existente = await prisma.asignacionTarea.findFirst({
    where: { idTarea, idUsuario, desasignadaEn: null },
  });
  if (existente) return existente;
  return prisma.asignacionTarea.create({ data: { idTarea, idUsuario, asignadoPor } });
}

async function ensureEvento(data: {
  idProyecto: number;
  idCreador: number;
  tituloEvento: string;
  descripcionEvento?: string;
  fechaInicio: Date;
  fechaFin: Date;
  modalidad: ModalidadEvento;
  ubicacionLat?: number;
  ubicacionLng?: number;
  ubicacionNombre?: string;
  linkSesion?: string;
  rolesDestino?: number[];
}) {
  const existente = await prisma.eventoProyecto.findFirst({
    where: { idProyecto: data.idProyecto, tituloEvento: data.tituloEvento },
  });
  if (existente) return existente;
  return prisma.eventoProyecto.create({ data });
}

async function ensureNotificacion(data: {
  idUsuario: number;
  tipoNotificacion: TipoNotificacion;
  tituloNotificacion: string;
  mensajeNotificacion: string;
  datosJson?: Prisma.InputJsonValue;
  leidaEn?: Date;
}) {
  const existente = await prisma.notificacion.findFirst({
    where: { idUsuario: data.idUsuario, tituloNotificacion: data.tituloNotificacion, mensajeNotificacion: data.mensajeNotificacion },
  });
  if (existente) return existente;
  return prisma.notificacion.create({ data });
}

async function ensurePostulacion(data: {
  idUsuarioPostulante: number;
  idRolProyecto: number;
  justificacion: string;
  estadoPostulacion?: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA';
}) {
  const existente = await prisma.postulacion.findFirst({
    where: { idUsuarioPostulante: data.idUsuarioPostulante, idRolProyecto: data.idRolProyecto },
  });
  if (existente) return existente;
  return prisma.postulacion.create({ data });
}

async function ensureConversacion(idProyecto: number, creadaPor: number, participantes: number[]) {
  const candidatas = await prisma.conversacion.findMany({
    where: { idProyecto, tipo: 'INDIVIDUAL', creadaPor },
    include: { participantes: true },
  });
  const set = new Set(participantes);
  const existente = candidatas.find(
    (c) => c.participantes.length === set.size && c.participantes.every((p) => set.has(p.idUsuario)),
  );
  if (existente) return existente;
  const conv = await prisma.conversacion.create({ data: { idProyecto, tipo: 'INDIVIDUAL', creadaPor } });
  await Promise.all(
    participantes.map((idUsuario) =>
      prisma.conversacionParticipante.create({ data: { idConversacion: conv.idConversacion, idUsuario } }),
    ),
  );
  return conv;
}

async function ensureMensaje(idConversacion: number, idRemitente: number, contenido: string) {
  const existente = await prisma.mensajeChat.findFirst({ where: { idConversacion, idRemitente, contenido } });
  if (existente) return existente;
  return prisma.mensajeChat.create({ data: { idConversacion, idRemitente, contenido } });
}

async function ensureProyecto(data: {
  tituloProyecto: string;
  descripcionProyecto: string;
  tipoProyecto: 'ACADEMICO_EXPERIENCIA' | 'ACADEMICO_HORAS_BECA' | 'EXTRACURRICULAR_EXTENSION';
  estadoProyecto: 'PUBLICADO' | 'EN_PROGRESO';
  creadoPor: number;
  fechaInicio: Date;
  fechaFinEstimada: Date;
}) {
  const existente = await prisma.proyecto.findFirst({ where: { tituloProyecto: data.tituloProyecto } });
  if (existente) return existente;
  return prisma.proyecto.create({ data });
}

async function ensureRolProyecto(data: { idProyecto: number; nombreRol: string; descripcionRolProyecto?: string; cupos: number }) {
  const existente = await prisma.rolProyecto.findFirst({ where: { idProyecto: data.idProyecto, nombreRol: data.nombreRol } });
  if (existente) return existente;
  return prisma.rolProyecto.create({ data });
}

/** Amistad.@@unique es direccional (solicitante, receptor); una amistad ya
 * aceptada en cualquier sentido cuenta como existente. */
async function ensureAmistad(idA: number, idB: number) {
  const existente = await prisma.amistad.findFirst({
    where: {
      OR: [
        { idUsuarioSolicitante: idA, idUsuarioReceptor: idB },
        { idUsuarioSolicitante: idB, idUsuarioReceptor: idA },
      ],
    },
  });
  if (existente) {
    if (existente.estado !== 'ACEPTADA') {
      return prisma.amistad.update({ where: { idAmistad: existente.idAmistad }, data: { estado: 'ACEPTADA', fechaResolucion: new Date() } });
    }
    return existente;
  }
  return prisma.amistad.create({
    data: { idUsuarioSolicitante: idA, idUsuarioReceptor: idB, estado: 'ACEPTADA', fechaResolucion: new Date() },
  });
}

/** Crea un Sprint YA CERRADO con su propio set de tareas terminadas/arrastradas
 * y una serie diaria de instantaneas (fuente real del burndown, T-238) que
 * baja desde el total planificado hasta lo que de verdad quedo sin terminar.
 * Replica a mano las mismas formulas de calcularCongeladoDeCierreTx
 * (sprints.service.ts) para que los datos congelados sean consistentes con
 * lo que el propio cierre real habria calculado. */
async function ensureClosedSprintWithBurndown(params: {
  idProyecto: number;
  numero: number;
  diasInicio: number;
  diasFin: number;
  tareas: { titulo: string; puntos: number; hecha: boolean; creadaPor: number; asignadoA?: number }[];
}) {
  const existente = await prisma.sprint.findFirst({ where: { idProyecto: params.idProyecto, numero: params.numero } });
  if (existente) return existente;

  const fechaInicio = enDias(params.diasInicio);
  const fechaCierre = enDias(params.diasFin);
  const planificadas = params.tareas.length;
  const completadas = params.tareas.filter((t) => t.hecha).length;
  const arrastradas = planificadas - completadas;
  const porcentaje = planificadas === 0 ? 0 : Math.round((completadas / planificadas) * 100);
  const puntosPlanificados = params.tareas.reduce((acc, t) => acc + t.puntos, 0);
  const puntosCompletados = params.tareas.filter((t) => t.hecha).reduce((acc, t) => acc + t.puntos, 0);

  const sprint = await prisma.sprint.create({
    data: {
      idProyecto: params.idProyecto,
      numero: params.numero,
      estado: 'CERRADO',
      fechaInicio,
      fechaFinPlaneada: fechaCierre,
      fechaCierre,
      tareasPlanificadasCierre: planificadas,
      tareasCompletadasCierre: completadas,
      tareasArrastradasCierre: arrastradas,
      hitosTotalesCierre: 0,
      hitosCompletadosCierre: 0,
      porcentajeCumplimientoCierre: porcentaje,
      puntosHistoriaPlanificadosCierre: puntosPlanificados,
      puntosHistoriaCompletadosCierre: puntosCompletados,
    },
  });

  for (const t of params.tareas) {
    const tarea = await prisma.tarea.create({
      data: {
        idProyecto: params.idProyecto,
        idSprint: sprint.idSprint,
        tituloTarea: t.titulo,
        estadoTarea: t.hecha ? 'HECHO' : 'POR_HACER',
        prioridad: 'MEDIA',
        puntosHistoria: t.puntos,
        creadaPor: t.creadaPor,
        fechaLimite: fechaCierre,
      },
    });
    if (t.asignadoA) {
      await prisma.asignacionTarea.create({ data: { idTarea: tarea.idTarea, idUsuario: t.asignadoA, asignadoPor: t.creadaPor } });
    }
  }

  // Serie diaria de instantaneas: escalera decreciente realista (T-238),
  // terminando exactamente en lo que quedo pendiente al cierre (arrastradas).
  const duracionDias = Math.max(1, params.diasFin - params.diasInicio);
  const pasos = Math.min(duracionDias, 9);
  for (let i = 0; i <= pasos; i++) {
    const progreso = i / pasos;
    const tareasCompletadasAlDia = Math.min(completadas, Math.round(progreso * completadas));
    const puntosRestantesAlDia =
      i === pasos
        ? puntosPlanificados - puntosCompletados
        : Math.max(
            puntosPlanificados - puntosCompletados,
            Math.round(puntosPlanificados * (1 - progreso) * 0.97 ** i),
          );
    const dia = new Date(fechaInicio);
    dia.setDate(dia.getDate() + Math.round((i / pasos) * duracionDias));
    await prisma.instantaneaSprint.upsert({
      where: { idSprint_fecha: { idSprint: sprint.idSprint, fecha: dia } },
      update: {},
      create: {
        idSprint: sprint.idSprint,
        fecha: dia,
        tareasPendientes: planificadas - tareasCompletadasAlDia,
        tareasCompletadas: tareasCompletadasAlDia,
        puntosHistoriaRestantes: puntosRestantesAlDia,
      },
    });
  }

  return sprint;
}

async function main() {
  const usuario = (correo: string) => prisma.usuario.findUniqueOrThrow({ where: { correo } });

  const [angel, carlos, maria, jose, ana, luis, sofia, fernando, camila, vernel] = await Promise.all([
    usuario('san24725@uvg.edu.gt'),
    usuario('carlos.mendoza@uvg.edu.gt'),
    usuario('maria.lopez@uvg.edu.gt'),
    usuario('jose.ramirez@uvg.edu.gt'),
    usuario('ana.garcia@uvg.edu.gt'),
    usuario('luis.hernandez@uvg.edu.gt'),
    usuario('sofia.martinez@uvg.edu.gt'),
    usuario('fernando.castaneda@uvg.edu.gt'),
    usuario('camila.rodriguez@uvg.edu.gt'),
    usuario('vernel@uvg.edu.gt'),
  ]);

  // ─── Reafirma la contraseña de las cuentas de demo ───────────────────────
  // seed.ts crea estas dos cuentas con upsert({ update: {} }): la primera vez
  // que corre fija la contraseña, pero en corridas posteriores (o si alguien
  // la cambio a mano probando "olvide mi contraseña") update:{} nunca la
  // vuelve a tocar. Sin este bloque, un reset de contraseña real deja a
  // san24725/vernel sin poder entrar con la clave de demo documentada.
  const TEST_HASH = hashSync('12345678', 10);
  await prisma.usuario.update({ where: { idUsuario: angel.idUsuario }, data: { contrasena: TEST_HASH, estado: 'ACTIVO' } });
  await prisma.usuario.update({ where: { idUsuario: vernel.idUsuario }, data: { contrasena: TEST_HASH, estado: 'ACTIVO' } });

  // Proyectos de Angel (10-13, ver seed.ts) y otros dos usados para chats/guardados.
  const [pGestionAcademica, pSaludMental, pELearning, pDashboardDeportivo] = await Promise.all([
    prisma.proyecto.findUniqueOrThrow({ where: { idProyecto: 10 } }),
    prisma.proyecto.findUniqueOrThrow({ where: { idProyecto: 11 } }),
    prisma.proyecto.findUniqueOrThrow({ where: { idProyecto: 12 } }),
    prisma.proyecto.findUniqueOrThrow({ where: { idProyecto: 13 } }),
  ]);
  const pTutorias = await prisma.proyecto.findUniqueOrThrow({ where: { idProyecto: 1 } });
  const pAmbiental = await prisma.proyecto.findUniqueOrThrow({ where: { idProyecto: 2 } });
  const pNeural = await prisma.proyecto.findUniqueOrThrow({ where: { idProyecto: 3 } });
  const pHackathon = await prisma.proyecto.findUniqueOrThrow({ where: { idProyecto: 18 } });

  // ─── Sprints + tareas + asignaciones para los 4 proyectos de Angel ───────
  const [sprintGestion, sprintSalud, sprintELearning, sprintDeportivo] = await Promise.all([
    resolveSprint(pGestionAcademica.idProyecto, 1),
    resolveSprint(pSaludMental.idProyecto, 1),
    resolveSprint(pELearning.idProyecto, 1),
    resolveSprint(pDashboardDeportivo.idProyecto, 1),
  ]);

  const tareaGestion1 = await ensureTarea({
    idProyecto: pGestionAcademica.idProyecto, idSprint: sprintGestion.idSprint,
    tituloTarea: 'Diseñar modelo de datos de cursos', estadoTarea: 'HECHO', prioridad: 'ALTA', creadaPor: angel.idUsuario,
  });
  const tareaGestion2 = await ensureTarea({
    idProyecto: pGestionAcademica.idProyecto, idSprint: sprintGestion.idSprint,
    tituloTarea: 'Implementar registro de calificaciones', estadoTarea: 'EN_PROGRESO', prioridad: 'ALTA', creadaPor: angel.idUsuario, fechaLimite: enDias(4),
  });
  const tareaGestion3 = await ensureTarea({
    idProyecto: pGestionAcademica.idProyecto, idSprint: sprintGestion.idSprint,
    tituloTarea: 'Maquetar panel de cursos activos', estadoTarea: 'POR_HACER', prioridad: 'MEDIA', creadaPor: angel.idUsuario, fechaLimite: enDias(9),
  });
  await ensureAsignacion(tareaGestion1.idTarea, angel.idUsuario, angel.idUsuario);
  await ensureAsignacion(tareaGestion2.idTarea, angel.idUsuario, angel.idUsuario);
  await ensureAsignacion(tareaGestion3.idTarea, maria.idUsuario, angel.idUsuario);

  const tareaSalud1 = await ensureTarea({
    idProyecto: pSaludMental.idProyecto, idSprint: sprintSalud.idSprint,
    tituloTarea: 'Prototipo de check-in emocional diario', estadoTarea: 'EN_REVISION', prioridad: 'ALTA', creadaPor: angel.idUsuario,
  });
  const tareaSalud2 = await ensureTarea({
    idProyecto: pSaludMental.idProyecto, idSprint: sprintSalud.idSprint,
    tituloTarea: 'Integrar notificaciones push de recordatorio', estadoTarea: 'POR_HACER', prioridad: 'MEDIA', creadaPor: angel.idUsuario, fechaLimite: enDias(12),
  });
  const tareaSalud3 = await ensureTarea({
    idProyecto: pSaludMental.idProyecto, idSprint: sprintSalud.idSprint,
    tituloTarea: 'Investigar librerías de gráficas de ánimo', estadoTarea: 'HECHO', prioridad: 'BAJA', creadaPor: jose.idUsuario,
  });
  await ensureAsignacion(tareaSalud1.idTarea, ana.idUsuario, angel.idUsuario);
  await ensureAsignacion(tareaSalud2.idTarea, jose.idUsuario, angel.idUsuario);
  await ensureAsignacion(tareaSalud3.idTarea, jose.idUsuario, angel.idUsuario);

  const tareaELearning1 = await ensureTarea({
    idProyecto: pELearning.idProyecto, idSprint: sprintELearning.idSprint,
    tituloTarea: 'Motor de evaluaciones automáticas', estadoTarea: 'EN_PROGRESO', prioridad: 'ALTA', creadaPor: luis.idUsuario, fechaLimite: enDias(6),
  });
  const tareaELearning2 = await ensureTarea({
    idProyecto: pELearning.idProyecto, idSprint: sprintELearning.idSprint,
    tituloTarea: 'Configurar pipeline de despliegue', estadoTarea: 'POR_HACER', prioridad: 'MEDIA', creadaPor: angel.idUsuario,
  });
  const tareaELearning3 = await ensureTarea({
    idProyecto: pELearning.idProyecto, idSprint: sprintELearning.idSprint,
    tituloTarea: 'Grabar video de bienvenida al curso demo', estadoTarea: 'HECHO', prioridad: 'BAJA', creadaPor: angel.idUsuario,
  });
  await ensureAsignacion(tareaELearning1.idTarea, luis.idUsuario, angel.idUsuario);
  await ensureAsignacion(tareaELearning2.idTarea, luis.idUsuario, angel.idUsuario);
  await ensureAsignacion(tareaELearning3.idTarea, angel.idUsuario, angel.idUsuario);

  const tareaDeportivo1 = await ensureTarea({
    idProyecto: pDashboardDeportivo.idProyecto, idSprint: sprintDeportivo.idSprint,
    tituloTarea: 'Limpiar dataset histórico de partidos', estadoTarea: 'HECHO', prioridad: 'MEDIA', creadaPor: angel.idUsuario,
  });
  const tareaDeportivo2 = await ensureTarea({
    idProyecto: pDashboardDeportivo.idProyecto, idSprint: sprintDeportivo.idSprint,
    tituloTarea: 'Gráfica de rendimiento por equipo', estadoTarea: 'EN_PROGRESO', prioridad: 'ALTA', creadaPor: angel.idUsuario, fechaLimite: enDias(2),
  });
  await ensureTarea({
    idProyecto: pDashboardDeportivo.idProyecto, idSprint: sprintDeportivo.idSprint,
    tituloTarea: 'Exportar reporte mensual a PDF', estadoTarea: 'POR_HACER', prioridad: 'BAJA', creadaPor: angel.idUsuario, fechaLimite: enDias(15),
  });
  await ensureAsignacion(tareaDeportivo1.idTarea, sofia.idUsuario, angel.idUsuario);
  await ensureAsignacion(tareaDeportivo2.idTarea, sofia.idUsuario, angel.idUsuario);

  // ─── Eventos de calendario: variedad de modalidades (T-263 + modalidad nueva) ─
  await ensureEvento({
    idProyecto: pGestionAcademica.idProyecto, idCreador: angel.idUsuario,
    tituloEvento: 'Kickoff con el equipo de Gestión Académica', descripcionEvento: 'Alineación de alcance y roles del sprint 1.',
    fechaInicio: enDiasHora(1, 9, 0), fechaFin: enDiasHora(1, 10, 0), modalidad: 'PRESENCIAL',
    ubicacionLat: 14.5915, ubicacionLng: -90.5138, ubicacionNombre: 'Universidad del Valle de Guatemala, Edificio T',
  });
  await ensureEvento({
    idProyecto: pGestionAcademica.idProyecto, idCreador: angel.idUsuario,
    tituloEvento: 'Demo de registro de calificaciones', descripcionEvento: 'Presentación del avance a stakeholders.',
    fechaInicio: enDiasHora(5, 14, 0), fechaFin: enDiasHora(5, 15, 0), modalidad: 'VIRTUAL',
    linkSesion: 'https://meet.google.com/gestion-academica-demo',
  });
  await ensureEvento({
    idProyecto: pSaludMental.idProyecto, idCreador: angel.idUsuario,
    tituloEvento: 'Revisión de diseño UX con mentoría', descripcionEvento: 'Sesión híbrida: parte del equipo asiste presencial.',
    fechaInicio: enDiasHora(3, 11, 0), fechaFin: enDiasHora(3, 12, 30), modalidad: 'MIXTA',
    ubicacionLat: 14.5915, ubicacionLng: -90.5138, ubicacionNombre: 'Universidad del Valle de Guatemala, Biblioteca',
    linkSesion: 'https://meet.google.com/salud-mental-ux',
  });
  await ensureEvento({
    idProyecto: pELearning.idProyecto, idCreador: luis.idUsuario,
    tituloEvento: 'Planificación de evaluaciones automáticas', descripcionEvento: 'Solo para el equipo de desarrollo.',
    fechaInicio: enDiasHora(4, 16, 0), fechaFin: enDiasHora(4, 17, 0), modalidad: 'VIRTUAL',
    linkSesion: 'https://meet.google.com/elearning-planning', rolesDestino: [12],
  });
  await ensureEvento({
    idProyecto: pDashboardDeportivo.idProyecto, idCreador: angel.idUsuario,
    tituloEvento: 'Entrega de dashboard a comité deportivo', descripcionEvento: 'Presentación final del proyecto.',
    fechaInicio: enDiasHora(10, 10, 0), fechaFin: enDiasHora(10, 11, 0), modalidad: 'PRESENCIAL',
    ubicacionLat: 14.5915, ubicacionLng: -90.5138, ubicacionNombre: 'Universidad del Valle de Guatemala, Auditorio',
  });

  // ─── Postulaciones pendientes a roles vacantes de Angel (DevOps y Frontend) ─
  await ensurePostulacion({
    idUsuarioPostulante: fernando.idUsuario, idRolProyecto: 13,
    justificacion: 'He trabajado con Docker y pipelines de CI/CD en proyectos de curso.',
  });
  await ensurePostulacion({
    idUsuarioPostulante: camila.idUsuario, idRolProyecto: 15,
    justificacion: 'Tengo experiencia armando visualizaciones de datos con React.',
  });

  // ─── Notificaciones adicionales (bandeja más rica para la demo) ──────────
  await ensureNotificacion({
    idUsuario: angel.idUsuario, tipoNotificacion: 'NUEVA_POSTULACION',
    tituloNotificacion: 'Nueva postulación recibida',
    mensajeNotificacion: `${fernando.nombre} ${fernando.apellido} se postuló para el rol "DevOps Engineer" en tu proyecto "${pELearning.tituloProyecto}".`,
    datosJson: { projectId: pELearning.idProyecto },
  });
  await ensureNotificacion({
    idUsuario: angel.idUsuario, tipoNotificacion: 'NUEVA_POSTULACION',
    tituloNotificacion: 'Nueva postulación recibida',
    mensajeNotificacion: `${camila.nombre} ${camila.apellido} se postuló para el rol "Frontend Developer" en tu proyecto "${pDashboardDeportivo.tituloProyecto}".`,
    datosJson: { projectId: pDashboardDeportivo.idProyecto },
  });
  await ensureNotificacion({
    idUsuario: maria.idUsuario, tipoNotificacion: 'TAREA_ASIGNADA',
    tituloNotificacion: 'Nueva tarea asignada',
    mensajeNotificacion: 'Se te asignó la tarea "Maquetar panel de cursos activos".',
    datosJson: { projectId: pGestionAcademica.idProyecto }, leidaEn: new Date(),
  });
  await ensureNotificacion({
    idUsuario: jose.idUsuario, tipoNotificacion: 'TAREA_ASIGNADA',
    tituloNotificacion: 'Nueva tarea asignada',
    mensajeNotificacion: 'Se te asignó la tarea "Integrar notificaciones push de recordatorio".',
    datosJson: { projectId: pSaludMental.idProyecto },
  });
  await ensureNotificacion({
    idUsuario: luis.idUsuario, tipoNotificacion: 'TAREA_ASIGNADA',
    tituloNotificacion: 'Nueva tarea asignada',
    mensajeNotificacion: 'Se te asignó la tarea "Motor de evaluaciones automáticas".',
    datosJson: { projectId: pELearning.idProyecto },
  });
  await ensureNotificacion({
    idUsuario: sofia.idUsuario, tipoNotificacion: 'TAREA_ASIGNADA',
    tituloNotificacion: 'Nueva tarea asignada',
    mensajeNotificacion: 'Se te asignó la tarea "Gráfica de rendimiento por equipo".',
    datosJson: { projectId: pDashboardDeportivo.idProyecto },
  });
  await ensureNotificacion({
    idUsuario: angel.idUsuario, tipoNotificacion: 'PROYECTO_ACTUALIZADO',
    tituloNotificacion: 'Recordatorio de evento',
    mensajeNotificacion: `Tienes "Kickoff con el equipo de Gestión Académica" mañana a las 9:00 am.`,
    datosJson: { projectId: pGestionAcademica.idProyecto }, leidaEn: new Date(),
  });

  // ─── Chats: una conversación activa más y una archivada más ──────────────
  const convGestion = await ensureConversacion(pGestionAcademica.idProyecto, angel.idUsuario, [angel.idUsuario, maria.idUsuario]);
  await ensureMensaje(convGestion.idConversacion, angel.idUsuario, '¿Cómo va el registro de calificaciones? Lo necesitamos para el demo del viernes.');
  await ensureMensaje(convGestion.idConversacion, maria.idUsuario, 'Voy bien, ya tengo el CRUD base. Le falta la validación de notas fuera de rango.');
  await ensureMensaje(convGestion.idConversacion, angel.idUsuario, 'Perfecto, avísame cuando esté listo para probarlo.');

  // pHackathon (idProyecto 18) ya está CERRADO en seed.ts: conversación entre
  // José (creador) y Angel, archivada explícitamente para el demo de T-234.
  const convHackathon = await ensureConversacion(pHackathon.idProyecto, jose.idUsuario, [jose.idUsuario, angel.idUsuario]);
  await ensureMensaje(convHackathon.idConversacion, jose.idUsuario, '¡Gracias por participar en el hackathon! Quedó un proyecto muy sólido.');
  await ensureMensaje(convHackathon.idConversacion, angel.idUsuario, 'Coincido, fue una gran experiencia. Esperemos que se pueda repetir el próximo semestre.');
  if (!convHackathon.archivadaEn) {
    await prisma.conversacion.update({ where: { idConversacion: convHackathon.idConversacion }, data: { archivadaEn: new Date() } });
  }

  // ─── Proyectos guardados (bookmarks) para Angel ──────────────────────────
  for (const idProyecto of [pTutorias.idProyecto, pAmbiental.idProyecto, pNeural.idProyecto]) {
    await prisma.proyectoGuardado.upsert({
      where: { idUsuario_idProyecto: { idUsuario: angel.idUsuario, idProyecto } },
      update: {},
      create: { idUsuario: angel.idUsuario, idProyecto },
    });
  }
  // Carlos también guarda uno de los proyectos de Angel.
  await prisma.proyectoGuardado.upsert({
    where: { idUsuario_idProyecto: { idUsuario: carlos.idUsuario, idProyecto: pELearning.idProyecto } },
    update: {},
    create: { idUsuario: carlos.idUsuario, idProyecto: pELearning.idProyecto },
  });

  // ─── Semilla enriquecida para Vernel (segunda cuenta de demo) ────────────
  const pReservas = await ensureProyecto({
    tituloProyecto: 'Sistema de Reservas de Laboratorios',
    descripcionProyecto: 'Plataforma para reservar cubículos y laboratorios del CIT por horario, evitando choques y listas de espera en papel.',
    tipoProyecto: 'ACADEMICO_HORAS_BECA',
    estadoProyecto: 'PUBLICADO',
    creadoPor: vernel.idUsuario,
    fechaInicio: enDias(-20),
    fechaFinEstimada: enDias(120),
  });
  const pApoyoPares = await ensureProyecto({
    tituloProyecto: 'Red de Apoyo entre Pares - Bienestar',
    descripcionProyecto: 'Conecta estudiantes voluntarios capacitados con compañeros que buscan apoyo académico o emocional durante el semestre.',
    tipoProyecto: 'EXTRACURRICULAR_EXTENSION',
    estadoProyecto: 'EN_PROGRESO',
    creadoPor: vernel.idUsuario,
    fechaInicio: enDias(-45),
    fechaFinEstimada: enDias(90),
  });

  const rolReservasBackend = await ensureRolProyecto({ idProyecto: pReservas.idProyecto, nombreRol: 'Backend Developer', descripcionRolProyecto: 'API de disponibilidad y reservas', cupos: 2 });
  await ensureRolProyecto({ idProyecto: pReservas.idProyecto, nombreRol: 'Frontend Developer', descripcionRolProyecto: 'Calendario de reservas', cupos: 2 });
  const rolApoyoCoordinador = await ensureRolProyecto({ idProyecto: pApoyoPares.idProyecto, nombreRol: 'Coordinador de Voluntarios', descripcionRolProyecto: 'Capacitación y asignación de pares', cupos: 1 });
  await ensureRolProyecto({ idProyecto: pApoyoPares.idProyecto, nombreRol: 'Desarrollador Web', descripcionRolProyecto: 'Formulario de solicitud y match', cupos: 1 });

  const [sprintReservas, sprintApoyo] = await Promise.all([
    resolveSprint(pReservas.idProyecto, 1),
    resolveSprint(pApoyoPares.idProyecto, 1),
  ]);

  const tareaReservas1 = await ensureTarea({
    idProyecto: pReservas.idProyecto, idSprint: sprintReservas.idSprint,
    tituloTarea: 'Modelar disponibilidad de cubículos por horario', estadoTarea: 'HECHO', prioridad: 'ALTA', creadaPor: vernel.idUsuario,
  });
  const tareaReservas2 = await ensureTarea({
    idProyecto: pReservas.idProyecto, idSprint: sprintReservas.idSprint,
    tituloTarea: 'Endpoint de creación y cancelación de reservas', estadoTarea: 'EN_PROGRESO', prioridad: 'ALTA', creadaPor: vernel.idUsuario, fechaLimite: enDias(3),
  });
  const tareaReservas3 = await ensureTarea({
    idProyecto: pReservas.idProyecto, idSprint: sprintReservas.idSprint,
    tituloTarea: 'Calendario semanal de disponibilidad', estadoTarea: 'POR_HACER', prioridad: 'MEDIA', creadaPor: vernel.idUsuario, fechaLimite: enDias(8),
    idRolProyecto: rolReservasBackend.idRolProyecto,
  });
  await ensureAsignacion(tareaReservas1.idTarea, vernel.idUsuario, vernel.idUsuario);
  await ensureAsignacion(tareaReservas2.idTarea, vernel.idUsuario, vernel.idUsuario);
  await ensureAsignacion(tareaReservas3.idTarea, carlos.idUsuario, vernel.idUsuario);

  const tareaApoyo1 = await ensureTarea({
    idProyecto: pApoyoPares.idProyecto, idSprint: sprintApoyo.idSprint,
    tituloTarea: 'Diseñar guía de capacitación para pares voluntarios', estadoTarea: 'HECHO', prioridad: 'ALTA', creadaPor: vernel.idUsuario,
  });
  const tareaApoyo2 = await ensureTarea({
    idProyecto: pApoyoPares.idProyecto, idSprint: sprintApoyo.idSprint,
    tituloTarea: 'Formulario de solicitud de apoyo', estadoTarea: 'EN_REVISION', prioridad: 'MEDIA', creadaPor: vernel.idUsuario,
  });
  const tareaApoyo3 = await ensureTarea({
    idProyecto: pApoyoPares.idProyecto, idSprint: sprintApoyo.idSprint,
    tituloTarea: 'Algoritmo simple de match por carrera e intereses', estadoTarea: 'POR_HACER', prioridad: 'MEDIA', creadaPor: vernel.idUsuario, fechaLimite: enDias(10),
    idRolProyecto: rolApoyoCoordinador.idRolProyecto,
  });
  await ensureAsignacion(tareaApoyo1.idTarea, vernel.idUsuario, vernel.idUsuario);
  await ensureAsignacion(tareaApoyo2.idTarea, sofia.idUsuario, vernel.idUsuario);
  await ensureAsignacion(tareaApoyo3.idTarea, ana.idUsuario, vernel.idUsuario);

  await ensureEvento({
    idProyecto: pReservas.idProyecto, idCreador: vernel.idUsuario,
    tituloEvento: 'Revisión semanal del sprint de reservas', descripcionEvento: 'Repaso de avance y bloqueos del equipo.',
    fechaInicio: enDiasHora(2, 15, 0), fechaFin: enDiasHora(2, 16, 0), modalidad: 'VIRTUAL',
    linkSesion: 'https://meet.google.com/reservas-labs-standup',
  });
  await ensureEvento({
    idProyecto: pReservas.idProyecto, idCreador: vernel.idUsuario,
    tituloEvento: 'Prueba piloto en laboratorio CIT 302', descripcionEvento: 'Validación con usuarios reales del flujo de reserva.',
    fechaInicio: enDiasHora(7, 10, 0), fechaFin: enDiasHora(7, 11, 30), modalidad: 'PRESENCIAL',
    ubicacionLat: 14.5915, ubicacionLng: -90.5138, ubicacionNombre: 'Universidad del Valle de Guatemala, Laboratorio CIT 302',
  });
  await ensureEvento({
    idProyecto: pApoyoPares.idProyecto, idCreador: vernel.idUsuario,
    tituloEvento: 'Capacitación de nuevos voluntarios', descripcionEvento: 'Sesión híbrida: algunos voluntarios se conectan de otras sedes.',
    fechaInicio: enDiasHora(4, 17, 0), fechaFin: enDiasHora(4, 18, 30), modalidad: 'MIXTA',
    ubicacionLat: 14.5915, ubicacionLng: -90.5138, ubicacionNombre: 'Universidad del Valle de Guatemala, Sala de Bienestar Estudiantil',
    linkSesion: 'https://meet.google.com/apoyo-pares-capacitacion',
  });

  await ensurePostulacion({
    idUsuarioPostulante: fernando.idUsuario, idRolProyecto: rolReservasBackend.idRolProyecto,
    justificacion: 'Tengo experiencia con NestJS y modelado de disponibilidad por horario.',
  });
  await ensurePostulacion({
    idUsuarioPostulante: jose.idUsuario, idRolProyecto: rolApoyoCoordinador.idRolProyecto,
    justificacion: 'He sido monitor de curso y me interesa coordinar el programa de pares.',
    estadoPostulacion: 'ACEPTADA',
  });

  await ensureNotificacion({
    idUsuario: vernel.idUsuario, tipoNotificacion: 'NUEVA_POSTULACION',
    tituloNotificacion: 'Nueva postulación recibida',
    mensajeNotificacion: `${fernando.nombre} ${fernando.apellido} se postuló para el rol "Backend Developer" en tu proyecto "${pReservas.tituloProyecto}".`,
    datosJson: { projectId: pReservas.idProyecto },
  });
  await ensureNotificacion({
    idUsuario: vernel.idUsuario, tipoNotificacion: 'POSTULACION_RESUELTA',
    tituloNotificacion: 'Postulación aceptada',
    mensajeNotificacion: `Aceptaste a ${jose.nombre} ${jose.apellido} como Coordinador de Voluntarios en "${pApoyoPares.tituloProyecto}".`,
    datosJson: { projectId: pApoyoPares.idProyecto }, leidaEn: new Date(),
  });
  await ensureNotificacion({
    idUsuario: vernel.idUsuario, tipoNotificacion: 'TAREA_ACTUALIZADA',
    tituloNotificacion: 'Tarea en revisión',
    mensajeNotificacion: 'La tarea "Formulario de solicitud de apoyo" pasó a revisión.',
    datosJson: { projectId: pApoyoPares.idProyecto },
  });
  await ensureNotificacion({
    idUsuario: carlos.idUsuario, tipoNotificacion: 'TAREA_ASIGNADA',
    tituloNotificacion: 'Nueva tarea asignada',
    mensajeNotificacion: 'Se te asignó la tarea "Calendario semanal de disponibilidad".',
    datosJson: { projectId: pReservas.idProyecto },
  });

  const convReservas = await ensureConversacion(pReservas.idProyecto, vernel.idUsuario, [vernel.idUsuario, carlos.idUsuario]);
  await ensureMensaje(convReservas.idConversacion, vernel.idUsuario, 'Carlos, ¿cómo va el calendario de disponibilidad? Lo necesitamos para la prueba piloto del jueves.');
  await ensureMensaje(convReservas.idConversacion, carlos.idUsuario, 'Voy avanzando, ya tengo la vista semanal armada, me falta conectar los horarios reales.');

  for (const idProyecto of [pGestionAcademica.idProyecto, pELearning.idProyecto]) {
    await prisma.proyectoGuardado.upsert({
      where: { idUsuario_idProyecto: { idUsuario: vernel.idUsuario, idProyecto } },
      update: {},
      create: { idUsuario: vernel.idUsuario, idProyecto },
    });
  }

  // ─── Amistades: san24725 y vernel no tenian ningun amigo ────────────────
  await ensureAmistad(carlos.idUsuario, maria.idUsuario);
  await ensureAmistad(carlos.idUsuario, jose.idUsuario);
  await ensureAmistad(angel.idUsuario, maria.idUsuario);
  await ensureAmistad(angel.idUsuario, jose.idUsuario);
  await ensureAmistad(angel.idUsuario, carlos.idUsuario);
  await ensureAmistad(vernel.idUsuario, maria.idUsuario);
  await ensureAmistad(vernel.idUsuario, ana.idUsuario);
  await ensureAmistad(vernel.idUsuario, sofia.idUsuario);
  await ensureAmistad(maria.idUsuario, ana.idUsuario);

  // ─── Chats activos adicionales para Angel y Vernel ───────────────────────
  const convELearning = await ensureConversacion(pELearning.idProyecto, angel.idUsuario, [angel.idUsuario, luis.idUsuario]);
  await ensureMensaje(convELearning.idConversacion, angel.idUsuario, 'Luis, ¿cómo va el motor de evaluaciones? Quiero mostrarlo en la demo.');
  await ensureMensaje(convELearning.idConversacion, luis.idUsuario, 'Ya corrige automáticamente. Me falta pulir el reporte de resultados.');
  await ensureMensaje(convELearning.idConversacion, angel.idUsuario, 'Perfecto, con eso alcanza para la demo.');

  const convApoyo = await ensureConversacion(pApoyoPares.idProyecto, vernel.idUsuario, [vernel.idUsuario, sofia.idUsuario]);
  await ensureMensaje(convApoyo.idConversacion, vernel.idUsuario, 'Sofía, ¿el formulario de solicitud ya está listo para revisión?');
  await ensureMensaje(convApoyo.idConversacion, sofia.idUsuario, 'Sí, lo subí ayer. Quedo atenta a tus comentarios.');

  // ─── Sprints ya cerrados: datos reales para Analitica/Burndown/Velocidad ─
  await ensureClosedSprintWithBurndown({
    idProyecto: pGestionAcademica.idProyecto,
    numero: 1,
    diasInicio: -28,
    diasFin: -14,
    tareas: [
      { titulo: 'Levantamiento de requisitos con Asuntos Estudiantiles', puntos: 8, hecha: true, creadaPor: angel.idUsuario, asignadoA: angel.idUsuario },
      { titulo: 'Diseño de wireframes del panel de cursos', puntos: 5, hecha: true, creadaPor: angel.idUsuario, asignadoA: maria.idUsuario },
      { titulo: 'Definición del modelo de datos de cursos', puntos: 5, hecha: true, creadaPor: angel.idUsuario, asignadoA: angel.idUsuario },
      { titulo: 'Setup de repositorio y CI', puntos: 3, hecha: true, creadaPor: angel.idUsuario, asignadoA: angel.idUsuario },
      { titulo: 'Prototipo de autenticación institucional', puntos: 3, hecha: false, creadaPor: angel.idUsuario, asignadoA: maria.idUsuario },
    ],
  });
  await ensureClosedSprintWithBurndown({
    idProyecto: pReservas.idProyecto,
    numero: 1,
    diasInicio: -30,
    diasFin: -16,
    tareas: [
      { titulo: 'Entrevistas con encargados de laboratorios', puntos: 5, hecha: true, creadaPor: vernel.idUsuario, asignadoA: vernel.idUsuario },
      { titulo: 'Modelado inicial de disponibilidad', puntos: 8, hecha: true, creadaPor: vernel.idUsuario, asignadoA: vernel.idUsuario },
      { titulo: 'Investigación de librerías de calendario', puntos: 3, hecha: true, creadaPor: vernel.idUsuario, asignadoA: carlos.idUsuario },
      { titulo: 'Mockups del flujo de reserva', puntos: 5, hecha: true, creadaPor: vernel.idUsuario, asignadoA: vernel.idUsuario },
      { titulo: 'Validación legal de retención de datos de uso', puntos: 2, hecha: false, creadaPor: vernel.idUsuario, asignadoA: vernel.idUsuario },
    ],
  });

  console.log('Demo extra seed completed successfully');
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
