import { PrismaClient, Prisma, type TipoNotificacion, type ModalidadEvento } from '@prisma/client';

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

async function main() {
  const usuario = (correo: string) => prisma.usuario.findUniqueOrThrow({ where: { correo } });

  const [angel, carlos, maria, jose, ana, luis, sofia, fernando, camila] = await Promise.all([
    usuario('san24725@uvg.edu.gt'),
    usuario('carlos.mendoza@uvg.edu.gt'),
    usuario('maria.lopez@uvg.edu.gt'),
    usuario('jose.ramirez@uvg.edu.gt'),
    usuario('ana.garcia@uvg.edu.gt'),
    usuario('luis.hernandez@uvg.edu.gt'),
    usuario('sofia.martinez@uvg.edu.gt'),
    usuario('fernando.castaneda@uvg.edu.gt'),
    usuario('camila.rodriguez@uvg.edu.gt'),
  ]);

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
