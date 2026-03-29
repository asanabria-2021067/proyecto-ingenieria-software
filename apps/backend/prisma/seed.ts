import { PrismaClient } from '@prisma/client';
import { hashSync } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const PASSWORD_HASH = hashSync('Test1234!', 10);

  // ─── Carreras ───────────────────────────────────────────
  const computacion = await prisma.carrera.upsert({
    where: { idCarrera: 1 },
    update: { nombreCarrera: 'Ingeniería en Ciencias de la Computación y TI', facultad: 'Facultad de Ingeniería' },
    create: { idCarrera: 1, nombreCarrera: 'Ingeniería en Ciencias de la Computación y TI', facultad: 'Facultad de Ingeniería' },
  });

  const industrial = await prisma.carrera.upsert({
    where: { idCarrera: 2 },
    update: { nombreCarrera: 'Ingeniería Industrial', facultad: 'Facultad de Ingeniería' },
    create: { idCarrera: 2, nombreCarrera: 'Ingeniería Industrial', facultad: 'Facultad de Ingeniería' },
  });

  await prisma.carrera.upsert({
    where: { idCarrera: 3 },
    update: { nombreCarrera: 'Ingeniería Biomédica', facultad: 'Facultad de Ingeniería' },
    create: { idCarrera: 3, nombreCarrera: 'Ingeniería Biomédica', facultad: 'Facultad de Ingeniería' },
  });

  // ─── Habilidades ────────────────────────────────────────
  const typescript = await prisma.habilidad.upsert({
    where: { idHabilidad: 1 },
    update: { nombreHabilidad: 'TypeScript', categoriaHabilidad: 'programación' },
    create: { idHabilidad: 1, nombreHabilidad: 'TypeScript', categoriaHabilidad: 'programación' },
  });

  const react = await prisma.habilidad.upsert({
    where: { idHabilidad: 2 },
    update: { nombreHabilidad: 'React', categoriaHabilidad: 'programación' },
    create: { idHabilidad: 2, nombreHabilidad: 'React', categoriaHabilidad: 'programación' },
  });

  const python = await prisma.habilidad.upsert({
    where: { idHabilidad: 3 },
    update: { nombreHabilidad: 'Python', categoriaHabilidad: 'programación' },
    create: { idHabilidad: 3, nombreHabilidad: 'Python', categoriaHabilidad: 'programación' },
  });

  const postgresql = await prisma.habilidad.upsert({
    where: { idHabilidad: 4 },
    update: { nombreHabilidad: 'PostgreSQL', categoriaHabilidad: 'bases de datos' },
    create: { idHabilidad: 4, nombreHabilidad: 'PostgreSQL', categoriaHabilidad: 'bases de datos' },
  });

  const disenoUiUx = await prisma.habilidad.upsert({
    where: { idHabilidad: 5 },
    update: { nombreHabilidad: 'Diseño UI/UX', categoriaHabilidad: 'diseño' },
    create: { idHabilidad: 5, nombreHabilidad: 'Diseño UI/UX', categoriaHabilidad: 'diseño' },
  });

  await prisma.habilidad.upsert({
    where: { idHabilidad: 6 },
    update: { nombreHabilidad: 'NestJS', categoriaHabilidad: 'programación' },
    create: { idHabilidad: 6, nombreHabilidad: 'NestJS', categoriaHabilidad: 'programación' },
  });

  await prisma.habilidad.upsert({
    where: { idHabilidad: 7 },
    update: { nombreHabilidad: 'Prisma', categoriaHabilidad: 'programación' },
    create: { idHabilidad: 7, nombreHabilidad: 'Prisma', categoriaHabilidad: 'programación' },
  });

  await prisma.habilidad.upsert({
    where: { idHabilidad: 8 },
    update: { nombreHabilidad: 'Investigación académica', categoriaHabilidad: 'investigación' },
    create: { idHabilidad: 8, nombreHabilidad: 'Investigación académica', categoriaHabilidad: 'investigación' },
  });

  // ─── Intereses ──────────────────────────────────────────
  const ia = await prisma.interes.upsert({
    where: { nombreInteres: 'Inteligencia Artificial' },
    update: {},
    create: { nombreInteres: 'Inteligencia Artificial' },
  });

  const devWeb = await prisma.interes.upsert({
    where: { nombreInteres: 'Desarrollo Web' },
    update: {},
    create: { nombreInteres: 'Desarrollo Web' },
  });

  await prisma.interes.upsert({
    where: { nombreInteres: 'Investigación Científica' },
    update: {},
    create: { nombreInteres: 'Investigación Científica' },
  });

  await prisma.interes.upsert({
    where: { nombreInteres: 'Robótica' },
    update: {},
    create: { nombreInteres: 'Robótica' },
  });

  const analisisDatos = await prisma.interes.upsert({
    where: { nombreInteres: 'Análisis de Datos' },
    update: {},
    create: { nombreInteres: 'Análisis de Datos' },
  });

  // ─── Cualidades ─────────────────────────────────────────
  await prisma.cualidad.upsert({
    where: { nombreCualidad: 'Liderazgo' },
    update: {},
    create: { nombreCualidad: 'Liderazgo' },
  });

  await prisma.cualidad.upsert({
    where: { nombreCualidad: 'Trabajo en equipo' },
    update: {},
    create: { nombreCualidad: 'Trabajo en equipo' },
  });

  await prisma.cualidad.upsert({
    where: { nombreCualidad: 'Comunicación efectiva' },
    update: {},
    create: { nombreCualidad: 'Comunicación efectiva' },
  });

  // ─── Roles de acceso ───────────────────────────────────
  const rolEstudiante = await prisma.rolAcceso.upsert({
    where: { nombrePerfil: 'estudiante' },
    update: { descripcion: 'Estudiante registrado en la plataforma' },
    create: { nombrePerfil: 'estudiante', descripcion: 'Estudiante registrado en la plataforma' },
  });

  await prisma.rolAcceso.upsert({
    where: { nombrePerfil: 'lider_asociacion' },
    update: { descripcion: 'Líder o administrador de una asociación estudiantil' },
    create: { nombrePerfil: 'lider_asociacion', descripcion: 'Líder o administrador de una asociación estudiantil' },
  });

  await prisma.rolAcceso.upsert({
    where: { nombrePerfil: 'coordinador_academico' },
    update: { descripcion: 'Coordinador que valida horas y emite certificados' },
    create: { nombrePerfil: 'coordinador_academico', descripcion: 'Coordinador que valida horas y emite certificados' },
  });

  await prisma.rolAcceso.upsert({
    where: { nombrePerfil: 'administrador' },
    update: { descripcion: 'Administrador del sistema' },
    create: { nombrePerfil: 'administrador', descripcion: 'Administrador del sistema' },
  });

  // ─── Usuarios ───────────────────────────────────────────
  const user1 = await prisma.usuario.upsert({
    where: { correo: 'test1@uvg.edu.gt' },
    update: { nombre: 'Carlos', apellido: 'Mendoza', contrasena: PASSWORD_HASH },
    create: {
      correo: 'test1@uvg.edu.gt',
      contrasena: PASSWORD_HASH,
      nombre: 'Carlos',
      apellido: 'Mendoza',
    },
  });

  const user2 = await prisma.usuario.upsert({
    where: { correo: 'test2@uvg.edu.gt' },
    update: { nombre: 'María', apellido: 'López', contrasena: PASSWORD_HASH },
    create: {
      correo: 'test2@uvg.edu.gt',
      contrasena: PASSWORD_HASH,
      nombre: 'María',
      apellido: 'López',
    },
  });

  // ─── Perfiles de estudiante ─────────────────────────────
  await prisma.perfilEstudiante.upsert({
    where: { idUsuario: user1.idUsuario },
    update: { carne: '24001', idCarrera: computacion.idCarrera, semestre: 6, disponibilidadHorasSemana: 10 },
    create: {
      idUsuario: user1.idUsuario,
      carne: '24001',
      idCarrera: computacion.idCarrera,
      semestre: 6,
      disponibilidadHorasSemana: 10,
    },
  });

  await prisma.perfilEstudiante.upsert({
    where: { idUsuario: user2.idUsuario },
    update: { carne: '24002', idCarrera: industrial.idCarrera, semestre: 4, disponibilidadHorasSemana: 8 },
    create: {
      idUsuario: user2.idUsuario,
      carne: '24002',
      idCarrera: industrial.idCarrera,
      semestre: 4,
      disponibilidadHorasSemana: 8,
    },
  });

  // ─── Roles de acceso → Usuarios ────────────────────────
  await prisma.usuarioRolAcceso.upsert({
    where: { idUsuario_idRolAcceso: { idUsuario: user1.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso } },
    update: {},
    create: { idUsuario: user1.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso },
  });

  await prisma.usuarioRolAcceso.upsert({
    where: { idUsuario_idRolAcceso: { idUsuario: user2.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso } },
    update: {},
    create: { idUsuario: user2.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso },
  });

  // ─── Habilidades → Usuarios ─────────────────────────────
  await prisma.usuarioHabilidad.upsert({
    where: { idUsuario_idHabilidad: { idUsuario: user1.idUsuario, idHabilidad: typescript.idHabilidad } },
    update: { nivelHabilidad: 'INTERMEDIO' },
    create: { idUsuario: user1.idUsuario, idHabilidad: typescript.idHabilidad, nivelHabilidad: 'INTERMEDIO' },
  });

  await prisma.usuarioHabilidad.upsert({
    where: { idUsuario_idHabilidad: { idUsuario: user1.idUsuario, idHabilidad: react.idHabilidad } },
    update: { nivelHabilidad: 'INTERMEDIO' },
    create: { idUsuario: user1.idUsuario, idHabilidad: react.idHabilidad, nivelHabilidad: 'INTERMEDIO' },
  });

  await prisma.usuarioHabilidad.upsert({
    where: { idUsuario_idHabilidad: { idUsuario: user1.idUsuario, idHabilidad: postgresql.idHabilidad } },
    update: { nivelHabilidad: 'BASICO' },
    create: { idUsuario: user1.idUsuario, idHabilidad: postgresql.idHabilidad, nivelHabilidad: 'BASICO' },
  });

  await prisma.usuarioHabilidad.upsert({
    where: { idUsuario_idHabilidad: { idUsuario: user2.idUsuario, idHabilidad: python.idHabilidad } },
    update: { nivelHabilidad: 'AVANZADO' },
    create: { idUsuario: user2.idUsuario, idHabilidad: python.idHabilidad, nivelHabilidad: 'AVANZADO' },
  });

  await prisma.usuarioHabilidad.upsert({
    where: { idUsuario_idHabilidad: { idUsuario: user2.idUsuario, idHabilidad: disenoUiUx.idHabilidad } },
    update: { nivelHabilidad: 'INTERMEDIO' },
    create: { idUsuario: user2.idUsuario, idHabilidad: disenoUiUx.idHabilidad, nivelHabilidad: 'INTERMEDIO' },
  });

  // ─── Intereses → Usuarios ──────────────────────────────
  await prisma.usuarioInteres.upsert({
    where: { idUsuario_idInteres: { idUsuario: user1.idUsuario, idInteres: devWeb.idInteres } },
    update: {},
    create: { idUsuario: user1.idUsuario, idInteres: devWeb.idInteres },
  });

  await prisma.usuarioInteres.upsert({
    where: { idUsuario_idInteres: { idUsuario: user1.idUsuario, idInteres: ia.idInteres } },
    update: {},
    create: { idUsuario: user1.idUsuario, idInteres: ia.idInteres },
  });

  await prisma.usuarioInteres.upsert({
    where: { idUsuario_idInteres: { idUsuario: user2.idUsuario, idInteres: analisisDatos.idInteres } },
    update: {},
    create: { idUsuario: user2.idUsuario, idInteres: analisisDatos.idInteres },
  });

  // ─── Organización ──────────────────────────────────────
  const org = await prisma.organizacion.upsert({
    where: { idOrganizacion: 1 },
    update: {
      nombreOrganizacion: 'Asociación de Computación UVG',
      tipoOrganizacion: 'ASOCIACION',
      estadoOrganizacion: 'ACTIVA',
      creadaPor: user1.idUsuario,
    },
    create: {
      idOrganizacion: 1,
      nombreOrganizacion: 'Asociación de Computación UVG',
      tipoOrganizacion: 'ASOCIACION',
      estadoOrganizacion: 'ACTIVA',
      creadaPor: user1.idUsuario,
    },
  });

  await prisma.usuarioOrganizacion.upsert({
    where: { idUsuario_idOrganizacion: { idUsuario: user1.idUsuario, idOrganizacion: org.idOrganizacion } },
    update: { rolOrganizacion: 'PROPIETARIO' },
    create: { idUsuario: user1.idUsuario, idOrganizacion: org.idOrganizacion, rolOrganizacion: 'PROPIETARIO' },
  });

  await prisma.usuarioOrganizacion.upsert({
    where: { idUsuario_idOrganizacion: { idUsuario: user2.idUsuario, idOrganizacion: org.idOrganizacion } },
    update: { rolOrganizacion: 'MIEMBRO' },
    create: { idUsuario: user2.idUsuario, idOrganizacion: org.idOrganizacion, rolOrganizacion: 'MIEMBRO' },
  });

  // ─── Proyectos ─────────────────────────────────────────
  const proyecto1 = await prisma.proyecto.upsert({
    where: { idProyecto: 1 },
    update: {
      tituloProyecto: 'Plataforma de Tutorías UVG',
      descripcionProyecto: 'Sistema web para conectar tutores con estudiantes',
      tipoProyecto: 'ACADEMICO_HORAS_BECA',
      estadoProyecto: 'PUBLICADO',
      creadoPor: user1.idUsuario,
    },
    create: {
      idProyecto: 1,
      tituloProyecto: 'Plataforma de Tutorías UVG',
      descripcionProyecto: 'Sistema web para conectar tutores con estudiantes',
      tipoProyecto: 'ACADEMICO_HORAS_BECA',
      estadoProyecto: 'PUBLICADO',
      creadoPor: user1.idUsuario,
    },
  });

  const proyecto2 = await prisma.proyecto.upsert({
    where: { idProyecto: 2 },
    update: {
      tituloProyecto: 'App de Monitoreo Ambiental',
      descripcionProyecto: 'Aplicación móvil para monitorear calidad del aire en campus',
      tipoProyecto: 'EXTRACURRICULAR_EXTENSION',
      estadoProyecto: 'PUBLICADO',
      creadoPor: user2.idUsuario,
    },
    create: {
      idProyecto: 2,
      tituloProyecto: 'App de Monitoreo Ambiental',
      descripcionProyecto: 'Aplicación móvil para monitorear calidad del aire en campus',
      tipoProyecto: 'EXTRACURRICULAR_EXTENSION',
      estadoProyecto: 'PUBLICADO',
      creadoPor: user2.idUsuario,
    },
  });

  const proyecto3 = await prisma.proyecto.upsert({
    where: { idProyecto: 3 },
    update: {
      tituloProyecto: 'Investigación en Redes Neuronales',
      descripcionProyecto: 'Proyecto personal de investigación sobre modelos de lenguaje',
      tipoProyecto: 'ACADEMICO_EXPERIENCIA',
      estadoProyecto: 'BORRADOR',
      creadoPor: user1.idUsuario,
    },
    create: {
      idProyecto: 3,
      tituloProyecto: 'Investigación en Redes Neuronales',
      descripcionProyecto: 'Proyecto personal de investigación sobre modelos de lenguaje',
      tipoProyecto: 'ACADEMICO_EXPERIENCIA',
      estadoProyecto: 'BORRADOR',
      creadoPor: user1.idUsuario,
    },
  });

  // ─── Proyecto ↔ Organización ───────────────────────────
  await prisma.proyectoOrganizacion.upsert({
    where: { idProyecto_idOrganizacion: { idProyecto: proyecto1.idProyecto, idOrganizacion: org.idOrganizacion } },
    update: { rolOrganizacion: 'PRINCIPAL' },
    create: { idProyecto: proyecto1.idProyecto, idOrganizacion: org.idOrganizacion, rolOrganizacion: 'PRINCIPAL' },
  });

  await prisma.proyectoOrganizacion.upsert({
    where: { idProyecto_idOrganizacion: { idProyecto: proyecto2.idProyecto, idOrganizacion: org.idOrganizacion } },
    update: { rolOrganizacion: 'PRINCIPAL' },
    create: { idProyecto: proyecto2.idProyecto, idOrganizacion: org.idOrganizacion, rolOrganizacion: 'PRINCIPAL' },
  });

  // ─── Roles de proyecto ─────────────────────────────────
  const rolFrontend = await prisma.rolProyecto.upsert({
    where: { idRolProyecto: 1 },
    update: { idProyecto: proyecto1.idProyecto, nombreRol: 'Desarrollador Frontend', cupos: 2 },
    create: { idRolProyecto: 1, idProyecto: proyecto1.idProyecto, nombreRol: 'Desarrollador Frontend', cupos: 2 },
  });

  const rolUx = await prisma.rolProyecto.upsert({
    where: { idRolProyecto: 2 },
    update: { idProyecto: proyecto1.idProyecto, nombreRol: 'Diseñador UX', cupos: 1 },
    create: { idRolProyecto: 2, idProyecto: proyecto1.idProyecto, nombreRol: 'Diseñador UX', cupos: 1 },
  });

  const rolAnalista = await prisma.rolProyecto.upsert({
    where: { idRolProyecto: 3 },
    update: { idProyecto: proyecto2.idProyecto, nombreRol: 'Analista de Datos', cupos: 1 },
    create: { idRolProyecto: 3, idProyecto: proyecto2.idProyecto, nombreRol: 'Analista de Datos', cupos: 1 },
  });

  await prisma.rolProyecto.upsert({
    where: { idRolProyecto: 4 },
    update: { idProyecto: proyecto3.idProyecto, nombreRol: 'Investigador Junior', cupos: 2 },
    create: { idRolProyecto: 4, idProyecto: proyecto3.idProyecto, nombreRol: 'Investigador Junior', cupos: 2 },
  });

  // ─── Requisitos de habilidad por rol ───────────────────
  await prisma.requisitoHabilidadRol.upsert({
    where: { idRolProyecto_idHabilidad: { idRolProyecto: rolFrontend.idRolProyecto, idHabilidad: react.idHabilidad } },
    update: {},
    create: { idRolProyecto: rolFrontend.idRolProyecto, idHabilidad: react.idHabilidad },
  });

  await prisma.requisitoHabilidadRol.upsert({
    where: { idRolProyecto_idHabilidad: { idRolProyecto: rolFrontend.idRolProyecto, idHabilidad: typescript.idHabilidad } },
    update: {},
    create: { idRolProyecto: rolFrontend.idRolProyecto, idHabilidad: typescript.idHabilidad },
  });

  await prisma.requisitoHabilidadRol.upsert({
    where: { idRolProyecto_idHabilidad: { idRolProyecto: rolUx.idRolProyecto, idHabilidad: disenoUiUx.idHabilidad } },
    update: {},
    create: { idRolProyecto: rolUx.idRolProyecto, idHabilidad: disenoUiUx.idHabilidad },
  });

  await prisma.requisitoHabilidadRol.upsert({
    where: { idRolProyecto_idHabilidad: { idRolProyecto: rolAnalista.idRolProyecto, idHabilidad: python.idHabilidad } },
    update: {},
    create: { idRolProyecto: rolAnalista.idRolProyecto, idHabilidad: python.idHabilidad },
  });

  // ─── Intereses → Proyectos ─────────────────────────────
  await prisma.proyectoInteres.upsert({
    where: { idProyecto_idInteres: { idProyecto: proyecto1.idProyecto, idInteres: devWeb.idInteres } },
    update: {},
    create: { idProyecto: proyecto1.idProyecto, idInteres: devWeb.idInteres },
  });

  await prisma.proyectoInteres.upsert({
    where: { idProyecto_idInteres: { idProyecto: proyecto2.idProyecto, idInteres: analisisDatos.idInteres } },
    update: {},
    create: { idProyecto: proyecto2.idProyecto, idInteres: analisisDatos.idInteres },
  });

  await prisma.proyectoInteres.upsert({
    where: { idProyecto_idInteres: { idProyecto: proyecto3.idProyecto, idInteres: ia.idInteres } },
    update: {},
    create: { idProyecto: proyecto3.idProyecto, idInteres: ia.idInteres },
  });

  // ─── Postulación ───────────────────────────────────────
  await prisma.postulacion.upsert({
    where: { idPostulacion: 1 },
    update: {
      idUsuarioPostulante: user2.idUsuario,
      idRolProyecto: rolUx.idRolProyecto,
      justificacion: 'Tengo experiencia en diseño de interfaces y me interesa aportar al proyecto',
    },
    create: {
      idPostulacion: 1,
      idUsuarioPostulante: user2.idUsuario,
      idRolProyecto: rolUx.idRolProyecto,
      justificacion: 'Tengo experiencia en diseño de interfaces y me interesa aportar al proyecto',
    },
  });

  // ─── Reset sequences para tablas con IDs hardcodeados ──
  const sequences = [
    { table: 'carrera', column: 'id_carrera' },
    { table: 'habilidad', column: 'id_habilidad' },
    { table: 'organizacion', column: 'id_organizacion' },
    { table: 'proyecto', column: 'id_proyecto' },
    { table: 'rol_proyecto', column: 'id_rol_proyecto' },
    { table: 'postulacion', column: 'id_postulacion' },
  ];

  for (const { table, column } of sequences) {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('${table}', '${column}'), COALESCE((SELECT MAX(${column}) FROM ${table}), 0) + 1, false)`,
    );
  }

  console.log('Seed completed successfully');
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
