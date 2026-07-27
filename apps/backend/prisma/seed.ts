import { PrismaClient } from '@prisma/client';
import { hashSync } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const PASSWORD_HASH = hashSync('Test1234!', 10);

  // ─── Carreras ───────────────────────────────────────────
  const carreras = await Promise.all([
    prisma.carrera.upsert({
      where: { idCarrera: 1 },
      update: {},
      create: { idCarrera: 1, nombreCarrera: 'Ingeniería en Ciencias de la Computación y TI', facultad: 'Facultad de Ingeniería' },
    }),
    prisma.carrera.upsert({
      where: { idCarrera: 2 },
      update: {},
      create: { idCarrera: 2, nombreCarrera: 'Ingeniería Industrial', facultad: 'Facultad de Ingeniería' },
    }),
    prisma.carrera.upsert({
      where: { idCarrera: 3 },
      update: {},
      create: { idCarrera: 3, nombreCarrera: 'Ingeniería Biomédica', facultad: 'Facultad de Ingeniería' },
    }),
    prisma.carrera.upsert({
      where: { idCarrera: 4 },
      update: {},
      create: { idCarrera: 4, nombreCarrera: 'Ingeniería Mecatrónica', facultad: 'Facultad de Ingeniería' },
    }),
    prisma.carrera.upsert({
      where: { idCarrera: 5 },
      update: {},
      create: { idCarrera: 5, nombreCarrera: 'Ingeniería Química', facultad: 'Facultad de Ingeniería' },
    }),
  ]);
  const [computacion, industrial, biomedica, mecatronica, quimica] = carreras;

  // ─── Habilidades ────────────────────────────────────────
  const habilidades = await Promise.all([
    prisma.habilidad.upsert({ where: { idHabilidad: 1 }, update: {}, create: { idHabilidad: 1, nombreHabilidad: 'TypeScript', categoriaHabilidad: 'programación' } }),
    prisma.habilidad.upsert({ where: { idHabilidad: 2 }, update: {}, create: { idHabilidad: 2, nombreHabilidad: 'React', categoriaHabilidad: 'programación' } }),
    prisma.habilidad.upsert({ where: { idHabilidad: 3 }, update: {}, create: { idHabilidad: 3, nombreHabilidad: 'Python', categoriaHabilidad: 'programación' } }),
    prisma.habilidad.upsert({ where: { idHabilidad: 4 }, update: {}, create: { idHabilidad: 4, nombreHabilidad: 'PostgreSQL', categoriaHabilidad: 'bases de datos' } }),
    prisma.habilidad.upsert({ where: { idHabilidad: 5 }, update: {}, create: { idHabilidad: 5, nombreHabilidad: 'Diseño UI/UX', categoriaHabilidad: 'diseño' } }),
    prisma.habilidad.upsert({ where: { idHabilidad: 6 }, update: {}, create: { idHabilidad: 6, nombreHabilidad: 'NestJS', categoriaHabilidad: 'programación' } }),
    prisma.habilidad.upsert({ where: { idHabilidad: 7 }, update: {}, create: { idHabilidad: 7, nombreHabilidad: 'Prisma', categoriaHabilidad: 'programación' } }),
    prisma.habilidad.upsert({ where: { idHabilidad: 8 }, update: {}, create: { idHabilidad: 8, nombreHabilidad: 'Investigación académica', categoriaHabilidad: 'investigación' } }),
  ]);
  const [typescript, react, python, postgresql, disenoUiUx, nestjs, prismaSkill, investigacion] = habilidades;

  // ─── Intereses ──────────────────────────────────────────
  const intereses = await Promise.all([
    prisma.interes.upsert({ where: { nombreInteres: 'Inteligencia Artificial' }, update: {}, create: { nombreInteres: 'Inteligencia Artificial' } }),
    prisma.interes.upsert({ where: { nombreInteres: 'Desarrollo Web' }, update: {}, create: { nombreInteres: 'Desarrollo Web' } }),
    prisma.interes.upsert({ where: { nombreInteres: 'Investigación Científica' }, update: {}, create: { nombreInteres: 'Investigación Científica' } }),
    prisma.interes.upsert({ where: { nombreInteres: 'Robótica' }, update: {}, create: { nombreInteres: 'Robótica' } }),
    prisma.interes.upsert({ where: { nombreInteres: 'Análisis de Datos' }, update: {}, create: { nombreInteres: 'Análisis de Datos' } }),
    prisma.interes.upsert({ where: { nombreInteres: 'Ciberseguridad' }, update: {}, create: { nombreInteres: 'Ciberseguridad' } }),
  ]);
  const [ia, devWeb, investigacionCientifica, robotica, analisisDatos, ciberseguridad] = intereses;

  // ─── Cualidades ─────────────────────────────────────────
  const cualidades = await Promise.all([
    prisma.cualidad.upsert({ where: { nombreCualidad: 'Liderazgo' }, update: {}, create: { nombreCualidad: 'Liderazgo' } }),
    prisma.cualidad.upsert({ where: { nombreCualidad: 'Trabajo en equipo' }, update: {}, create: { nombreCualidad: 'Trabajo en equipo' } }),
    prisma.cualidad.upsert({ where: { nombreCualidad: 'Comunicación efectiva' }, update: {}, create: { nombreCualidad: 'Comunicación efectiva' } }),
    prisma.cualidad.upsert({ where: { nombreCualidad: 'Resolución de problemas' }, update: {}, create: { nombreCualidad: 'Resolución de problemas' } }),
    prisma.cualidad.upsert({ where: { nombreCualidad: 'Creatividad' }, update: {}, create: { nombreCualidad: 'Creatividad' } }),
  ]);
  const [liderazgo, trabajoEquipo, comunicacion, resolucion, creatividad] = cualidades;

  // ─── Permisos ─────────────────────────────────────────
  const permisos = await Promise.all([
    prisma.permiso.upsert({ where: { nombrePermiso: 'crear_proyecto' }, update: {}, create: { nombrePermiso: 'crear_proyecto', descripcionPermiso: 'Puede crear proyectos' } }),
    prisma.permiso.upsert({ where: { nombrePermiso: 'editar_proyecto' }, update: {}, create: { nombrePermiso: 'editar_proyecto', descripcionPermiso: 'Puede editar proyectos' } }),
    prisma.permiso.upsert({ where: { nombrePermiso: 'aprobar_horas' }, update: {}, create: { nombrePermiso: 'aprobar_horas', descripcionPermiso: 'Puede aprobar horas de participación' } }),
    prisma.permiso.upsert({ where: { nombrePermiso: 'emitir_certificado' }, update: {}, create: { nombrePermiso: 'emitir_certificado', descripcionPermiso: 'Puede emitir certificados' } }),
    prisma.permiso.upsert({ where: { nombrePermiso: 'gestionar_usuarios' }, update: {}, create: { nombrePermiso: 'gestionar_usuarios', descripcionPermiso: 'Puede gestionar usuarios del sistema' } }),
  ]);

  // ─── Roles de acceso ───────────────────────────────────
  const rolesAcceso = await Promise.all([
    prisma.rolAcceso.upsert({ where: { nombrePerfil: 'estudiante' }, update: {}, create: { nombrePerfil: 'estudiante', descripcion: 'Estudiante registrado en la plataforma' } }),
    prisma.rolAcceso.upsert({ where: { nombrePerfil: 'lider_asociacion' }, update: {}, create: { nombrePerfil: 'lider_asociacion', descripcion: 'Líder o administrador de una asociación estudiantil' } }),
    prisma.rolAcceso.upsert({ where: { nombrePerfil: 'coordinador_academico' }, update: {}, create: { nombrePerfil: 'coordinador_academico', descripcion: 'Coordinador que valida horas y emite certificados' } }),
    prisma.rolAcceso.upsert({ where: { nombrePerfil: 'administrador' }, update: {}, create: { nombrePerfil: 'administrador', descripcion: 'Administrador del sistema' } }),
    prisma.rolAcceso.upsert({ where: { nombrePerfil: 'mentor' }, update: {}, create: { nombrePerfil: 'mentor', descripcion: 'Mentor que guía a estudiantes en proyectos' } }),
  ]);
  const [rolEstudiante, rolLider, rolCoordinador, rolAdmin, rolMentor] = rolesAcceso;

  // ─── Rol ↔ Permiso ──────────────────────────────────────
  const rolPermisoData = [
    { idRolAcceso: rolAdmin.idRolAcceso, idPermiso: permisos[0].idPermiso },
    { idRolAcceso: rolAdmin.idRolAcceso, idPermiso: permisos[1].idPermiso },
    { idRolAcceso: rolAdmin.idRolAcceso, idPermiso: permisos[2].idPermiso },
    { idRolAcceso: rolAdmin.idRolAcceso, idPermiso: permisos[3].idPermiso },
    { idRolAcceso: rolAdmin.idRolAcceso, idPermiso: permisos[4].idPermiso },
    { idRolAcceso: rolCoordinador.idRolAcceso, idPermiso: permisos[2].idPermiso },
    { idRolAcceso: rolCoordinador.idRolAcceso, idPermiso: permisos[3].idPermiso },
    { idRolAcceso: rolLider.idRolAcceso, idPermiso: permisos[0].idPermiso },
    { idRolAcceso: rolLider.idRolAcceso, idPermiso: permisos[1].idPermiso },
  ];
  for (const rp of rolPermisoData) {
    await prisma.rolPermiso.upsert({
      where: { idRolAcceso_idPermiso: rp },
      update: {},
      create: rp,
    });
  }

  // ─── Usuarios (6) ─────────────────────────────────────────
  const usuarios = await Promise.all([
    prisma.usuario.upsert({
      where: { correo: 'carlos.mendoza@uvg.edu.gt' },
      update: {},
      create: { correo: 'carlos.mendoza@uvg.edu.gt', contrasena: PASSWORD_HASH, nombre: 'Carlos', apellido: 'Mendoza' },
    }),
    prisma.usuario.upsert({
      where: { correo: 'maria.lopez@uvg.edu.gt' },
      update: {},
      create: { correo: 'maria.lopez@uvg.edu.gt', contrasena: PASSWORD_HASH, nombre: 'María', apellido: 'López' },
    }),
    prisma.usuario.upsert({
      where: { correo: 'jose.ramirez@uvg.edu.gt' },
      update: {},
      create: { correo: 'jose.ramirez@uvg.edu.gt', contrasena: PASSWORD_HASH, nombre: 'José', apellido: 'Ramírez' },
    }),
    prisma.usuario.upsert({
      where: { correo: 'ana.garcia@uvg.edu.gt' },
      update: {},
      create: { correo: 'ana.garcia@uvg.edu.gt', contrasena: PASSWORD_HASH, nombre: 'Ana', apellido: 'García' },
    }),
    prisma.usuario.upsert({
      where: { correo: 'luis.hernandez@uvg.edu.gt' },
      update: {},
      create: { correo: 'luis.hernandez@uvg.edu.gt', contrasena: PASSWORD_HASH, nombre: 'Luis', apellido: 'Hernández' },
    }),
    prisma.usuario.upsert({
      where: { correo: 'sofia.martinez@uvg.edu.gt' },
      update: {},
      create: { correo: 'sofia.martinez@uvg.edu.gt', contrasena: PASSWORD_HASH, nombre: 'Sofía', apellido: 'Martínez' },
    }),
  ]);
  const [carlos, maria, jose, ana, luis, sofia] = usuarios;

  // ─── Teléfonos ──────────────────────────────────────────
  for (const [i, user] of usuarios.entries()) {
    await prisma.usuarioTelefono.upsert({
      where: { idUsuarioTelefono: i + 1 },
      update: {},
      create: { idUsuarioTelefono: i + 1, idUsuario: user.idUsuario, numero: `5555-${String(1000 + i)}`, tipoTelefono: 'PERSONAL', esPrincipal: true },
    });
  }

  // ─── Perfiles de estudiante ─────────────────────────────
  const perfilData = [
    { idUsuario: carlos.idUsuario, carne: '24001', idCarrera: computacion.idCarrera, semestre: 6, disponibilidadHorasSemana: 10 },
    { idUsuario: maria.idUsuario, carne: '24002', idCarrera: industrial.idCarrera, semestre: 4, disponibilidadHorasSemana: 8 },
    { idUsuario: jose.idUsuario, carne: '24003', idCarrera: biomedica.idCarrera, semestre: 7, disponibilidadHorasSemana: 12 },
    { idUsuario: ana.idUsuario, carne: '24004', idCarrera: mecatronica.idCarrera, semestre: 5, disponibilidadHorasSemana: 6 },
    { idUsuario: luis.idUsuario, carne: '24005', idCarrera: computacion.idCarrera, semestre: 8, disponibilidadHorasSemana: 15 },
    { idUsuario: sofia.idUsuario, carne: '24006', idCarrera: quimica.idCarrera, semestre: 3, disponibilidadHorasSemana: 10 },
  ];
  for (const p of perfilData) {
    await prisma.perfilEstudiante.upsert({ where: { idUsuario: p.idUsuario }, update: {}, create: p });
  }

  // ─── Roles de acceso → Usuarios ────────────────────────
  const usuarioRolData = [
    { idUsuario: carlos.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso },
    { idUsuario: maria.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso },
    { idUsuario: jose.idUsuario, idRolAcceso: rolLider.idRolAcceso },
    { idUsuario: ana.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso },
    { idUsuario: luis.idUsuario, idRolAcceso: rolCoordinador.idRolAcceso },
    { idUsuario: sofia.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso },
  ];
  for (const ur of usuarioRolData) {
    await prisma.usuarioRolAcceso.upsert({
      where: { idUsuario_idRolAcceso: ur },
      update: {},
      create: ur,
    });
  }

  // ─── Habilidades → Usuarios ─────────────────────────────
  const uhData = [
    { idUsuario: carlos.idUsuario, idHabilidad: typescript.idHabilidad, nivelHabilidad: 'INTERMEDIO' as const },
    { idUsuario: carlos.idUsuario, idHabilidad: react.idHabilidad, nivelHabilidad: 'INTERMEDIO' as const },
    { idUsuario: carlos.idUsuario, idHabilidad: postgresql.idHabilidad, nivelHabilidad: 'BASICO' as const },
    { idUsuario: maria.idUsuario, idHabilidad: python.idHabilidad, nivelHabilidad: 'AVANZADO' as const },
    { idUsuario: maria.idUsuario, idHabilidad: disenoUiUx.idHabilidad, nivelHabilidad: 'INTERMEDIO' as const },
    { idUsuario: jose.idUsuario, idHabilidad: nestjs.idHabilidad, nivelHabilidad: 'AVANZADO' as const },
    { idUsuario: jose.idUsuario, idHabilidad: typescript.idHabilidad, nivelHabilidad: 'AVANZADO' as const },
    { idUsuario: ana.idUsuario, idHabilidad: disenoUiUx.idHabilidad, nivelHabilidad: 'AVANZADO' as const },
    { idUsuario: ana.idUsuario, idHabilidad: react.idHabilidad, nivelHabilidad: 'BASICO' as const },
    { idUsuario: luis.idUsuario, idHabilidad: postgresql.idHabilidad, nivelHabilidad: 'AVANZADO' as const },
    { idUsuario: luis.idUsuario, idHabilidad: prismaSkill.idHabilidad, nivelHabilidad: 'INTERMEDIO' as const },
    { idUsuario: sofia.idUsuario, idHabilidad: investigacion.idHabilidad, nivelHabilidad: 'INTERMEDIO' as const },
    { idUsuario: sofia.idUsuario, idHabilidad: python.idHabilidad, nivelHabilidad: 'BASICO' as const },
  ];
  for (const uh of uhData) {
    await prisma.usuarioHabilidad.upsert({
      where: { idUsuario_idHabilidad: { idUsuario: uh.idUsuario, idHabilidad: uh.idHabilidad } },
      update: {},
      create: uh,
    });
  }

  // ─── Intereses → Usuarios ──────────────────────────────
  const uiData = [
    { idUsuario: carlos.idUsuario, idInteres: devWeb.idInteres },
    { idUsuario: carlos.idUsuario, idInteres: ia.idInteres },
    { idUsuario: maria.idUsuario, idInteres: analisisDatos.idInteres },
    { idUsuario: maria.idUsuario, idInteres: ciberseguridad.idInteres },
    { idUsuario: jose.idUsuario, idInteres: devWeb.idInteres },
    { idUsuario: jose.idUsuario, idInteres: robotica.idInteres },
    { idUsuario: ana.idUsuario, idInteres: ia.idInteres },
    { idUsuario: luis.idUsuario, idInteres: investigacionCientifica.idInteres },
    { idUsuario: sofia.idUsuario, idInteres: analisisDatos.idInteres },
  ];
  for (const ui of uiData) {
    await prisma.usuarioInteres.upsert({
      where: { idUsuario_idInteres: ui },
      update: {},
      create: ui,
    });
  }

  // ─── Cualidades → Usuarios ─────────────────────────────
  const ucData = [
    { idUsuario: carlos.idUsuario, idCualidad: liderazgo.idCualidad },
    { idUsuario: carlos.idUsuario, idCualidad: resolucion.idCualidad },
    { idUsuario: maria.idUsuario, idCualidad: creatividad.idCualidad },
    { idUsuario: jose.idUsuario, idCualidad: trabajoEquipo.idCualidad },
    { idUsuario: ana.idUsuario, idCualidad: comunicacion.idCualidad },
    { idUsuario: luis.idUsuario, idCualidad: liderazgo.idCualidad },
    { idUsuario: sofia.idUsuario, idCualidad: trabajoEquipo.idCualidad },
  ];
  for (const uc of ucData) {
    await prisma.usuarioCualidad.upsert({
      where: { idUsuario_idCualidad: uc },
      update: {},
      create: uc,
    });
  }

  // ─── Experiencias previas ──────────────────────────────
  const expData = [
    { idUsuario: carlos.idUsuario, tituloProyectoExperiencia: 'Sistema de inventarios', rolDesempenado: 'Frontend Dev', tipoExperiencia: 'PROYECTO_UNIVERSITARIO' as const },
    { idUsuario: carlos.idUsuario, tituloProyectoExperiencia: 'Pasantía en Banco Industrial', rolDesempenado: 'Desarrollador Jr', tipoExperiencia: 'PASANTIA' as const },
    { idUsuario: maria.idUsuario, tituloProyectoExperiencia: 'Dashboard de métricas ambientales', rolDesempenado: 'Data Analyst', tipoExperiencia: 'PROYECTO_UNIVERSITARIO' as const },
    { idUsuario: jose.idUsuario, tituloProyectoExperiencia: 'API de gestión hospitalaria', rolDesempenado: 'Backend Dev', tipoExperiencia: 'PASANTIA' as const },
    { idUsuario: ana.idUsuario, tituloProyectoExperiencia: 'Rediseño portal estudiantil', rolDesempenado: 'UX Designer', tipoExperiencia: 'VOLUNTARIADO' as const },
    { idUsuario: luis.idUsuario, tituloProyectoExperiencia: 'Investigación machine learning', rolDesempenado: 'Investigador', tipoExperiencia: 'INVESTIGACION' as const },
  ];
  for (const [i, exp] of expData.entries()) {
    await prisma.experienciaPrevia.upsert({
      where: { idExperiencia: i + 1 },
      update: {},
      create: { idExperiencia: i + 1, ...exp },
    });
  }

  // ─── Organizaciones ──────────────────────────────────────
  const organizaciones = await Promise.all([
    prisma.organizacion.upsert({
      where: { idOrganizacion: 1 },
      update: {},
      create: { idOrganizacion: 1, nombreOrganizacion: 'Asociación de Computación UVG', tipoOrganizacion: 'ASOCIACION', creadaPor: carlos.idUsuario },
    }),
    prisma.organizacion.upsert({
      where: { idOrganizacion: 2 },
      update: {},
      create: { idOrganizacion: 2, nombreOrganizacion: 'Grupo de Robótica UVG', tipoOrganizacion: 'GRUPO_ESTUDIANTIL', creadaPor: jose.idUsuario },
    }),
    prisma.organizacion.upsert({
      where: { idOrganizacion: 3 },
      update: {},
      create: { idOrganizacion: 3, nombreOrganizacion: 'Centro de Investigación Biomédica', tipoOrganizacion: 'CENTRO_INVESTIGACION', creadaPor: luis.idUsuario },
    }),
    prisma.organizacion.upsert({
      where: { idOrganizacion: 4 },
      update: {},
      create: { idOrganizacion: 4, nombreOrganizacion: 'Instituto de Sostenibilidad', tipoOrganizacion: 'INSTITUTO', creadaPor: sofia.idUsuario },
    }),
    prisma.organizacion.upsert({
      where: { idOrganizacion: 5 },
      update: {},
      create: { idOrganizacion: 5, nombreOrganizacion: 'Asociación de Ingeniería Industrial', tipoOrganizacion: 'ASOCIACION', creadaPor: maria.idUsuario },
    }),
  ]);
  const [orgCompu, orgRobot, orgBio, orgSost, orgIndust] = organizaciones;

  // ─── Usuarios ↔ Organizaciones ──────────────────────────
  const uoData = [
    { idUsuario: carlos.idUsuario, idOrganizacion: orgCompu.idOrganizacion, rolOrganizacion: 'PROPIETARIO' as const },
    { idUsuario: maria.idUsuario, idOrganizacion: orgCompu.idOrganizacion, rolOrganizacion: 'MIEMBRO' as const },
    { idUsuario: jose.idUsuario, idOrganizacion: orgRobot.idOrganizacion, rolOrganizacion: 'PROPIETARIO' as const },
    { idUsuario: ana.idUsuario, idOrganizacion: orgRobot.idOrganizacion, rolOrganizacion: 'MIEMBRO' as const },
    { idUsuario: luis.idUsuario, idOrganizacion: orgBio.idOrganizacion, rolOrganizacion: 'PROPIETARIO' as const },
    { idUsuario: sofia.idUsuario, idOrganizacion: orgSost.idOrganizacion, rolOrganizacion: 'PROPIETARIO' as const },
    { idUsuario: maria.idUsuario, idOrganizacion: orgIndust.idOrganizacion, rolOrganizacion: 'PROPIETARIO' as const },
    { idUsuario: carlos.idUsuario, idOrganizacion: orgRobot.idOrganizacion, rolOrganizacion: 'MIEMBRO' as const },
  ];
  for (const uo of uoData) {
    await prisma.usuarioOrganizacion.upsert({
      where: { idUsuario_idOrganizacion: { idUsuario: uo.idUsuario, idOrganizacion: uo.idOrganizacion } },
      update: {},
      create: uo,
    });
  }

  // ─── Proyectos (5) ─────────────────────────────────────
  const proyectos = await Promise.all([
    prisma.proyecto.upsert({
      where: { idProyecto: 1 },
      update: {},
      create: {
        idProyecto: 1, tituloProyecto: 'Plataforma de Tutorías UVG', descripcionProyecto: 'Sistema web para conectar tutores con estudiantes',
        tipoProyecto: 'ACADEMICO_HORAS_BECA', estadoProyecto: 'PUBLICADO', creadoPor: carlos.idUsuario, fechaInicio: new Date('2026-02-01'), fechaFinEstimada: new Date('2026-06-30'),
      },
    }),
    prisma.proyecto.upsert({
      where: { idProyecto: 2 },
      update: {},
      create: {
        idProyecto: 2, tituloProyecto: 'App de Monitoreo Ambiental', descripcionProyecto: 'Aplicación móvil para monitorear calidad del aire en campus',
        tipoProyecto: 'EXTRACURRICULAR_EXTENSION', estadoProyecto: 'PUBLICADO', creadoPor: maria.idUsuario, fechaInicio: new Date('2026-03-01'), fechaFinEstimada: new Date('2026-08-30'),
      },
    }),
    prisma.proyecto.upsert({
      where: { idProyecto: 3 },
      update: {},
      create: {
        idProyecto: 3, tituloProyecto: 'Investigación en Redes Neuronales', descripcionProyecto: 'Proyecto de investigación sobre modelos de lenguaje',
        tipoProyecto: 'ACADEMICO_EXPERIENCIA', estadoProyecto: 'EN_PROGRESO', creadoPor: luis.idUsuario, fechaInicio: new Date('2026-01-15'), fechaFinEstimada: new Date('2026-12-15'),
      },
    }),
    prisma.proyecto.upsert({
      where: { idProyecto: 4 },
      update: {},
      create: {
        idProyecto: 4, tituloProyecto: 'Robot Seguidor de Línea', descripcionProyecto: 'Diseño y construcción de robot autónomo para competencia',
        tipoProyecto: 'EXTRACURRICULAR_EXTENSION', estadoProyecto: 'PUBLICADO', creadoPor: jose.idUsuario, fechaInicio: new Date('2026-04-01'), fechaFinEstimada: new Date('2026-07-30'),
      },
    }),
    prisma.proyecto.upsert({
      where: { idProyecto: 5 },
      update: {},
      create: {
        idProyecto: 5, tituloProyecto: 'Portal de Empleo UVG', descripcionProyecto: 'Plataforma para conectar egresados con empresas',
        tipoProyecto: 'ACADEMICO_HORAS_BECA', estadoProyecto: 'PUBLICADO', creadoPor: carlos.idUsuario, fechaInicio: new Date('2026-03-15'), fechaFinEstimada: new Date('2026-09-30'),
      },
    }),
    prisma.proyecto.upsert({
      where: { idProyecto: 6 },
      update: {},
      create: {
        idProyecto: 6, tituloProyecto: 'Laboratorio de Datos Abiertos', descripcionProyecto: 'Consolidación de datasets universitarios para investigación aplicada',
        tipoProyecto: 'ACADEMICO_EXPERIENCIA', estadoProyecto: 'EN_REVISION', creadoPor: maria.idUsuario, fechaInicio: new Date('2026-05-01'), fechaFinEstimada: new Date('2026-11-30'),
      },
    }),
    prisma.proyecto.upsert({
      where: { idProyecto: 7 },
      update: {},
      create: {
        idProyecto: 7, tituloProyecto: 'Red de Mentores UVG', descripcionProyecto: 'Plataforma para conectar estudiantes con mentores de la industria',
        tipoProyecto: 'EXTRACURRICULAR_EXTENSION', estadoProyecto: 'OBSERVADO', creadoPor: jose.idUsuario, fechaInicio: new Date('2026-05-15'), fechaFinEstimada: new Date('2026-12-15'),
      },
    }),
    prisma.proyecto.upsert({
      where: { idProyecto: 8 },
      update: {},
      create: {
        idProyecto: 8, tituloProyecto: 'Sistema de Inventario Verde', descripcionProyecto: 'Digitalización de inventario para materiales reutilizables del campus',
        tipoProyecto: 'ACADEMICO_HORAS_BECA', estadoProyecto: 'EN_SOLICITUD_CIERRE', creadoPor: carlos.idUsuario, fechaInicio: new Date('2026-01-10'), fechaFinEstimada: new Date('2026-07-10'),
      },
    }),
    prisma.proyecto.upsert({
      where: { idProyecto: 9 },
      update: {},
      create: {
        idProyecto: 9, tituloProyecto: 'Archivo Histórico Digital', descripcionProyecto: 'Rescate y catalogación digital de documentos históricos universitarios',
        tipoProyecto: 'ACADEMICO_EXPERIENCIA', estadoProyecto: 'CANCELADO', creadoPor: sofia.idUsuario, fechaInicio: new Date('2025-09-01'), fechaFinEstimada: new Date('2026-03-01'), eliminadoEn: new Date('2026-03-10'),
      },
    }),
  ]);
  const [pTutorias, pAmbiental, pNeural, pRobot, pEmpleo, pRevision, pObservado, pCierre, pCancelado] = proyectos;

  // ─── Revisiones de proyecto (estados EN_REVISION / OBSERVADO) ─────────────
  await prisma.revisionProyecto.upsert({
    where: { idRevisionProyecto: 1 },
    update: {},
    create: {
      idRevisionProyecto: 1,
      idProyecto: pRevision.idProyecto,
      estadoRevision: 'PENDIENTE',
      numeroEnvio: 1,
    },
  });
  await prisma.revisionProyecto.upsert({
    where: { idRevisionProyecto: 2 },
    update: {
      comentarioRevision: 'Información general:\nAgregar más detalle en los objetivos del proyecto, especificando metas medibles y cronograma.\n\nRoles y habilidades:\nEspecificar mejor las habilidades requeridas para cada rol y ajustar los cupos según la necesidad real.',
    },
    create: {
      idRevisionProyecto: 2,
      idProyecto: pObservado.idProyecto,
      idRevisor: luis.idUsuario,
      estadoRevision: 'OBSERVADA',
      comentarioRevision: 'Información general:\nAgregar más detalle en los objetivos del proyecto, especificando metas medibles y cronograma.\n\nRoles y habilidades:\nEspecificar mejor las habilidades requeridas para cada rol y ajustar los cupos según la necesidad real.',
      numeroEnvio: 1,
      revisadaEn: new Date('2026-04-01'),
    },
  });

  // ─── Proyecto ↔ Organización ───────────────────────────
  const poData = [
    { idProyecto: pTutorias.idProyecto, idOrganizacion: orgCompu.idOrganizacion, rolOrganizacion: 'PRINCIPAL' as const },
    { idProyecto: pAmbiental.idProyecto, idOrganizacion: orgSost.idOrganizacion, rolOrganizacion: 'PRINCIPAL' as const },
    { idProyecto: pNeural.idProyecto, idOrganizacion: orgBio.idOrganizacion, rolOrganizacion: 'PRINCIPAL' as const },
    { idProyecto: pRobot.idProyecto, idOrganizacion: orgRobot.idOrganizacion, rolOrganizacion: 'PRINCIPAL' as const },
    { idProyecto: pEmpleo.idProyecto, idOrganizacion: orgCompu.idOrganizacion, rolOrganizacion: 'PRINCIPAL' as const },
    { idProyecto: pEmpleo.idProyecto, idOrganizacion: orgIndust.idOrganizacion, rolOrganizacion: 'COLABORADORA' as const },
    { idProyecto: pRevision.idProyecto, idOrganizacion: orgIndust.idOrganizacion, rolOrganizacion: 'PRINCIPAL' as const },
    { idProyecto: pObservado.idProyecto, idOrganizacion: orgRobot.idOrganizacion, rolOrganizacion: 'PRINCIPAL' as const },
    { idProyecto: pCierre.idProyecto, idOrganizacion: orgCompu.idOrganizacion, rolOrganizacion: 'PRINCIPAL' as const },
    { idProyecto: pCancelado.idProyecto, idOrganizacion: orgSost.idOrganizacion, rolOrganizacion: 'PRINCIPAL' as const },
  ];
  for (const po of poData) {
    await prisma.proyectoOrganizacion.upsert({
      where: { idProyecto_idOrganizacion: { idProyecto: po.idProyecto, idOrganizacion: po.idOrganizacion } },
      update: {},
      create: po,
    });
  }

  // ─── Proyecto ↔ Intereses ─────────────────────────────
  const piData = [
    { idProyecto: pTutorias.idProyecto, idInteres: devWeb.idInteres },
    { idProyecto: pAmbiental.idProyecto, idInteres: analisisDatos.idInteres },
    { idProyecto: pNeural.idProyecto, idInteres: ia.idInteres },
    { idProyecto: pRobot.idProyecto, idInteres: robotica.idInteres },
    { idProyecto: pEmpleo.idProyecto, idInteres: devWeb.idInteres },
    { idProyecto: pNeural.idProyecto, idInteres: investigacionCientifica.idInteres },
    { idProyecto: pRevision.idProyecto, idInteres: analisisDatos.idInteres },
    { idProyecto: pObservado.idProyecto, idInteres: devWeb.idInteres },
    { idProyecto: pCierre.idProyecto, idInteres: investigacionCientifica.idInteres },
    { idProyecto: pCancelado.idProyecto, idInteres: investigacionCientifica.idInteres },
  ];
  for (const pi of piData) {
    await prisma.proyectoInteres.upsert({
      where: { idProyecto_idInteres: pi },
      update: {},
      create: pi,
    });
  }

  // ─── Roles de proyecto ─────────────────────────────────
  const rolesProyecto = await Promise.all([
    prisma.rolProyecto.upsert({ where: { idRolProyecto: 1 }, update: {}, create: { idRolProyecto: 1, idProyecto: pTutorias.idProyecto, nombreRol: 'Desarrollador Frontend', cupos: 2 } }),
    prisma.rolProyecto.upsert({ where: { idRolProyecto: 2 }, update: {}, create: { idRolProyecto: 2, idProyecto: pTutorias.idProyecto, nombreRol: 'Diseñador UX', cupos: 1 } }),
    prisma.rolProyecto.upsert({ where: { idRolProyecto: 3 }, update: {}, create: { idRolProyecto: 3, idProyecto: pAmbiental.idProyecto, nombreRol: 'Analista de Datos', cupos: 1 } }),
    prisma.rolProyecto.upsert({ where: { idRolProyecto: 4 }, update: {}, create: { idRolProyecto: 4, idProyecto: pNeural.idProyecto, nombreRol: 'Investigador Junior', cupos: 2 } }),
    prisma.rolProyecto.upsert({ where: { idRolProyecto: 5 }, update: {}, create: { idRolProyecto: 5, idProyecto: pRobot.idProyecto, nombreRol: 'Programador Embebido', cupos: 2 } }),
    prisma.rolProyecto.upsert({ where: { idRolProyecto: 6 }, update: {}, create: { idRolProyecto: 6, idProyecto: pEmpleo.idProyecto, nombreRol: 'Desarrollador Fullstack', cupos: 3 } }),
    prisma.rolProyecto.upsert({ where: { idRolProyecto: 7 }, update: {}, create: { idRolProyecto: 7, idProyecto: pAmbiental.idProyecto, nombreRol: 'Desarrollador Mobile', cupos: 2 } }),
  ]);
  const [rolFrontend, rolUx, rolAnalista, rolInvestigador, rolEmbebido, rolFullstack, rolMobile] = rolesProyecto;

  // ─── Requisitos de habilidad por rol ───────────────────
  const rhData = [
    { idRolProyecto: rolFrontend.idRolProyecto, idHabilidad: react.idHabilidad },
    { idRolProyecto: rolFrontend.idRolProyecto, idHabilidad: typescript.idHabilidad },
    { idRolProyecto: rolUx.idRolProyecto, idHabilidad: disenoUiUx.idHabilidad },
    { idRolProyecto: rolAnalista.idRolProyecto, idHabilidad: python.idHabilidad },
    { idRolProyecto: rolInvestigador.idRolProyecto, idHabilidad: investigacion.idHabilidad },
    { idRolProyecto: rolFullstack.idRolProyecto, idHabilidad: nestjs.idHabilidad },
    { idRolProyecto: rolFullstack.idRolProyecto, idHabilidad: react.idHabilidad },
  ];
  for (const rh of rhData) {
    await prisma.requisitoHabilidadRol.upsert({
      where: { idRolProyecto_idHabilidad: rh },
      update: {},
      create: rh,
    });
  }

  // ─── Postulaciones ───────────────────────────────────────
  const postulaciones = [];
  const postData = [
    { idUsuarioPostulante: maria.idUsuario, idRolProyecto: rolUx.idRolProyecto, justificacion: 'Tengo experiencia en diseño de interfaces', estadoPostulacion: 'ACEPTADA' as const, resueltaPor: carlos.idUsuario },
    { idUsuarioPostulante: jose.idUsuario, idRolProyecto: rolFrontend.idRolProyecto, justificacion: 'Domino TypeScript y React con experiencia en proyectos reales', estadoPostulacion: 'ACEPTADA' as const, resueltaPor: carlos.idUsuario },
    { idUsuarioPostulante: ana.idUsuario, idRolProyecto: rolAnalista.idRolProyecto, justificacion: 'Me interesa el análisis de datos ambientales', estadoPostulacion: 'PENDIENTE' as const },
    { idUsuarioPostulante: sofia.idUsuario, idRolProyecto: rolInvestigador.idRolProyecto, justificacion: 'Quiero iniciarme en investigación de ML', estadoPostulacion: 'ACEPTADA' as const, resueltaPor: luis.idUsuario },
    { idUsuarioPostulante: carlos.idUsuario, idRolProyecto: rolEmbebido.idRolProyecto, justificacion: 'Tengo interés en sistemas embebidos', estadoPostulacion: 'PENDIENTE' as const },
    { idUsuarioPostulante: luis.idUsuario, idRolProyecto: rolFullstack.idRolProyecto, justificacion: 'Experiencia con NestJS y React, quiero aportar al portal', estadoPostulacion: 'ACEPTADA' as const, resueltaPor: carlos.idUsuario },
  ];
  for (const [i, pd] of postData.entries()) {
    const post = await prisma.postulacion.upsert({
      where: { idPostulacion: i + 1 },
      update: {},
      create: { idPostulacion: i + 1, ...pd, fechaResolucion: pd.resueltaPor ? new Date() : undefined },
    });
    postulaciones.push(post);
  }

  // ─── Participaciones ─────────────────────────────────────
  const participaciones = [];
  const partData = [
    { idUsuario: maria.idUsuario, idRolProyecto: rolUx.idRolProyecto, idPostulacion: postulaciones[0].idPostulacion, estadoParticipacion: 'ACTIVO' as const },
    { idUsuario: jose.idUsuario, idRolProyecto: rolFrontend.idRolProyecto, idPostulacion: postulaciones[1].idPostulacion, estadoParticipacion: 'ACTIVO' as const },
    { idUsuario: sofia.idUsuario, idRolProyecto: rolInvestigador.idRolProyecto, idPostulacion: postulaciones[3].idPostulacion, estadoParticipacion: 'ACTIVO' as const },
    { idUsuario: luis.idUsuario, idRolProyecto: rolFullstack.idRolProyecto, idPostulacion: postulaciones[5].idPostulacion, estadoParticipacion: 'ACTIVO' as const },
    { idUsuario: carlos.idUsuario, idRolProyecto: rolFrontend.idRolProyecto, estadoParticipacion: 'ACTIVO' as const },
  ];
  for (const [i, pd] of partData.entries()) {
    const part = await prisma.participacionProyecto.upsert({
      where: { idParticipacion: i + 1 },
      update: {},
      create: { idParticipacion: i + 1, ...pd },
    });
    participaciones.push(part);
  }

  // ─── Hitos ──────────────────────────────────────────────
  const hitos = await Promise.all([
    prisma.hito.upsert({ where: { idHito: 1 }, update: {}, create: { idHito: 1, idProyecto: pTutorias.idProyecto, tituloHito: 'Diseño de wireframes', orden: 1, estadoHito: 'COMPLETADO', fechaLimite: new Date('2026-03-01') } }),
    prisma.hito.upsert({ where: { idHito: 2 }, update: {}, create: { idHito: 2, idProyecto: pTutorias.idProyecto, tituloHito: 'MVP funcional', orden: 2, estadoHito: 'EN_PROGRESO', fechaLimite: new Date('2026-04-15') } }),
    prisma.hito.upsert({ where: { idHito: 3 }, update: {}, create: { idHito: 3, idProyecto: pAmbiental.idProyecto, tituloHito: 'Prototipo de sensores', orden: 1, estadoHito: 'PENDIENTE', fechaLimite: new Date('2026-05-01') } }),
    prisma.hito.upsert({ where: { idHito: 4 }, update: {}, create: { idHito: 4, idProyecto: pNeural.idProyecto, tituloHito: 'Revisión bibliográfica', orden: 1, estadoHito: 'COMPLETADO', fechaLimite: new Date('2026-02-28') } }),
    prisma.hito.upsert({ where: { idHito: 5 }, update: {}, create: { idHito: 5, idProyecto: pRobot.idProyecto, tituloHito: 'Ensamble del chasis', orden: 1, estadoHito: 'PENDIENTE', fechaLimite: new Date('2026-05-15') } }),
    prisma.hito.upsert({ where: { idHito: 6 }, update: {}, create: { idHito: 6, idProyecto: pEmpleo.idProyecto, tituloHito: 'Diseño de base de datos', orden: 1, estadoHito: 'COMPLETADO', fechaLimite: new Date('2026-04-01') } }),
  ]);

  // ─── Tareas ─────────────────────────────────────────────
  const tareas = await Promise.all([
    prisma.tarea.upsert({ where: { idTarea: 1 }, update: {}, create: { idTarea: 1, idProyecto: pTutorias.idProyecto, idHito: hitos[0].idHito, tituloTarea: 'Crear mockups en Figma', estadoTarea: 'HECHO', prioridad: 'ALTA', creadaPor: carlos.idUsuario } }),
    prisma.tarea.upsert({ where: { idTarea: 2 }, update: {}, create: { idTarea: 2, idProyecto: pTutorias.idProyecto, idHito: hitos[1].idHito, tituloTarea: 'Implementar autenticación', estadoTarea: 'EN_PROGRESO', prioridad: 'ALTA', creadaPor: carlos.idUsuario } }),
    prisma.tarea.upsert({ where: { idTarea: 3 }, update: {}, create: { idTarea: 3, idProyecto: pTutorias.idProyecto, idHito: hitos[1].idHito, tituloTarea: 'CRUD de sesiones de tutoría', estadoTarea: 'POR_HACER', prioridad: 'MEDIA', creadaPor: carlos.idUsuario } }),
    prisma.tarea.upsert({ where: { idTarea: 4 }, update: {}, create: { idTarea: 4, idProyecto: pAmbiental.idProyecto, idHito: hitos[2].idHito, tituloTarea: 'Investigar sensores de CO2', estadoTarea: 'POR_HACER', prioridad: 'MEDIA', creadaPor: maria.idUsuario } }),
    prisma.tarea.upsert({ where: { idTarea: 5 }, update: {}, create: { idTarea: 5, idProyecto: pNeural.idProyecto, idHito: hitos[3].idHito, tituloTarea: 'Leer papers sobre transformers', estadoTarea: 'HECHO', prioridad: 'ALTA', creadaPor: luis.idUsuario } }),
    prisma.tarea.upsert({ where: { idTarea: 6 }, update: {}, create: { idTarea: 6, idProyecto: pEmpleo.idProyecto, idHito: hitos[5].idHito, tituloTarea: 'Diseñar schema Prisma', estadoTarea: 'HECHO', prioridad: 'ALTA', creadaPor: carlos.idUsuario } }),
    prisma.tarea.upsert({ where: { idTarea: 7 }, update: {}, create: { idTarea: 7, idProyecto: pEmpleo.idProyecto, tituloTarea: 'Implementar búsqueda de empleos', estadoTarea: 'EN_PROGRESO', prioridad: 'MEDIA', creadaPor: carlos.idUsuario } }),
  ]);

  // ─── Asignaciones de tarea ──────────────────────────────
  // La Tarea 7 retiró @@unique([idTarea, idUsuario]) de AsignacionTarea para
  // permitir reasignar al mismo usuario tras una desasignación, por lo que el
  // seed ya no puede usar ese par como llave de upsert; se fija idAsignacion.
  const asignData = [
    { idAsignacion: 1, idTarea: tareas[0].idTarea, idUsuario: maria.idUsuario, asignadoPor: carlos.idUsuario },
    { idAsignacion: 2, idTarea: tareas[1].idTarea, idUsuario: jose.idUsuario, asignadoPor: carlos.idUsuario },
    { idAsignacion: 3, idTarea: tareas[2].idTarea, idUsuario: jose.idUsuario, asignadoPor: carlos.idUsuario },
    { idAsignacion: 4, idTarea: tareas[3].idTarea, idUsuario: maria.idUsuario, asignadoPor: maria.idUsuario },
    { idAsignacion: 5, idTarea: tareas[4].idTarea, idUsuario: sofia.idUsuario, asignadoPor: luis.idUsuario },
    { idAsignacion: 6, idTarea: tareas[5].idTarea, idUsuario: luis.idUsuario, asignadoPor: carlos.idUsuario },
    { idAsignacion: 7, idTarea: tareas[6].idTarea, idUsuario: luis.idUsuario, asignadoPor: carlos.idUsuario },
  ];
  for (const a of asignData) {
    await prisma.asignacionTarea.upsert({
      where: { idAsignacion: a.idAsignacion },
      update: {},
      create: a,
    });
  }

  // ─── Tareas adicionales: rol, EN_REVISION, BAJA y estimación opcional ───
  const tareaBusquedaOptimizada = await prisma.tarea.upsert({
    where: { idTarea: 8 },
    update: {},
    create: {
      idTarea: 8,
      idProyecto: pEmpleo.idProyecto,
      idHito: hitos[5].idHito,
      idRolProyecto: rolFullstack.idRolProyecto,
      tituloTarea: 'Optimizar consultas de búsqueda de empleos',
      estadoTarea: 'EN_REVISION',
      prioridad: 'ALTA',
      tiempoEstimadoHoras: 8,
      creadaPor: carlos.idUsuario,
    },
  });
  // Queda deliberadamente sin hito, sin rol, sin asignación y sin etiquetas
  // (escenario "vacío" del conjunto de tareas).
  await prisma.tarea.upsert({
    where: { idTarea: 9 },
    update: {},
    create: {
      idTarea: 9,
      idProyecto: pEmpleo.idProyecto,
      tituloTarea: 'Escribir documentación de la API pública',
      estadoTarea: 'POR_HACER',
      prioridad: 'BAJA',
      creadaPor: carlos.idUsuario,
    },
  });
  const tareaDespliegue = await prisma.tarea.upsert({
    where: { idTarea: 10 },
    update: {},
    create: {
      idTarea: 10,
      idProyecto: pEmpleo.idProyecto,
      idRolProyecto: rolFullstack.idRolProyecto,
      tituloTarea: 'Configurar despliegue en producción',
      estadoTarea: 'EN_PROGRESO',
      prioridad: 'MEDIA',
      tiempoEstimadoHoras: 20,
      creadaPor: luis.idUsuario,
    },
  });
  // Historial de tareaBusquedaOptimizada: dos asignaciones cerradas —incluida
  // una reasignación a luis, el mismo usuario que la abrió— y una única fila
  // activa, coherente con el índice parcial asignacion_tarea_activa_unique.
  const historialAsignData = [
    { idAsignacion: 8, idTarea: tareaBusquedaOptimizada.idTarea, idUsuario: luis.idUsuario, asignadoPor: carlos.idUsuario, fechaAsignacion: new Date('2026-05-01'), desasignadaEn: new Date('2026-05-10') },
    { idAsignacion: 9, idTarea: tareaBusquedaOptimizada.idTarea, idUsuario: maria.idUsuario, asignadoPor: carlos.idUsuario, fechaAsignacion: new Date('2026-05-10'), desasignadaEn: new Date('2026-05-18') },
    { idAsignacion: 10, idTarea: tareaBusquedaOptimizada.idTarea, idUsuario: luis.idUsuario, asignadoPor: carlos.idUsuario, fechaAsignacion: new Date('2026-05-18'), desasignadaEn: null },
    { idAsignacion: 11, idTarea: tareaDespliegue.idTarea, idUsuario: luis.idUsuario, asignadoPor: carlos.idUsuario, fechaAsignacion: new Date('2026-05-20'), desasignadaEn: null },
  ];
  for (const a of historialAsignData) {
    await prisma.asignacionTarea.upsert({
      where: { idAsignacion: a.idAsignacion },
      update: {},
      create: a,
    });
  }

  // ─── Etiquetas ──────────────────────────────────────────
  const etiquetaData = [
    { idEtiqueta: 1, idProyecto: pEmpleo.idProyecto, nombreEtiqueta: 'frontend', nombreNormalizado: 'frontend', color: '#3B82F6' },
    { idEtiqueta: 2, idProyecto: pEmpleo.idProyecto, nombreEtiqueta: 'backend', nombreNormalizado: 'backend', color: '#10B981' },
    { idEtiqueta: 3, idProyecto: pEmpleo.idProyecto, nombreEtiqueta: 'urgente', nombreNormalizado: 'urgente', color: '#EF4444' },
  ];
  const etiquetas = [];
  for (const et of etiquetaData) {
    const e = await prisma.etiqueta.upsert({ where: { idEtiqueta: et.idEtiqueta }, update: {}, create: et });
    etiquetas.push(e);
  }
  const [, etiquetaBackend, etiquetaUrgente] = etiquetas;

  // ─── Tarea ↔ Etiqueta ───────────────────────────────────
  // tareaBusquedaOptimizada recibe 2 etiquetas; "backend" queda asociada a
  // 2 tareas distintas; tareaDocumentacionApi no recibe ninguna.
  const teData = [
    { idTarea: tareaBusquedaOptimizada.idTarea, idEtiqueta: etiquetaBackend.idEtiqueta },
    { idTarea: tareaBusquedaOptimizada.idTarea, idEtiqueta: etiquetaUrgente.idEtiqueta },
    { idTarea: tareaDespliegue.idTarea, idEtiqueta: etiquetaBackend.idEtiqueta },
  ];
  for (const te of teData) {
    await prisma.tareaEtiqueta.upsert({
      where: { idTarea_idEtiqueta: te },
      update: {},
      create: te,
    });
  }

  // ─── Evidencias ─────────────────────────────────────────
  const evidencias = [];
  const evData = [
    { idTarea: tareas[0].idTarea, idUsuarioCargador: maria.idUsuario, tipoEvidencia: 'ENLACE' as const, urlRecurso: 'https://figma.com/file/tutorias-wireframes', descripcion: 'Wireframes completos' },
    { idTarea: tareas[1].idTarea, idUsuarioCargador: jose.idUsuario, tipoEvidencia: 'ENLACE' as const, urlRecurso: 'https://github.com/uvg/tutorias/pull/12', descripcion: 'PR de autenticación JWT' },
    { idTarea: tareas[4].idTarea, idUsuarioCargador: sofia.idUsuario, tipoEvidencia: 'ARCHIVO' as const, urlRecurso: '/uploads/revision-bibliografica.pdf', descripcion: 'Revisión de 15 papers' },
    { idTarea: tareas[5].idTarea, idUsuarioCargador: luis.idUsuario, tipoEvidencia: 'ENLACE' as const, urlRecurso: 'https://github.com/uvg/empleo/pull/1', descripcion: 'Schema inicial de Prisma' },
    { idTarea: tareas[0].idTarea, idUsuarioCargador: maria.idUsuario, tipoEvidencia: 'REPORTE' as const, urlRecurso: '/uploads/reporte-ux-research.pdf', descripcion: 'Reporte de investigación UX' },
  ];
  for (const [i, ev] of evData.entries()) {
    const e = await prisma.evidencia.upsert({
      where: { idEvidencia: i + 1 },
      update: {},
      create: { idEvidencia: i + 1, ...ev },
    });
    evidencias.push(e);
  }

  // ─── Revisiones de evidencia ────────────────────────────
  const revData = [
    { idEvidencia: evidencias[0].idEvidencia, idRevisor: carlos.idUsuario, resultadoRevision: 'APROBADA' as const, comentario: 'Excelente trabajo en los wireframes' },
    { idEvidencia: evidencias[1].idEvidencia, idRevisor: carlos.idUsuario, resultadoRevision: 'APROBADA' as const, comentario: 'JWT implementado correctamente' },
    { idEvidencia: evidencias[2].idEvidencia, idRevisor: luis.idUsuario, resultadoRevision: 'APROBADA' as const, comentario: 'Buena selección de papers' },
    { idEvidencia: evidencias[3].idEvidencia, idRevisor: carlos.idUsuario, resultadoRevision: 'APROBADA' as const, comentario: 'Schema bien diseñado' },
    { idEvidencia: evidencias[4].idEvidencia, idRevisor: carlos.idUsuario, resultadoRevision: 'RECHAZADA' as const, comentario: 'Falta sección de conclusiones' },
  ];
  for (const [i, rev] of revData.entries()) {
    await prisma.revisionEvidencia.upsert({
      where: { idRevision: i + 1 },
      update: {},
      create: { idRevision: i + 1, ...rev },
    });
  }

  // ─── Horas de participación ─────────────────────────────
  const horasData = [
    { idParticipacion: participaciones[0].idParticipacion, periodoInicio: new Date('2026-03-01'), periodoFin: new Date('2026-03-15'), horasReportadas: 12, horasAprobadas: 12, estadoHoras: 'APROBADA' as const, aprobadoPor: carlos.idUsuario },
    { idParticipacion: participaciones[1].idParticipacion, periodoInicio: new Date('2026-03-01'), periodoFin: new Date('2026-03-15'), horasReportadas: 15, horasAprobadas: 14, estadoHoras: 'APROBADA' as const, aprobadoPor: carlos.idUsuario },
    { idParticipacion: participaciones[2].idParticipacion, periodoInicio: new Date('2026-02-01'), periodoFin: new Date('2026-02-28'), horasReportadas: 20, horasAprobadas: 20, estadoHoras: 'APROBADA' as const, aprobadoPor: luis.idUsuario },
    { idParticipacion: participaciones[3].idParticipacion, periodoInicio: new Date('2026-03-15'), periodoFin: new Date('2026-03-31'), horasReportadas: 18, estadoHoras: 'PENDIENTE' as const },
    { idParticipacion: participaciones[4].idParticipacion, periodoInicio: new Date('2026-03-01'), periodoFin: new Date('2026-03-15'), horasReportadas: 10, horasAprobadas: 10, estadoHoras: 'APROBADA' as const, aprobadoPor: luis.idUsuario },
    { idParticipacion: participaciones[0].idParticipacion, periodoInicio: new Date('2026-03-16'), periodoFin: new Date('2026-03-31'), horasReportadas: 8, estadoHoras: 'PENDIENTE' as const },
  ];
  for (const [i, h] of horasData.entries()) {
    await prisma.horasParticipacion.upsert({
      where: { idRegistroHoras: i + 1 },
      update: {},
      create: { idRegistroHoras: i + 1, ...h },
    });
  }

  // ─── Certificados ───────────────────────────────────────
  const certData = [
    { idParticipacion: participaciones[0].idParticipacion, tipoCertificado: 'HORAS_BECA' as const, horasCertificadas: 12, emitidoPor: luis.idUsuario, codigoVerificacion: 'CERT-2026-001' },
    { idParticipacion: participaciones[1].idParticipacion, tipoCertificado: 'HORAS_BECA' as const, horasCertificadas: 14, emitidoPor: luis.idUsuario, codigoVerificacion: 'CERT-2026-002' },
    { idParticipacion: participaciones[2].idParticipacion, tipoCertificado: 'EXPERIENCIA' as const, horasCertificadas: 20, emitidoPor: luis.idUsuario, codigoVerificacion: 'CERT-2026-003' },
    { idParticipacion: participaciones[4].idParticipacion, tipoCertificado: 'HORAS_BECA' as const, horasCertificadas: 10, emitidoPor: luis.idUsuario, codigoVerificacion: 'CERT-2026-004' },
    { idParticipacion: participaciones[3].idParticipacion, tipoCertificado: 'EXTENSION' as const, horasCertificadas: 18, emitidoPor: luis.idUsuario, codigoVerificacion: 'CERT-2026-005' },
  ];
  for (const [i, c] of certData.entries()) {
    await prisma.certificado.upsert({
      where: { codigoVerificacion: c.codigoVerificacion },
      update: {},
      create: c,
    });
  }

  // ─── Notificaciones ─────────────────────────────────────
  const notifData = [
    { idUsuario: maria.idUsuario, tipoNotificacion: 'POSTULACION_RESUELTA' as const, tituloNotificacion: 'Postulación aceptada', mensajeNotificacion: 'Tu postulación al rol de Diseñador UX fue aceptada' },
    { idUsuario: jose.idUsuario, tipoNotificacion: 'TAREA_ASIGNADA' as const, tituloNotificacion: 'Nueva tarea asignada', mensajeNotificacion: 'Se te asignó la tarea "Implementar autenticación"' },
    { idUsuario: sofia.idUsuario, tipoNotificacion: 'EVIDENCIA_REVISADA' as const, tituloNotificacion: 'Evidencia aprobada', mensajeNotificacion: 'Tu revisión bibliográfica fue aprobada' },
    { idUsuario: carlos.idUsuario, tipoNotificacion: 'PROYECTO_PUBLICADO' as const, tituloNotificacion: 'Proyecto publicado', mensajeNotificacion: 'El proyecto "Plataforma de Tutorías UVG" fue publicado' },
    { idUsuario: luis.idUsuario, tipoNotificacion: 'HORAS_VALIDADAS' as const, tituloNotificacion: 'Horas validadas', mensajeNotificacion: 'Se validaron 18 horas del Portal de Empleo' },
    { idUsuario: maria.idUsuario, tipoNotificacion: 'CERTIFICADO_EMITIDO' as const, tituloNotificacion: 'Certificado emitido', mensajeNotificacion: 'Se emitió tu certificado CERT-2026-001' },
  ];
  for (const [i, n] of notifData.entries()) {
    await prisma.notificacion.upsert({
      where: { idNotificacion: i + 1 },
      update: {},
      create: { idNotificacion: i + 1, ...n },
    });
  }

  // ─── Bitácora de auditoría ──────────────────────────────
  const auditData = [
    { idUsuario: carlos.idUsuario, accion: 'CREATE', tipoObjeto: 'proyecto', idObjeto: '1', ipOrigen: '192.168.1.10' },
    { idUsuario: maria.idUsuario, accion: 'CREATE', tipoObjeto: 'postulacion', idObjeto: '1', ipOrigen: '192.168.1.11' },
    { idUsuario: carlos.idUsuario, accion: 'UPDATE', tipoObjeto: 'postulacion', idObjeto: '1', ipOrigen: '192.168.1.10' },
    { idUsuario: luis.idUsuario, accion: 'CREATE', tipoObjeto: 'certificado', idObjeto: '1', ipOrigen: '192.168.1.12' },
    { idUsuario: jose.idUsuario, accion: 'UPDATE', tipoObjeto: 'tarea', idObjeto: '2', ipOrigen: '192.168.1.13' },
  ];
  for (const [i, a] of auditData.entries()) {
    await prisma.bitacoraAuditoria.upsert({
      where: { idAuditoria: i + 1 },
      update: {},
      create: { idAuditoria: i + 1, ...a },
    });
  }

  // ─── Usuario de prueba san24725 ────────────────────────
  const TEST_PASSWORD = hashSync('12345678', 10);
  const angelUser = await prisma.usuario.upsert({
    where: { correo: 'san24725@uvg.edu.gt' },
    update: {},
    create: {
      correo: 'san24725@uvg.edu.gt',
      contrasena: TEST_PASSWORD,
      nombre: 'Angel',
      apellido: 'Sanabria',
    },
  });

  await prisma.perfilEstudiante.upsert({
    where: { idUsuario: angelUser.idUsuario },
    update: {},
    create: {
      idUsuario: angelUser.idUsuario,
      carne: '24725',
      idCarrera: computacion.idCarrera,
      semestre: 5,
      disponibilidadHorasSemana: 12,
      biografia: 'Estudiante de Ingeniería en Ciencias de la Computación',
    },
  });

  await prisma.usuarioRolAcceso.upsert({
    where: { idUsuario_idRolAcceso: { idUsuario: angelUser.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso } },
    update: {},
    create: { idUsuario: angelUser.idUsuario, idRolAcceso: rolEstudiante.idRolAcceso },
  });

  // 4 proyectos de Angel
  const angelProyectos = await Promise.all([
    prisma.proyecto.upsert({
      where: { idProyecto: 10 },
      update: {},
      create: {
        idProyecto: 10,
        tituloProyecto: 'Sistema de Gestión Académica',
        descripcionProyecto: 'Plataforma web para gestión de cursos, tareas y calificaciones',
        tipoProyecto: 'ACADEMICO_EXPERIENCIA',
        estadoProyecto: 'PUBLICADO',
        creadoPor: angelUser.idUsuario,
        fechaInicio: new Date('2026-05-01'),
        fechaFinEstimada: new Date('2026-12-01'),
      },
    }),
    prisma.proyecto.upsert({
      where: { idProyecto: 11 },
      update: {},
      create: {
        idProyecto: 11,
        tituloProyecto: 'App Móvil de Salud Mental',
        descripcionProyecto: 'Aplicación para seguimiento de bienestar emocional estudiantil',
        tipoProyecto: 'EXTRACURRICULAR_EXTENSION',
        estadoProyecto: 'PUBLICADO',
        creadoPor: angelUser.idUsuario,
        fechaInicio: new Date('2026-06-01'),
        fechaFinEstimada: new Date('2026-11-01'),
      },
    }),
    prisma.proyecto.upsert({
      where: { idProyecto: 12 },
      update: {},
      create: {
        idProyecto: 12,
        tituloProyecto: 'Plataforma de E-Learning',
        descripcionProyecto: 'Sistema de cursos en línea con evaluaciones automáticas',
        tipoProyecto: 'ACADEMICO_HORAS_BECA',
        estadoProyecto: 'PUBLICADO',
        creadoPor: angelUser.idUsuario,
        fechaInicio: new Date('2026-04-15'),
        fechaFinEstimada: new Date('2026-10-15'),
      },
    }),
    prisma.proyecto.upsert({
      where: { idProyecto: 13 },
      update: {},
      create: {
        idProyecto: 13,
        tituloProyecto: 'Dashboard de Análisis Deportivo',
        descripcionProyecto: 'Visualización de estadísticas deportivas universitarias',
        tipoProyecto: 'EXTRACURRICULAR_EXTENSION',
        estadoProyecto: 'PUBLICADO',
        creadoPor: angelUser.idUsuario,
        fechaInicio: new Date('2026-05-10'),
        fechaFinEstimada: new Date('2026-09-10'),
      },
    }),
  ]);

  // Roles para los proyectos de Angel
  const angelRoles = await Promise.all([
    // Proyecto 1: Sistema de Gestión Académica
    prisma.rolProyecto.upsert({ where: { idRolProyecto: 8 }, update: {}, create: { idRolProyecto: 8, idProyecto: angelProyectos[0].idProyecto, nombreRol: 'Backend Developer', descripcionRolProyecto: 'Desarrollador Node.js/NestJS', cupos: 2 } }),
    prisma.rolProyecto.upsert({ where: { idRolProyecto: 9 }, update: {}, create: { idRolProyecto: 9, idProyecto: angelProyectos[0].idProyecto, nombreRol: 'Frontend Developer', descripcionRolProyecto: 'Desarrollador React/Next.js', cupos: 2 } }),
    // Proyecto 2: App Móvil
    prisma.rolProyecto.upsert({ where: { idRolProyecto: 10 }, update: {}, create: { idRolProyecto: 10, idProyecto: angelProyectos[1].idProyecto, nombreRol: 'Mobile Developer', descripcionRolProyecto: 'Desarrollador React Native', cupos: 2 } }),
    prisma.rolProyecto.upsert({ where: { idRolProyecto: 11 }, update: {}, create: { idRolProyecto: 11, idProyecto: angelProyectos[1].idProyecto, nombreRol: 'UX Designer', descripcionRolProyecto: 'Diseñador de experiencia de usuario', cupos: 1 } }),
    // Proyecto 3: E-Learning
    prisma.rolProyecto.upsert({ where: { idRolProyecto: 12 }, update: {}, create: { idRolProyecto: 12, idProyecto: angelProyectos[2].idProyecto, nombreRol: 'Full Stack Developer', descripcionRolProyecto: 'Desarrollador Full Stack', cupos: 3 } }),
    prisma.rolProyecto.upsert({ where: { idRolProyecto: 13 }, update: {}, create: { idRolProyecto: 13, idProyecto: angelProyectos[2].idProyecto, nombreRol: 'DevOps Engineer', descripcionRolProyecto: 'Ingeniero de DevOps', cupos: 1 } }),
    // Proyecto 4: Dashboard Deportivo
    prisma.rolProyecto.upsert({ where: { idRolProyecto: 14 }, update: {}, create: { idRolProyecto: 14, idProyecto: angelProyectos[3].idProyecto, nombreRol: 'Data Analyst', descripcionRolProyecto: 'Analista de datos deportivos', cupos: 1 } }),
    prisma.rolProyecto.upsert({ where: { idRolProyecto: 15 }, update: {}, create: { idRolProyecto: 15, idProyecto: angelProyectos[3].idProyecto, nombreRol: 'Frontend Developer', descripcionRolProyecto: 'Desarrollador de visualizaciones', cupos: 2 } }),
  ]);

  // Participaciones - Agregar Angel y otros usuarios a sus equipos
  await prisma.participacionProyecto.upsert({
    where: { idParticipacion: 6 },
    update: {},
    create: {
      idParticipacion: 6,
      idUsuario: angelUser.idUsuario,
      idRolProyecto: angelRoles[0].idRolProyecto,
      estadoParticipacion: 'ACTIVO',
      fechaIngreso: new Date('2026-05-01'),
    },
  });

  await prisma.participacionProyecto.upsert({
    where: { idParticipacion: 7 },
    update: {},
    create: {
      idParticipacion: 7,
      idUsuario: maria.idUsuario,
      idRolProyecto: angelRoles[1].idRolProyecto,
      estadoParticipacion: 'ACTIVO',
      fechaIngreso: new Date('2026-05-05'),
    },
  });

  await prisma.participacionProyecto.upsert({
    where: { idParticipacion: 8 },
    update: {},
    create: {
      idParticipacion: 8,
      idUsuario: jose.idUsuario,
      idRolProyecto: angelRoles[2].idRolProyecto,
      estadoParticipacion: 'ACTIVO',
      fechaIngreso: new Date('2026-06-02'),
    },
  });

  await prisma.participacionProyecto.upsert({
    where: { idParticipacion: 9 },
    update: {},
    create: {
      idParticipacion: 9,
      idUsuario: ana.idUsuario,
      idRolProyecto: angelRoles[3].idRolProyecto,
      estadoParticipacion: 'ACTIVO',
      fechaIngreso: new Date('2026-06-03'),
    },
  });

  await prisma.participacionProyecto.upsert({
    where: { idParticipacion: 10 },
    update: {},
    create: {
      idParticipacion: 10,
      idUsuario: luis.idUsuario,
      idRolProyecto: angelRoles[4].idRolProyecto,
      estadoParticipacion: 'ACTIVO',
      fechaIngreso: new Date('2026-04-20'),
    },
  });

  await prisma.participacionProyecto.upsert({
    where: { idParticipacion: 11 },
    update: {},
    create: {
      idParticipacion: 11,
      idUsuario: sofia.idUsuario,
      idRolProyecto: angelRoles[6].idRolProyecto,
      estadoParticipacion: 'ACTIVO',
      fechaIngreso: new Date('2026-05-12'),
    },
  });

  // Postulaciones - Algunos usuarios postulando a proyectos de Angel
  await prisma.postulacion.upsert({
    where: { idPostulacion: 7 },
    update: {},
    create: {
      idPostulacion: 7,
      idUsuarioPostulante: carlos.idUsuario,
      idRolProyecto: angelRoles[0].idRolProyecto,
      justificacion: 'Tengo experiencia con NestJS y arquitectura backend escalable',
      estadoPostulacion: 'PENDIENTE',
    },
  });

  await prisma.postulacion.upsert({
    where: { idPostulacion: 8 },
    update: {},
    create: {
      idPostulacion: 8,
      idUsuarioPostulante: sofia.idUsuario,
      idRolProyecto: angelRoles[1].idRolProyecto,
      justificacion: 'Me apasiona el frontend moderno con React y TypeScript',
      estadoPostulacion: 'PENDIENTE',
    },
  });

  await prisma.postulacion.upsert({
    where: { idPostulacion: 9 },
    update: {},
    create: {
      idPostulacion: 9,
      idUsuarioPostulante: luis.idUsuario,
      idRolProyecto: angelRoles[5].idRolProyecto,
      justificacion: 'Experiencia en Docker, CI/CD y cloud deployments',
      estadoPostulacion: 'ACEPTADA',
      resueltaPor: angelUser.idUsuario,
      fechaResolucion: new Date(),
    },
  });

  // Angel postulando a proyectos de otros
  await prisma.postulacion.upsert({
    where: { idPostulacion: 10 },
    update: {},
    create: {
      idPostulacion: 10,
      idUsuarioPostulante: angelUser.idUsuario,
      idRolProyecto: rolMobile.idRolProyecto,
      justificacion: 'Quiero contribuir al desarrollo móvil del proyecto ambiental',
      estadoPostulacion: 'PENDIENTE',
    },
  });

  await prisma.postulacion.upsert({
    where: { idPostulacion: 11 },
    update: {},
    create: {
      idPostulacion: 11,
      idUsuarioPostulante: angelUser.idUsuario,
      idRolProyecto: rolFullstack.idRolProyecto,
      justificacion: 'Experiencia en MERN stack y arquitectura de aplicaciones',
      estadoPostulacion: 'ACEPTADA',
      resueltaPor: carlos.idUsuario,
      fechaResolucion: new Date(),
    },
  });

  // Notificaciones para Angel
  const notificacionesData = [
    {
      idNotificacion: 1,
      idUsuario: angelUser.idUsuario,
      tipoNotificacion: 'NUEVA_POSTULACION' as const,
      tituloNotificacion: 'Nueva postulación recibida',
      mensajeNotificacion: `${carlos.nombre} ${carlos.apellido} se postuló para el rol "Backend Developer" en tu proyecto "${angelProyectos[0].tituloProyecto}".`,
      datosJson: { projectId: angelProyectos[0].idProyecto },
    },
    {
      idNotificacion: 2,
      idUsuario: angelUser.idUsuario,
      tipoNotificacion: 'NUEVA_POSTULACION' as const,
      tituloNotificacion: 'Nueva postulación recibida',
      mensajeNotificacion: `${sofia.nombre} ${sofia.apellido} se postuló para el rol "Frontend Developer" en tu proyecto "${angelProyectos[0].tituloProyecto}".`,
      datosJson: { projectId: angelProyectos[0].idProyecto },
    },
    {
      idNotificacion: 3,
      idUsuario: angelUser.idUsuario,
      tipoNotificacion: 'POSTULACION_RESUELTA' as const,
      tituloNotificacion: 'Tu postulación fue aceptada',
      mensajeNotificacion: `Tu postulación para el rol "Desarrollador Fullstack" en el proyecto "${pEmpleo.tituloProyecto}" fue aceptada.`,
      datosJson: { projectId: pEmpleo.idProyecto },
      leidaEn: new Date(),
    },
    {
      idNotificacion: 4,
      idUsuario: angelUser.idUsuario,
      tipoNotificacion: 'PROYECTO_APROBADO' as const,
      tituloNotificacion: 'Tu proyecto fue aprobado',
      mensajeNotificacion: `Tu proyecto "${angelProyectos[0].tituloProyecto}" ha sido aprobado y ahora está visible.`,
      datosJson: { projectId: angelProyectos[0].idProyecto },
      leidaEn: new Date(),
    },
  ];

  for (const notif of notificacionesData) {
    await prisma.notificacion.upsert({
      where: { idNotificacion: notif.idNotificacion },
      update: {
        tituloNotificacion: notif.tituloNotificacion,
        mensajeNotificacion: notif.mensajeNotificacion,
        datosJson: notif.datosJson,
        leidaEn: notif.leidaEn ?? null,
        tipoNotificacion: notif.tipoNotificacion,
        idUsuario: notif.idUsuario,
      },
      create: notif,
    });
  }

  // ─── Usuario administrador ─────────────────────────────
  const adminUser = await prisma.usuario.upsert({
    where: { correo: 'admin@uvg.edu.gt' },
    update: {},
    create: {
      correo: 'admin@uvg.edu.gt',
      contrasena: PASSWORD_HASH,
      nombre: 'Admin',
      apellido: 'UVG',
    },
  });

  await prisma.usuarioRolAcceso.upsert({
    where: { idUsuario_idRolAcceso: { idUsuario: adminUser.idUsuario, idRolAcceso: rolAdmin.idRolAcceso } },
    update: {},
    create: { idUsuario: adminUser.idUsuario, idRolAcceso: rolAdmin.idRolAcceso },
  });

  // ─── Configuración del sistema ──────────────────────────
  const configData = [
    { clave: 'max_horas_semana', valor: '40', descripcionParametro: 'Máximo de horas semanales permitidas' },
    { clave: 'notificaciones_email', valor: 'true', descripcionParametro: 'Enviar notificaciones por email' },
    { clave: 'periodo_postulacion_dias', valor: '30', descripcionParametro: 'Días hábiles para postularse a un proyecto' },
    { clave: 'min_horas_certificado', valor: '10', descripcionParametro: 'Mínimo de horas para emitir certificado' },
    { clave: 'version_sistema', valor: '1.0.0', descripcionParametro: 'Versión actual del sistema' },
  ];
  for (const c of configData) {
    await prisma.configuracionSistema.upsert({
      where: { clave: c.clave },
      update: {},
      create: { ...c, actualizadoPor: carlos.idUsuario },
    });
  }

  // ─── Datos adicionales para verificación de vistas de administrador ──────────

  // Usuarios mentores (rol mentor para MentorContent en UserDetailSheet)
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

  // Usuarios BLOQUEADO (para probar filtro BLOQUEADO, botón "Desbloquear" en drawer, y stat del dashboard)
  const bloqueadoEst = await prisma.usuario.upsert({
    where: { correo: 'pedro.castillo@uvg.edu.gt' },
    update: { estado: 'BLOQUEADO' as const },
    create: { correo: 'pedro.castillo@uvg.edu.gt', contrasena: PASSWORD_HASH, nombre: 'Pedro', apellido: 'Castillo', estado: 'BLOQUEADO' as const },
  });
  const bloqueadoLider2 = await prisma.usuario.upsert({
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
    create: { idUsuario: bloqueadoEst.idUsuario, carne: '22001', idCarrera: computacion.idCarrera, semestre: 6, disponibilidadHorasSemana: 10 },
  });
  await prisma.usuarioRolAcceso.upsert({
    where: { idUsuario_idRolAcceso: { idUsuario: bloqueadoLider2.idUsuario, idRolAcceso: rolLider.idRolAcceso } },
    update: {},
    create: { idUsuario: bloqueadoLider2.idUsuario, idRolAcceso: rolLider.idRolAcceso },
  });
  await prisma.usuarioRolAcceso.upsert({
    where: { idUsuario_idRolAcceso: { idUsuario: bloqueadoMentor.idUsuario, idRolAcceso: rolMentor.idRolAcceso } },
    update: {},
    create: { idUsuario: bloqueadoMentor.idUsuario, idRolAcceso: rolMentor.idRolAcceso },
  });

  // Usuarios INACTIVO (creados en 2026 → contarán en nuevosInactivos2026; botón "Activar" en drawer)
  const inactivoEst = await prisma.usuario.upsert({
    where: { correo: 'laura.garcia@uvg.edu.gt' },
    update: { estado: 'INACTIVO' as const },
    create: { correo: 'laura.garcia@uvg.edu.gt', contrasena: PASSWORD_HASH, nombre: 'Laura', apellido: 'García', estado: 'INACTIVO' as const },
  });
  const inactivoCoord2 = await prisma.usuario.upsert({
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
    create: { idUsuario: inactivoEst.idUsuario, carne: '22002', idCarrera: industrial.idCarrera, semestre: 4, disponibilidadHorasSemana: 8 },
  });
  await prisma.usuarioRolAcceso.upsert({
    where: { idUsuario_idRolAcceso: { idUsuario: inactivoCoord2.idUsuario, idRolAcceso: rolCoordinador.idRolAcceso } },
    update: {},
    create: { idUsuario: inactivoCoord2.idUsuario, idRolAcceso: rolCoordinador.idRolAcceso },
  });

  // Estudiantes en riesgo (semestre >= 7, sin horas de extensión o muy pocas → aparecen en el panel de riesgo)
  const hectorMendez = await prisma.usuario.upsert({
    where: { correo: 'hector.mendez@uvg.edu.gt' },
    update: {},
    create: { correo: 'hector.mendez@uvg.edu.gt', contrasena: PASSWORD_HASH, nombre: 'Héctor', apellido: 'Méndez' },
  });
  const valentinaSoto = await prisma.usuario.upsert({
    where: { correo: 'valentina.soto@uvg.edu.gt' },
    update: {},
    create: { correo: 'valentina.soto@uvg.edu.gt', contrasena: PASSWORD_HASH, nombre: 'Valentina', apellido: 'Soto' },
  });
  const omarPerez = await prisma.usuario.upsert({
    where: { correo: 'omar.perez@uvg.edu.gt' },
    update: {},
    create: { correo: 'omar.perez@uvg.edu.gt', contrasena: PASSWORD_HASH, nombre: 'Óscar', apellido: 'Pérez' },
  });
  const riesgoEstData = [
    { user: hectorMendez, carne: '21001', idCarrera: computacion.idCarrera, semestre: 10, disponibilidadHorasSemana: 12, horasExtensionRequeridas: 40 },
    { user: valentinaSoto, carne: '21002', idCarrera: biomedica.idCarrera, semestre: 8, disponibilidadHorasSemana: 10, horasExtensionRequeridas: 20 },
    { user: omarPerez, carne: '21003', idCarrera: mecatronica.idCarrera, semestre: 9, disponibilidadHorasSemana: 8, horasExtensionRequeridas: 30 },
  ];
  for (const { user, carne, idCarrera, semestre, disponibilidadHorasSemana, horasExtensionRequeridas } of riesgoEstData) {
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

  // Proyectos adicionales: más EN_REVISION, un EN_SOLICITUD_CIERRE extra, y 2 CERRADOS en 2026
  const pVoluntariado = await prisma.proyecto.upsert({
    where: { idProyecto: 14 },
    update: {
      objetivosProyecto: 'Facilitar la gestión de oportunidades de voluntariado estudiantil, mejorar la comunicación entre estudiantes y organizaciones, y permitir el seguimiento de participación mediante una plataforma centralizada.',
      contextoAcademico: 'Proyecto desarrollado como parte del curso de Ingeniería de Software en la Universidad del Valle de Guatemala.',
      ubicacionProyecto: 'Universidad del Valle de Guatemala, Campus Central',
      urlRecursoExterno: 'https://voluntariado.uvg.edu.gt',
      modalidadProyecto: 'MIXTA',
    },
    create: {
      idProyecto: 14,
      tituloProyecto: 'Plataforma de Voluntariado Estudiantil',
      descripcionProyecto: 'Sistema para conectar estudiantes con oportunidades de voluntariado en la comunidad',
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
    where: { idProyecto: 15 },
    update: {},
    create: {
      idProyecto: 15,
      tituloProyecto: 'App de Bienestar Universitario',
      descripcionProyecto: 'Aplicación para el seguimiento de bienestar estudiantil y salud mental',
      tipoProyecto: 'ACADEMICO_EXPERIENCIA',
      estadoProyecto: 'EN_REVISION',
      creadoPor: angelUser.idUsuario,
      fechaInicio: new Date('2026-05-15'),
      fechaFinEstimada: new Date('2026-12-15'),
    },
  });
  await prisma.proyecto.upsert({
    where: { idProyecto: 16 },
    update: {},
    create: {
      idProyecto: 16,
      tituloProyecto: 'Sistema de Intercambio Académico',
      descripcionProyecto: 'Plataforma para gestionar intercambios académicos entre universidades aliadas',
      tipoProyecto: 'ACADEMICO_HORAS_BECA',
      estadoProyecto: 'EN_SOLICITUD_CIERRE',
      creadoPor: carlos.idUsuario,
      fechaInicio: new Date('2026-02-01'),
      fechaFinEstimada: new Date('2026-05-01'),
    },
  });
  const pFeriaCiencias = await prisma.proyecto.upsert({
    where: { idProyecto: 17 },
    update: {},
    create: {
      idProyecto: 17,
      tituloProyecto: 'Feria de Ciencias UVG 2026',
      descripcionProyecto: 'Organización y logística de la feria de ciencias universitaria anual',
      tipoProyecto: 'EXTRACURRICULAR_EXTENSION',
      estadoProyecto: 'CERRADO',
      creadoPor: maria.idUsuario,
      fechaInicio: new Date('2026-01-15'),
      fechaFinEstimada: new Date('2026-03-15'),
    },
  });
  const pHackathon = await prisma.proyecto.upsert({
    where: { idProyecto: 18 },
    update: {},
    create: {
      idProyecto: 18,
      tituloProyecto: 'Hackathon de Innovación Social',
      descripcionProyecto: 'Competencia de desarrollo tecnológico con impacto social en la comunidad',
      tipoProyecto: 'EXTRACURRICULAR_EXTENSION',
      estadoProyecto: 'CERRADO',
      creadoPor: jose.idUsuario,
      fechaInicio: new Date('2026-02-01'),
      fechaFinEstimada: new Date('2026-04-01'),
    },
  });

  // Rol en pFeriaCiencias para que Rosa (mentor) tenga un proyecto cerrado
  const rolFeria = await prisma.rolProyecto.upsert({
    where: { idRolProyecto: 16 },
    update: {},
    create: { idRolProyecto: 16, idProyecto: pFeriaCiencias.idProyecto, nombreRol: 'Mentor de Equipo', cupos: 2 },
  });

  // Revisiones para los nuevos proyectos EN_REVISION (aparecen en bandeja de Revisiones)
  await prisma.revisionProyecto.upsert({
    where: { idRevisionProyecto: 3 },
    update: {},
    create: { idRevisionProyecto: 3, idProyecto: pVoluntariado.idProyecto, estadoRevision: 'PENDIENTE', numeroEnvio: 1 },
  });
  await prisma.revisionProyecto.upsert({
    where: { idRevisionProyecto: 4 },
    update: {},
    create: { idRevisionProyecto: 4, idProyecto: pBienestar.idProyecto, estadoRevision: 'PENDIENTE', numeroEnvio: 1 },
  });

  // Revisiones APROBADAS vinculadas a Luis como revisor (enriquece CoordinadorContent)
  await prisma.revisionProyecto.upsert({
    where: { idRevisionProyecto: 5 },
    update: {},
    create: {
      idRevisionProyecto: 5,
      idProyecto: pFeriaCiencias.idProyecto,
      idRevisor: luis.idUsuario,
      estadoRevision: 'APROBADA',
      comentarioRevision: 'El proyecto cumple con todos los requisitos académicos y de extensión.',
      numeroEnvio: 1,
      revisadaEn: new Date('2026-03-20'),
    },
  });
  await prisma.revisionProyecto.upsert({
    where: { idRevisionProyecto: 6 },
    update: {},
    create: {
      idRevisionProyecto: 6,
      idProyecto: pHackathon.idProyecto,
      idRevisor: luis.idUsuario,
      estadoRevision: 'APROBADA',
      comentarioRevision: 'Excelente impacto social demostrado durante el evento.',
      numeroEnvio: 1,
      revisadaEn: new Date('2026-04-10'),
    },
  });

  // Participaciones de mentores (para MentorContent: proyectos activos y cerrados)
  await prisma.participacionProyecto.upsert({
    where: { idParticipacion: 12 },
    update: {},
    create: { idParticipacion: 12, idUsuario: mentorRosa.idUsuario, idRolProyecto: rolInvestigador.idRolProyecto, estadoParticipacion: 'ACTIVO' },
  });
  await prisma.participacionProyecto.upsert({
    where: { idParticipacion: 13 },
    update: {},
    create: { idParticipacion: 13, idUsuario: mentorRosa.idUsuario, idRolProyecto: rolFeria.idRolProyecto, estadoParticipacion: 'ACTIVO' },
  });
  await prisma.participacionProyecto.upsert({
    where: { idParticipacion: 14 },
    update: {},
    create: { idParticipacion: 14, idUsuario: mentorTomas.idUsuario, idRolProyecto: rolEmbebido.idRolProyecto, estadoParticipacion: 'ACTIVO' },
  });

  // Participación y horas de Valentina en proyecto de extensión (barra de progreso parcial en drawer)
  await prisma.participacionProyecto.upsert({
    where: { idParticipacion: 15 },
    update: {},
    create: { idParticipacion: 15, idUsuario: valentinaSoto.idUsuario, idRolProyecto: rolMobile.idRolProyecto, estadoParticipacion: 'ACTIVO' },
  });
  await prisma.horasParticipacion.upsert({
    where: { idRegistroHoras: 7 },
    update: {},
    create: {
      idRegistroHoras: 7,
      idParticipacion: 15,
      periodoInicio: new Date('2026-03-01'),
      periodoFin: new Date('2026-03-31'),
      horasReportadas: 5,
      horasAprobadas: 5,
      estadoHoras: 'APROBADA',
      aprobadoPor: luis.idUsuario,
    },
  });

  // ─── Reset sequences ──────────────────────────────────
  const sequences = [
    { table: 'carrera', column: 'id_carrera' },
    { table: 'habilidad', column: 'id_habilidad' },
    { table: 'organizacion', column: 'id_organizacion' },
    { table: 'proyecto', column: 'id_proyecto' },
    { table: 'rol_proyecto', column: 'id_rol_proyecto' },
    { table: 'revision_proyecto', column: 'id_revision_proyecto' },
    { table: 'postulacion', column: 'id_postulacion' },
    { table: 'participacion_proyecto', column: 'id_participacion' },
    { table: 'hito', column: 'id_hito' },
    { table: 'tarea', column: 'id_tarea' },
    { table: 'asignacion_tarea', column: 'id_asignacion' },
    { table: 'etiqueta', column: 'id_etiqueta' },
    { table: 'evidencia', column: 'id_evidencia' },
    { table: 'revision_evidencia', column: 'id_revision' },
    { table: 'horas_participacion', column: 'id_registro_horas' },
    { table: 'notificacion', column: 'id_notificacion' },
    { table: 'bitacora_auditoria', column: 'id_auditoria' },
    { table: 'experiencia_previa', column: 'id_experiencia' },
    { table: 'usuario_telefono', column: 'id_usuario_telefono' },
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
