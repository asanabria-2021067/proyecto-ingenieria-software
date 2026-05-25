/**
 * Script de datos de prueba para las 5 vistas de administrador.
 * Diseñado para ejecutarse sobre la BD existente sin conflictos.
 * Uso: DATABASE_URL="..." npx tsx prisma/seed-admin.ts
 */
import { PrismaClient } from '@prisma/client';
import { hashSync } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const PASSWORD_HASH = hashSync('Test1234!', 10);

  // ─── Roles de acceso existentes ──────────────────────────────────────────────
  const rolEstudiante = await prisma.rolAcceso.findUniqueOrThrow({ where: { nombrePerfil: 'estudiante' } });
  const rolLider = await prisma.rolAcceso.findUniqueOrThrow({ where: { nombrePerfil: 'lider_asociacion' } });
  const rolCoordinador = await prisma.rolAcceso.findUniqueOrThrow({ where: { nombrePerfil: 'coordinador_academico' } });
  const rolMentor = await prisma.rolAcceso.findUniqueOrThrow({ where: { nombrePerfil: 'mentor' } });

  // ─── Asignar roles y perfiles a usuarios existentes (sin perfil aún) ─────────
  // carlos.mendoza → estudiante, semestre 7 (aparecerá en riesgo)
  const carlos = await prisma.usuario.findUniqueOrThrow({ where: { correo: 'carlos.mendoza@uvg.edu.gt' } });
  await prisma.usuarioRolAcceso.upsert({
    where: { idUsuario_idRolAcceso: { idUsuario: carlos.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso } },
    update: {},
    create: { idUsuario: carlos.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso },
  });
  await prisma.perfilEstudiante.upsert({
    where: { idUsuario: carlos.idUsuario },
    update: {},
    create: { idUsuario: carlos.idUsuario, carne: '25001', idCarrera: 1, semestre: 7, disponibilidadHorasSemana: 10 },
  });

  // maria.lopez → estudiante, semestre 4
  const maria = await prisma.usuario.findUniqueOrThrow({ where: { correo: 'maria.lopez@uvg.edu.gt' } });
  await prisma.usuarioRolAcceso.upsert({
    where: { idUsuario_idRolAcceso: { idUsuario: maria.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso } },
    update: {},
    create: { idUsuario: maria.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso },
  });
  await prisma.perfilEstudiante.upsert({
    where: { idUsuario: maria.idUsuario },
    update: {},
    create: { idUsuario: maria.idUsuario, carne: '25002', idCarrera: 2, semestre: 4, disponibilidadHorasSemana: 8 },
  });

  // ana.garcia → estudiante, semestre 5
  const ana = await prisma.usuario.findUniqueOrThrow({ where: { correo: 'ana.garcia@uvg.edu.gt' } });
  await prisma.usuarioRolAcceso.upsert({
    where: { idUsuario_idRolAcceso: { idUsuario: ana.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso } },
    update: {},
    create: { idUsuario: ana.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso },
  });
  await prisma.perfilEstudiante.upsert({
    where: { idUsuario: ana.idUsuario },
    update: {},
    create: { idUsuario: ana.idUsuario, carne: '25003', idCarrera: 3, semestre: 5, disponibilidadHorasSemana: 6 },
  });

  // sofia.martinez → estudiante, semestre 3
  const sofia = await prisma.usuario.findUniqueOrThrow({ where: { correo: 'sofia.martinez@uvg.edu.gt' } });
  await prisma.usuarioRolAcceso.upsert({
    where: { idUsuario_idRolAcceso: { idUsuario: sofia.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso } },
    update: {},
    create: { idUsuario: sofia.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso },
  });
  await prisma.perfilEstudiante.upsert({
    where: { idUsuario: sofia.idUsuario },
    update: {},
    create: { idUsuario: sofia.idUsuario, carne: '25004', idCarrera: 5, semestre: 3, disponibilidadHorasSemana: 10 },
  });

  // luis.hernandez → coordinador_academico
  const luis = await prisma.usuario.findUniqueOrThrow({ where: { correo: 'luis.hernandez@uvg.edu.gt' } });
  await prisma.usuarioRolAcceso.upsert({
    where: { idUsuario_idRolAcceso: { idUsuario: luis.idUsuario, idRolAcceso: rolCoordinador.idRolAcceso } },
    update: {},
    create: { idUsuario: luis.idUsuario, idRolAcceso: rolCoordinador.idRolAcceso },
  });

  // jose.ramirez → lider_asociacion
  const jose = await prisma.usuario.findUniqueOrThrow({ where: { correo: 'jose.ramirez@uvg.edu.gt' } });
  await prisma.usuarioRolAcceso.upsert({
    where: { idUsuario_idRolAcceso: { idUsuario: jose.idUsuario, idRolAcceso: rolLider.idRolAcceso } },
    update: {},
    create: { idUsuario: jose.idUsuario, idRolAcceso: rolLider.idRolAcceso },
  });

  // ─── Nuevos usuarios mentores (MentorContent en UserDetailSheet) ─────────────
  const mentorRosa = await prisma.usuario.upsert({
    where: { correo: 'rosa.fuentes@uvg.edu.gt' },
    update: {},
    create: { correo: 'rosa.fuentes@uvg.edu.gt', contrasena: PASSWORD_HASH, nombre: 'Rosa', apellido: 'Fuentes' },
  });
  const mentorTomas = await prisma.usuario.upsert({
    where: { correo: 'tomas.guerrero@uvg.edu.gt' },
    update: {},
    create: { correo: 'tomas.guerrero@uvg.edu.gt', contrasena: PASSWORD_HASH, nombre: 'Tomás', apellido: 'Guerrero' },
  });
  for (const u of [mentorRosa, mentorTomas]) {
    await prisma.usuarioRolAcceso.upsert({
      where: { idUsuario_idRolAcceso: { idUsuario: u.idUsuario, idRolAcceso: rolMentor.idRolAcceso } },
      update: {},
      create: { idUsuario: u.idUsuario, idRolAcceso: rolMentor.idRolAcceso },
    });
  }

  // ─── Usuarios BLOQUEADO (stat dashboard + filtro + botón Desbloquear en drawer) ─
  const bloqueadoEst = await prisma.usuario.upsert({
    where: { correo: 'pedro.castillo@uvg.edu.gt' },
    update: { estado: 'BLOQUEADO' as const },
    create: { correo: 'pedro.castillo@uvg.edu.gt', contrasena: PASSWORD_HASH, nombre: 'Pedro', apellido: 'Castillo', estado: 'BLOQUEADO' as const },
  });
  const bloqueadoLider = await prisma.usuario.upsert({
    where: { correo: 'miguel.santos@uvg.edu.gt' },
    update: { estado: 'BLOQUEADO' as const },
    create: { correo: 'miguel.santos@uvg.edu.gt', contrasena: PASSWORD_HASH, nombre: 'Miguel', apellido: 'Santos', estado: 'BLOQUEADO' as const },
  });
  const bloqueadoMentor = await prisma.usuario.upsert({
    where: { correo: 'diana.ramirez@uvg.edu.gt' },
    update: { estado: 'BLOQUEADO' as const },
    create: { correo: 'diana.ramirez@uvg.edu.gt', contrasena: PASSWORD_HASH, nombre: 'Diana', apellido: 'Ramírez', estado: 'BLOQUEADO' as const },
  });
  await prisma.usuarioRolAcceso.upsert({
    where: { idUsuario_idRolAcceso: { idUsuario: bloqueadoEst.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso } },
    update: {},
    create: { idUsuario: bloqueadoEst.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso },
  });
  await prisma.perfilEstudiante.upsert({
    where: { idUsuario: bloqueadoEst.idUsuario },
    update: {},
    create: { idUsuario: bloqueadoEst.idUsuario, carne: '25010', idCarrera: 1, semestre: 5, disponibilidadHorasSemana: 10 },
  });
  await prisma.usuarioRolAcceso.upsert({
    where: { idUsuario_idRolAcceso: { idUsuario: bloqueadoLider.idUsuario, idRolAcceso: rolLider.idRolAcceso } },
    update: {},
    create: { idUsuario: bloqueadoLider.idUsuario, idRolAcceso: rolLider.idRolAcceso },
  });
  await prisma.usuarioRolAcceso.upsert({
    where: { idUsuario_idRolAcceso: { idUsuario: bloqueadoMentor.idUsuario, idRolAcceso: rolMentor.idRolAcceso } },
    update: {},
    create: { idUsuario: bloqueadoMentor.idUsuario, idRolAcceso: rolMentor.idRolAcceso },
  });

  // ─── Usuarios INACTIVO (nuevosInactivos2026 stat + filtro + botón Activar) ────
  const inactivoEst = await prisma.usuario.upsert({
    where: { correo: 'laura.garcia@uvg.edu.gt' },
    update: { estado: 'INACTIVO' as const },
    create: { correo: 'laura.garcia@uvg.edu.gt', contrasena: PASSWORD_HASH, nombre: 'Laura', apellido: 'García', estado: 'INACTIVO' as const },
  });
  const inactivoCoord = await prisma.usuario.upsert({
    where: { correo: 'daniel.vasquez@uvg.edu.gt' },
    update: { estado: 'INACTIVO' as const },
    create: { correo: 'daniel.vasquez@uvg.edu.gt', contrasena: PASSWORD_HASH, nombre: 'Daniel', apellido: 'Vásquez', estado: 'INACTIVO' as const },
  });
  await prisma.usuarioRolAcceso.upsert({
    where: { idUsuario_idRolAcceso: { idUsuario: inactivoEst.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso } },
    update: {},
    create: { idUsuario: inactivoEst.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso },
  });
  await prisma.perfilEstudiante.upsert({
    where: { idUsuario: inactivoEst.idUsuario },
    update: {},
    create: { idUsuario: inactivoEst.idUsuario, carne: '25011', idCarrera: 2, semestre: 4, disponibilidadHorasSemana: 8 },
  });
  await prisma.usuarioRolAcceso.upsert({
    where: { idUsuario_idRolAcceso: { idUsuario: inactivoCoord.idUsuario, idRolAcceso: rolCoordinador.idRolAcceso } },
    update: {},
    create: { idUsuario: inactivoCoord.idUsuario, idRolAcceso: rolCoordinador.idRolAcceso },
  });

  // ─── Estudiantes en riesgo (semestre ≥ 7, pocas horas extensión) ─────────────
  const hector = await prisma.usuario.upsert({
    where: { correo: 'hector.mendez@uvg.edu.gt' },
    update: {},
    create: { correo: 'hector.mendez@uvg.edu.gt', contrasena: PASSWORD_HASH, nombre: 'Héctor', apellido: 'Méndez' },
  });
  const valentina = await prisma.usuario.upsert({
    where: { correo: 'valentina.soto@uvg.edu.gt' },
    update: {},
    create: { correo: 'valentina.soto@uvg.edu.gt', contrasena: PASSWORD_HASH, nombre: 'Valentina', apellido: 'Soto' },
  });
  const omar = await prisma.usuario.upsert({
    where: { correo: 'omar.perez@uvg.edu.gt' },
    update: {},
    create: { correo: 'omar.perez@uvg.edu.gt', contrasena: PASSWORD_HASH, nombre: 'Óscar', apellido: 'Pérez' },
  });
  const riesgoData = [
    { user: hector,    carne: '25012', idCarrera: 1, semestre: 10, disponibilidadHorasSemana: 12, horasExtensionRequeridas: 40 },
    { user: valentina, carne: '25013', idCarrera: 3, semestre: 8,  disponibilidadHorasSemana: 10, horasExtensionRequeridas: 20 },
    { user: omar,      carne: '25014', idCarrera: 4, semestre: 9,  disponibilidadHorasSemana: 8,  horasExtensionRequeridas: 30 },
  ];
  for (const { user, carne, idCarrera, semestre, disponibilidadHorasSemana, horasExtensionRequeridas } of riesgoData) {
    await prisma.perfilEstudiante.upsert({
      where: { idUsuario: user.idUsuario },
      update: {},
      create: { idUsuario: user.idUsuario, carne, idCarrera, semestre, disponibilidadHorasSemana, horasExtensionRequeridas },
    });
    await prisma.usuarioRolAcceso.upsert({
      where: { idUsuario_idRolAcceso: { idUsuario: user.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso } },
      update: {},
      create: { idUsuario: user.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso },
    });
  }

  // ─── Proyectos EN_REVISION (bandeja de revisiones + stat dashboard) ───────────
  const pVoluntariado = await prisma.proyecto.upsert({
    where: { idProyecto: 20 },
    update: {
      descripcionProyecto: 'Sistema web para conectar estudiantes de la Universidad del Valle de Guatemala con oportunidades de voluntariado comunitario, permitiendo registrar proyectos, postularse a actividades y dar seguimiento a las horas de servicio realizadas.',
      objetivosProyecto: 'Facilitar la gestión de oportunidades de voluntariado estudiantil, mejorar la comunicación entre estudiantes y organizaciones, y permitir el seguimiento de participación mediante una plataforma centralizada.',
      contextoAcademico: 'Proyecto desarrollado como parte del curso de Ingeniería de Software en la Universidad del Valle de Guatemala.',
      ubicacionProyecto: 'Universidad del Valle de Guatemala, Campus Central',
      urlRecursoExterno: 'https://voluntariado.uvg.edu.gt',
      modalidadProyecto: 'MIXTA',
    },
    create: {
      idProyecto: 20,
      tituloProyecto: 'Plataforma de Voluntariado Estudiantil',
      descripcionProyecto: 'Sistema web para conectar estudiantes de la Universidad del Valle de Guatemala con oportunidades de voluntariado comunitario, permitiendo registrar proyectos, postularse a actividades y dar seguimiento a las horas de servicio realizadas.',
      objetivosProyecto: 'Facilitar la gestión de oportunidades de voluntariado estudiantil, mejorar la comunicación entre estudiantes y organizaciones, y permitir el seguimiento de participación mediante una plataforma centralizada.',
      contextoAcademico: 'Proyecto desarrollado como parte del curso de Ingeniería de Software en la Universidad del Valle de Guatemala.',
      ubicacionProyecto: 'Universidad del Valle de Guatemala, Campus Central',
      urlRecursoExterno: 'https://voluntariado.uvg.edu.gt',
      modalidadProyecto: 'MIXTA',
      tipoProyecto: 'EXTRACURRICULAR_EXTENSION',
      estadoProyecto: 'EN_REVISION',
      creadoPor: jose.idUsuario,
      fechaInicio: new Date('2026-05-10'),
      fechaFinEstimada: new Date('2026-11-10'),
    },
  });
  const pBienestar = await prisma.proyecto.upsert({
    where: { idProyecto: 21 },
    update: {},
    create: {
      idProyecto: 21,
      tituloProyecto: 'App de Bienestar Universitario',
      descripcionProyecto: 'Aplicación para seguimiento de salud mental y bienestar estudiantil',
      tipoProyecto: 'ACADEMICO_EXPERIENCIA',
      estadoProyecto: 'EN_REVISION',
      creadoPor: jose.idUsuario,
      fechaInicio: new Date('2026-05-15'),
      fechaFinEstimada: new Date('2026-12-15'),
    },
  });
  const pMentores = await prisma.proyecto.upsert({
    where: { idProyecto: 22 },
    update: {},
    create: {
      idProyecto: 22,
      tituloProyecto: 'Red de Mentores UVG',
      descripcionProyecto: 'Plataforma para conectar estudiantes con mentores de la industria tecnológica',
      tipoProyecto: 'EXTRACURRICULAR_EXTENSION',
      estadoProyecto: 'EN_REVISION',
      creadoPor: carlos.idUsuario,
      fechaInicio: new Date('2026-05-20'),
      fechaFinEstimada: new Date('2026-12-20'),
    },
  });

  // ─── Proyectos EN_SOLICITUD_CIERRE (bandeja de revisiones + stat dashboard) ───
  await prisma.proyecto.upsert({
    where: { idProyecto: 23 },
    update: {},
    create: {
      idProyecto: 23,
      tituloProyecto: 'Sistema de Intercambio Académico',
      descripcionProyecto: 'Plataforma para gestionar intercambios académicos entre universidades aliadas',
      tipoProyecto: 'ACADEMICO_HORAS_BECA',
      estadoProyecto: 'EN_SOLICITUD_CIERRE',
      creadoPor: carlos.idUsuario,
      fechaInicio: new Date('2026-02-01'),
      fechaFinEstimada: new Date('2026-05-01'),
    },
  });
  await prisma.proyecto.upsert({
    where: { idProyecto: 24 },
    update: {},
    create: {
      idProyecto: 24,
      tituloProyecto: 'Laboratorio de Datos Abiertos',
      descripcionProyecto: 'Consolidación de datasets universitarios para investigación aplicada',
      tipoProyecto: 'ACADEMICO_EXPERIENCIA',
      estadoProyecto: 'EN_SOLICITUD_CIERRE',
      creadoPor: jose.idUsuario,
      fechaInicio: new Date('2026-03-01'),
      fechaFinEstimada: new Date('2026-06-01'),
    },
  });

  // ─── Proyectos CERRADOS en 2026 (proyectosCerrados2026 stat) ──────────────────
  const pFeria = await prisma.proyecto.upsert({
    where: { idProyecto: 25 },
    update: { fechaActualizacion: new Date('2026-03-15T10:00:00.000Z') },
    create: {
      idProyecto: 25,
      tituloProyecto: 'Feria de Ciencias UVG 2026',
      descripcionProyecto: 'Organización y logística de la feria de ciencias universitaria anual',
      tipoProyecto: 'EXTRACURRICULAR_EXTENSION',
      estadoProyecto: 'CERRADO',
      creadoPor: maria.idUsuario,
      fechaInicio: new Date('2026-01-15'),
      fechaFinEstimada: new Date('2026-03-15'),
      fechaActualizacion: new Date('2026-03-15T10:00:00.000Z'),
    },
  });
  const pHackathon = await prisma.proyecto.upsert({
    where: { idProyecto: 26 },
    update: { fechaActualizacion: new Date('2026-04-01T10:00:00.000Z') },
    create: {
      idProyecto: 26,
      tituloProyecto: 'Hackathon de Innovación Social',
      descripcionProyecto: 'Competencia de desarrollo tecnológico con impacto social en la comunidad',
      tipoProyecto: 'EXTRACURRICULAR_EXTENSION',
      estadoProyecto: 'CERRADO',
      creadoPor: jose.idUsuario,
      fechaInicio: new Date('2026-02-01'),
      fechaFinEstimada: new Date('2026-04-01'),
      fechaActualizacion: new Date('2026-04-01T10:00:00.000Z'),
    },
  });

  // ─── Roles en nuevos proyectos ────────────────────────────────────────────────
  const rolVoluntariado = await prisma.rolProyecto.upsert({
    where: { idRolProyecto: 30 },
    update: {
      descripcionRolProyecto: 'Encargado de coordinar las actividades de voluntariado, dar seguimiento a los estudiantes participantes y apoyar en la comunicación entre la universidad y las organizaciones comunitarias.',
      horasSemanalesEstimadas: 6,
    },
    create: {
      idRolProyecto: 30,
      idProyecto: pVoluntariado.idProyecto,
      nombreRol: 'Coordinador de Actividades',
      cupos: 3,
      descripcionRolProyecto: 'Encargado de coordinar las actividades de voluntariado, dar seguimiento a los estudiantes participantes y apoyar en la comunicación entre la universidad y las organizaciones comunitarias.',
      horasSemanalesEstimadas: 6,
    },
  });
  // Habilidades para el primer rol (Coordinador de Actividades)
  const disenioSkill = await prisma.habilidad.findFirst({ where: { nombreHabilidad: 'Diseño UI/UX' } });
  const pythonSkill  = await prisma.habilidad.findFirst({ where: { nombreHabilidad: 'Python' } });
  if (disenioSkill) {
    await prisma.requisitoHabilidadRol.upsert({
      where: { idRolProyecto_idHabilidad: { idRolProyecto: rolVoluntariado.idRolProyecto, idHabilidad: disenioSkill.idHabilidad } },
      update: {},
      create: { idRolProyecto: rolVoluntariado.idRolProyecto, idHabilidad: disenioSkill.idHabilidad, nivelMinimo: 'INTERMEDIO', obligatorio: true },
    });
  }
  if (pythonSkill) {
    await prisma.requisitoHabilidadRol.upsert({
      where: { idRolProyecto_idHabilidad: { idRolProyecto: rolVoluntariado.idRolProyecto, idHabilidad: pythonSkill.idHabilidad } },
      update: {},
      create: { idRolProyecto: rolVoluntariado.idRolProyecto, idHabilidad: pythonSkill.idHabilidad, nivelMinimo: 'BASICO', obligatorio: false },
    });
  }

  const rolVoluntariado2 = await prisma.rolProyecto.upsert({
    where: { idRolProyecto: 34 },
    update: {},
    create: {
      idRolProyecto: 34,
      idProyecto: pVoluntariado.idProyecto,
      nombreRol: 'Desarrollador Fullstack',
      cupos: 3,
    },
  });
  // Habilidades para el segundo rol de voluntariado (NestJS y React)
  const nestjsSkill = await prisma.habilidad.findFirst({ where: { nombreHabilidad: 'NestJS' } });
  const reactSkill  = await prisma.habilidad.findFirst({ where: { nombreHabilidad: 'React' } });
  if (nestjsSkill) {
    await prisma.requisitoHabilidadRol.upsert({
      where: { idRolProyecto_idHabilidad: { idRolProyecto: rolVoluntariado2.idRolProyecto, idHabilidad: nestjsSkill.idHabilidad } },
      update: {},
      create: { idRolProyecto: rolVoluntariado2.idRolProyecto, idHabilidad: nestjsSkill.idHabilidad, nivelMinimo: 'BASICO', obligatorio: true },
    });
  }
  if (reactSkill) {
    await prisma.requisitoHabilidadRol.upsert({
      where: { idRolProyecto_idHabilidad: { idRolProyecto: rolVoluntariado2.idRolProyecto, idHabilidad: reactSkill.idHabilidad } },
      update: {},
      create: { idRolProyecto: rolVoluntariado2.idRolProyecto, idHabilidad: reactSkill.idHabilidad, nivelMinimo: 'BASICO', obligatorio: true },
    });
  }

  const rolFeria = await prisma.rolProyecto.upsert({
    where: { idRolProyecto: 31 },
    update: {},
    create: { idRolProyecto: 31, idProyecto: pFeria.idProyecto, nombreRol: 'Mentor de Equipo', cupos: 2 },
  });

  // ─── Revisiones para proyectos EN_REVISION (bandeja de admin) ────────────────
  await prisma.revisionProyecto.upsert({
    where: { idRevisionProyecto: 10 },
    update: {},
    create: { idRevisionProyecto: 10, idProyecto: pVoluntariado.idProyecto, estadoRevision: 'PENDIENTE', numeroEnvio: 1 },
  });
  await prisma.revisionProyecto.upsert({
    where: { idRevisionProyecto: 11 },
    update: {},
    create: { idRevisionProyecto: 11, idProyecto: pBienestar.idProyecto, estadoRevision: 'PENDIENTE', numeroEnvio: 1 },
  });
  await prisma.revisionProyecto.upsert({
    where: { idRevisionProyecto: 12 },
    update: {},
    create: { idRevisionProyecto: 12, idProyecto: pMentores.idProyecto, estadoRevision: 'PENDIENTE', numeroEnvio: 1 },
  });

  // ─── Revisiones APROBADAS vinculadas a Luis (enriquece CoordinadorContent) ────
  await prisma.revisionProyecto.upsert({
    where: { idRevisionProyecto: 13 },
    update: {},
    create: {
      idRevisionProyecto: 13,
      idProyecto: pFeria.idProyecto,
      idRevisor: luis.idUsuario,
      estadoRevision: 'APROBADA',
      comentarioRevision: 'El proyecto cumple con todos los requisitos académicos y de extensión.',
      numeroEnvio: 1,
      revisadaEn: new Date('2026-03-20'),
    },
  });
  await prisma.revisionProyecto.upsert({
    where: { idRevisionProyecto: 14 },
    update: {},
    create: {
      idRevisionProyecto: 14,
      idProyecto: pHackathon.idProyecto,
      idRevisor: luis.idUsuario,
      estadoRevision: 'APROBADA',
      comentarioRevision: 'Excelente impacto social demostrado durante el evento.',
      numeroEnvio: 1,
      revisadaEn: new Date('2026-04-10'),
    },
  });

  // ─── Participaciones para mentores (MentorContent) ───────────────────────────
  // Rosa: 1 proyecto activo (PUBLICADO, rol 1) + 1 proyecto cerrado (CERRADO, rol 31)
  const partRosa1 = await prisma.participacionProyecto.upsert({
    where: { idParticipacion: 50 },
    update: {},
    create: { idParticipacion: 50, idUsuario: mentorRosa.idUsuario, idRolProyecto: 1, estadoParticipacion: 'ACTIVO' },
  });
  await prisma.participacionProyecto.upsert({
    where: { idParticipacion: 51 },
    update: {},
    create: { idParticipacion: 51, idUsuario: mentorRosa.idUsuario, idRolProyecto: rolFeria.idRolProyecto, estadoParticipacion: 'ACTIVO' },
  });
  // Tomás: 1 proyecto activo (PUBLICADO, proyecto 2 rol 3 = Analista)
  await prisma.participacionProyecto.upsert({
    where: { idParticipacion: 52 },
    update: {},
    create: { idParticipacion: 52, idUsuario: mentorTomas.idUsuario, idRolProyecto: 3, estadoParticipacion: 'ACTIVO' },
  });

  // ─── Participación de Valentina en extensión + horas parciales ───────────────
  // Para mostrar la barra de progreso parcial en EstudianteContent (5/20 horas)
  await prisma.participacionProyecto.upsert({
    where: { idParticipacion: 53 },
    update: {},
    create: { idParticipacion: 53, idUsuario: valentina.idUsuario, idRolProyecto: rolVoluntariado.idRolProyecto, estadoParticipacion: 'ACTIVO' },
  });
  await prisma.horasParticipacion.upsert({
    where: { idRegistroHoras: 50 },
    update: {},
    create: {
      idRegistroHoras: 50,
      idParticipacion: 53,
      periodoInicio: new Date('2026-04-01'),
      periodoFin: new Date('2026-04-30'),
      horasReportadas: 5,
      horasAprobadas: 5,
      estadoHoras: 'APROBADA',
      aprobadoPor: luis.idUsuario,
    },
  });

  // Horas aprobadas por Luis para que CoordinadorContent muestre estudiantesVinculados > 0
  await prisma.participacionProyecto.upsert({
    where: { idParticipacion: 54 },
    update: {},
    create: { idParticipacion: 54, idUsuario: ana.idUsuario, idRolProyecto: 3, estadoParticipacion: 'ACTIVO' },
  });
  await prisma.horasParticipacion.upsert({
    where: { idRegistroHoras: 51 },
    update: {},
    create: {
      idRegistroHoras: 51,
      idParticipacion: 54,
      periodoInicio: new Date('2026-04-01'),
      periodoFin: new Date('2026-04-30'),
      horasReportadas: 12,
      horasAprobadas: 12,
      estadoHoras: 'APROBADA',
      aprobadoPor: luis.idUsuario,
    },
  });

  // ─── Participaciones de los líderes en sus propios proyectos ─────────────────
  // Para que jose (lider) tenga proyectos con postulaciones pendientes en LiderContent,
  // se crean postulaciones pendientes al rol del proyecto de voluntariado
  await prisma.postulacion.upsert({
    where: { idPostulacion: 50 },
    update: {},
    create: {
      idPostulacion: 50,
      idUsuarioPostulante: carlos.idUsuario,
      idRolProyecto: rolVoluntariado.idRolProyecto,
      justificacion: 'Me interesa coordinar actividades de voluntariado comunitario.',
      estadoPostulacion: 'PENDIENTE',
    },
  });
  await prisma.postulacion.upsert({
    where: { idPostulacion: 51 },
    update: {},
    create: {
      idPostulacion: 51,
      idUsuarioPostulante: sofia.idUsuario,
      idRolProyecto: rolVoluntariado.idRolProyecto,
      justificacion: 'Tengo experiencia en trabajo comunitario y gestión de proyectos.',
      estadoPostulacion: 'PENDIENTE',
    },
  });

  // ─── Actualizar secuencias ────────────────────────────────────────────────────
  const sequences = [
    { table: 'proyecto',               column: 'id_proyecto' },
    { table: 'rol_proyecto',           column: 'id_rol_proyecto' },
    { table: 'revision_proyecto',      column: 'id_revision_proyecto' },
    { table: 'postulacion',            column: 'id_postulacion' },
    { table: 'participacion_proyecto', column: 'id_participacion' },
    { table: 'horas_participacion',    column: 'id_registro_horas' },
  ];
  for (const { table, column } of sequences) {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('${table}', '${column}'), COALESCE((SELECT MAX(${column}) FROM ${table}), 0) + 1, false)`,
    );
  }

  console.log('✓ Seed de datos de administrador completado');
  console.log('');
  console.log('Resumen de datos creados/actualizados:');
  console.log('  Usuarios mentores:     Rosa Fuentes, Tomás Guerrero');
  console.log('  Usuarios BLOQUEADO:    Pedro Castillo (est), Miguel Santos (líder), Diana Ramírez (mentor)');
  console.log('  Usuarios INACTIVO:     Laura García (est), Daniel Vásquez (coord)');
  console.log('  Estudiantes en riesgo: Héctor Méndez (s10), Valentina Soto (s8), Óscar Pérez (s9)');
  console.log('  Proyectos EN_REVISION: Voluntariado (20), Bienestar (21), Mentores (22)');
  console.log('  Proyectos EN_CIERRE:   Intercambio (23), Datos Abiertos (24)');
  console.log('  Proyectos CERRADOS:    Feria Ciencias (25), Hackathon (26)');
  console.log('  Roles asignados:       carlos→est(s7), maria→est, ana→est, sofia→est, luis→coord, jose→lider');
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
