import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../src/auth/optional-jwt-auth.guard';
import { cargarRutas, RUTAS_PUBLICAS as PUBLICAS, type Ruta } from './helpers/route-inventory';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { JuntaGuard } from '../src/associations/junta.guard';
import { ProjectWriteGuard } from '../src/common/guards/project-write.guard';

describe('inventario de rutas: ninguna ruta nueva queda abierta ni sin rol de admin', () => {
  let rutas: Ruta[];
  beforeAll(async () => {
    rutas = await cargarRutas();
  }, 120_000);

  it('encuentra las rutas (sanidad del propio inventario)', () => {
    expect(rutas.length).toBeGreaterThan(200);
    expect(rutas.map((r) => r.id)).toContain('GET /api');
  });

  it('toda ruta exige JwtAuthGuard salvo la lista blanca explicita', () => {
    const abiertas = rutas
      .filter((r) => !r.guards.includes(JwtAuthGuard) && !PUBLICAS.has(r.id))
      .map((r) => `${r.id} (${r.controller})`);
    expect(abiertas).toEqual([]);
  });

  it('la lista blanca no tiene entradas muertas', () => {
    const ids = new Set(rutas.map((r) => r.id));
    expect([...PUBLICAS].filter((p) => !ids.has(p))).toEqual([]);
  });

  it('OptionalJwtAuthGuard solo se permite en rutas de la lista blanca', () => {
    const opt = rutas.filter((r) => r.guards.includes(OptionalJwtAuthGuard) && !PUBLICAS.has(r.id));
    expect(opt.map((r) => r.id)).toEqual([]);
  });

  // ORG: cada ruta nueva se declara aqui con su guard; una ruta de mas o de menos hace fallar la prueba.
  it('las rutas de organizaciones existen todas y exigen JwtAuthGuard (permisos por rol en el servicio)', () => {
    const esperadas = [
      'POST /api/organizaciones',
      'GET /api/organizaciones/buscar',
      'GET /api/organizaciones/mias',
      'GET /api/organizaciones/invitaciones/mias',
      'POST /api/organizaciones/invitaciones/:idInvitacion/aceptar',
      'POST /api/organizaciones/invitaciones/:idInvitacion/rechazar',
      'GET /api/organizaciones/:id',
      'PATCH /api/organizaciones/:id',
      'POST /api/organizaciones/:id/archivar',
      'POST /api/organizaciones/:id/transferir',
      'POST /api/organizaciones/:id/salir',
      'GET /api/organizaciones/:id/bitacora',
      'PATCH /api/organizaciones/:id/miembros/:idUsuario',
      'DELETE /api/organizaciones/:id/miembros/:idUsuario',
      'GET /api/organizaciones/:id/candidatos',
      'GET /api/organizaciones/:id/invitaciones',
      'POST /api/organizaciones/:id/invitaciones',
      'DELETE /api/organizaciones/:id/invitaciones/:idInvitacion',
      'GET /api/organizaciones/:id/solicitudes',
      'POST /api/organizaciones/:id/solicitudes',
      'POST /api/organizaciones/:id/solicitudes/:idSolicitud/aceptar',
      'POST /api/organizaciones/:id/solicitudes/:idSolicitud/rechazar',
      'GET /api/organizaciones/:id/chat',
      'GET /api/organizaciones/:id/chat/mensajes',
      'POST /api/organizaciones/:id/chat/mensajes',
      'GET /api/organizaciones/:id/chat/fijados',
      'PUT /api/organizaciones/:id/chat/mensajes/:idMensaje/fijado',
      'DELETE /api/organizaciones/:id/chat/mensajes/:idMensaje/fijado',
    ];
    const deOrganizaciones = rutas.filter((r) => r.controller.startsWith('OrganizationsController.'));
    expect(deOrganizaciones.map((r) => r.id).sort()).toEqual([...esperadas].sort());
    expect(deOrganizaciones.filter((r) => !r.guards.includes(JwtAuthGuard)).map((r) => r.id)).toEqual([]);
    expect(deOrganizaciones.filter((r) => PUBLICAS.has(r.id))).toEqual([]);
  });

  // MEJ-41/42/43: notas de voz, encuestas y fijados del chat de proyecto (permisos en ChatService).
  it('las rutas de notas de voz, encuestas y fijados del chat existen y exigen JwtAuthGuard', () => {
    const base = 'proyectos/:projectId/conversaciones/:conversationId';
    const esperadas = [
      `POST /api/${base}/mensajes/voz`,
      `GET /api/${base}/archivos/:attachmentId/audio`,
      `POST /api/${base}/encuestas`,
      `PUT /api/${base}/mensajes/:messageId/voto`,
      `POST /api/${base}/mensajes/:messageId/encuesta/cierre`,
      `GET /api/${base}/fijados`,
      `PUT /api/${base}/mensajes/:messageId/fijado`,
      `DELETE /api/${base}/mensajes/:messageId/fijado`,
    ];
    const deChat = rutas.filter((r) => esperadas.includes(r.id));
    expect(deChat.map((r) => r.id).sort()).toEqual([...esperadas].sort());
    expect(deChat.filter((r) => !r.guards.includes(JwtAuthGuard)).map((r) => r.id)).toEqual([]);
  });

  // MEJ-11: constancia PDF de las horas propias (el servicio solo lee las del usuario de la sesion).
  it('GET /api/horas-semestre/constancia existe, exige JwtAuthGuard y no es publica', () => {
    const constancia = rutas.filter((r) => r.id === 'GET /api/horas-semestre/constancia');
    expect(constancia).toHaveLength(1);
    expect(constancia[0].guards).toContain(JwtAuthGuard);
    expect(PUBLICAS.has(constancia[0].id)).toBe(false);
  });

  // MEJ-45/46: tarjetas de enlaces internos y «Recuérdamelo» (permisos en los servicios).
  it('las rutas de tarjetas de enlaces y recordatorios del chat existen y exigen JwtAuthGuard', () => {
    const base = 'proyectos/:projectId/conversaciones/:conversationId';
    const esperadas = [`POST /api/${base}/tarjetas`, `POST /api/${base}/mensajes/:messageId/recordatorio`];
    const deChat = rutas.filter((r) => esperadas.includes(r.id));
    expect(deChat.map((r) => r.id).sort()).toEqual([...esperadas].sort());
    expect(deChat.filter((r) => !r.guards.includes(JwtAuthGuard)).map((r) => r.id)).toEqual([]);
  });

  // MEJ-131/132/136/137: hilos, estado ajeno, horario de silencio y Web Push (permisos en los servicios).
  it('las rutas de hilos, estado, silencio y push existen y exigen JwtAuthGuard', () => {
    const hilo = 'proyectos/:projectId/conversaciones/:conversationId/mensajes/:messageId/respuestas';
    const esperadas = [
      `GET /api/${hilo}`,
      `POST /api/${hilo}`,
      'GET /api/chats/estado/:idUsuario',
      'GET /api/notificaciones/silencio',
      'PUT /api/notificaciones/silencio',
      'GET /api/notificaciones/push/clave',
      'POST /api/notificaciones/push/suscripciones',
      'DELETE /api/notificaciones/push/suscripciones',
    ];
    const nuevas = rutas.filter((r) => esperadas.includes(r.id));
    expect(nuevas.map((r) => r.id).sort()).toEqual([...esperadas].sort());
    expect(nuevas.filter((r) => !r.guards.includes(JwtAuthGuard)).map((r) => r.id)).toEqual([]);
  });

  // MEJ-6/10/49/52: checklist, historial, evidencias y plantillas de tarea (permisos por actor en el servicio).
  it('las rutas de checklist, historial, enlaces, evidencias y plantillas existen todas, con JwtAuthGuard y escrituras con ProjectWriteGuard', () => {
    const esperadas = {
      TasksExtrasController: [
        'GET /api/proyectos/:projectId/tareas/:taskId/historial',
        'POST /api/proyectos/:projectId/tareas/:taskId/checklist',
        'PATCH /api/proyectos/:projectId/tareas/:taskId/checklist/:itemId',
        'DELETE /api/proyectos/:projectId/tareas/:taskId/checklist/:itemId',
        // MEJ-107: enlaces con vista previa (SSRF validado en el servicio).
        'GET /api/proyectos/:projectId/tareas/:taskId/enlaces',
        'POST /api/proyectos/:projectId/tareas/:taskId/enlaces',
        'DELETE /api/proyectos/:projectId/tareas/:taskId/enlaces/:linkId',
      ],
      EvidenceController: [
        'GET /api/proyectos/:projectId/tareas/:taskId/evidencias',
        'POST /api/proyectos/:projectId/tareas/:taskId/evidencias',
        'DELETE /api/proyectos/:projectId/tareas/:taskId/evidencias/:evidenceId',
      ],
      PlantillasTareaController: [
        'GET /api/proyectos/:projectId/plantillas-tarea',
        'POST /api/proyectos/:projectId/plantillas-tarea',
        'DELETE /api/proyectos/:projectId/plantillas-tarea/:plantillaId',
      ],
    };
    for (const [controlador, ids] of Object.entries(esperadas)) {
      const propias = rutas.filter((r) => r.controller.startsWith(`${controlador}.`));
      expect(propias.map((r) => r.id).sort()).toEqual([...ids].sort());
      expect(propias.filter((r) => !r.guards.includes(JwtAuthGuard)).map((r) => r.id)).toEqual([]);
      expect(propias.filter((r) => PUBLICAS.has(r.id))).toEqual([]);
    }
    const escriben = rutas.filter(
      (r) =>
        (r.controller.startsWith('TasksExtrasController.') ||
          r.controller.startsWith('EvidenceController.') ||
          r.controller.startsWith('PlantillasTareaController.')) &&
        r.metodo !== 'GET',
    );
    expect(escriben.length).toBe(9);
    expect(escriben.filter((r) => !r.guards.includes(ProjectWriteGuard)).map((r) => r.id)).toEqual([]);
  });

  // MEJ-109/110: responsables adicionales y respuestas/reacciones de comentarios de tarea (permisos en los servicios).
  it('las rutas de responsables, respuestas y reacciones existen, con JwtAuthGuard y ProjectWriteGuard', () => {
    const base = 'POST /api/proyectos/:projectId/tareas/:taskId/comentarios/:commentId';
    const esperadas = [
      'PUT /api/proyectos/:projectId/tareas/:taskId/responsables',
      `${base}/respuestas`,
      `${base}/reacciones`,
    ];
    const nuevas = rutas.filter((r) => esperadas.includes(r.id));
    expect(nuevas.map((r) => r.id).sort()).toEqual([...esperadas].sort());
    expect(nuevas.filter((r) => !r.guards.includes(JwtAuthGuard)).map((r) => r.id)).toEqual([]);
    expect(nuevas.filter((r) => !r.guards.includes(ProjectWriteGuard)).map((r) => r.id)).toEqual([]);
    expect(nuevas.filter((r) => PUBLICAS.has(r.id))).toEqual([]);
  });

  // MEJ-54/55/56/57/23/24: seguimiento, resultados, portafolios, reconocimientos, retrospectiva y reporte del Sprint (permisos en los servicios).
  it('las rutas de seguimiento del proyecto y del sprint existen y exigen JwtAuthGuard', () => {
    const sprint = 'proyectos/:projectId/sprints/:sprintId';
    const esperadas = [
      'GET /api/proyectos/:projectId/seguimiento',
      'GET /api/proyectos/:projectId/resultados',
      'GET /api/organizaciones/:idOrganizacion/portafolio',
      'GET /api/asociaciones/:idAsociacion/portafolio',
      `GET /api/${sprint}/reconocimientos`,
      `POST /api/${sprint}/reconocimientos`,
      `GET /api/${sprint}/retrospectiva`,
      `PUT /api/${sprint}/retrospectiva`,
      `GET /api/${sprint}/reporte/csv`,
      `GET /api/${sprint}/reporte/pdf`,
    ];
    const deSeguimiento = rutas.filter((r) => esperadas.includes(r.id));
    expect(deSeguimiento.map((r) => r.id).sort()).toEqual([...esperadas].sort());
    expect(deSeguimiento.filter((r) => !r.guards.includes(JwtAuthGuard)).map((r) => r.id)).toEqual([]);
    expect(deSeguimiento.filter((r) => PUBLICAS.has(r.id))).toEqual([]);
  });

  it('toda ruta de administracion exige RolesGuard y @Roles("administrador")', () => {
    const admin = rutas.filter((r) => r.adminPath);
    expect(admin.length).toBeGreaterThan(20);
    const sinRol = admin
      .filter((r) => !r.guards.includes(RolesGuard) || !r.roles.includes('administrador'))
      .map((r) => `${r.id} (${r.controller})`);
    expect(sinRol).toEqual([]);
  });

  it('panel admin (MEJ-69 a 72, 36, 68): las rutas nuevas existen y son solo de administrador', () => {
    const esperadas = [
      'GET /api/admin/pendientes',
      'POST /api/admin/cuentas-pendientes/aprobar-lote',
      'GET /api/admin/metricas/entidades',
      'GET /api/admin/horas-semestre/comparativo',
      'GET /api/admin/horas-semestre/resumen-asociaciones',
    ];
    const nuevas = rutas.filter((r) => esperadas.includes(r.id));
    expect(nuevas.map((r) => r.id).sort()).toEqual([...esperadas].sort());
    expect(nuevas.every((r) => r.guards.includes(JwtAuthGuard) && r.guards.includes(RolesGuard) && r.roles.includes('administrador'))).toBe(true);
  });

  // ROL-1: unica lista de rutas abiertas al coordinador academico; el alcance se verifica en cada servicio.
  it('solo estas rutas admiten coordinador_academico, todas con JwtAuthGuard y RolesGuard', () => {
    const esperadas = [
      'GET /api/admin/horas-semestre',
      'GET /api/admin/horas-semestre/csv',
      'GET /api/admin/horas-semestre/pdf',
      'GET /api/admin/horas-semestre/totales',
      'GET /api/admin/proyectos/:projectId',
      'GET /api/proyectos/:id/admin',
      'GET /api/coordinador/mi-alcance',
      'GET /api/coordinador/pendientes',
      'GET /api/revisiones/admin/bandeja',
      'POST /api/proyectos/:projectId/aprobar-cierre',
      'POST /api/proyectos/:projectId/cierre/correccion-documental',
      'POST /api/proyectos/:projectId/rechazar-cierre',
      'POST /api/revisiones/proyectos/:idProyecto/reclamar',
      'POST /api/revisiones/proyectos/:idProyecto/resolver',
    ];
    const abiertas = rutas.filter((r) => r.roles.includes('coordinador_academico'));
    expect(abiertas.map((r) => r.id).sort()).toEqual([...esperadas].sort());
    expect(abiertas.filter((r) => !r.guards.includes(JwtAuthGuard) || !r.guards.includes(RolesGuard)).map((r) => r.id)).toEqual([]);
  });

  // Lecturas sin @Roles que el servicio abre al coordinador solo dentro de su alcance (nada de escrituras).
  it('las lecturas de preparacion de cierre y canal de revision existen con JwtAuthGuard', () => {
    const lecturas = ['GET /api/proyectos/:projectId/cierre/readiness', 'GET /api/mensajes-revision/proyectos/:idProyecto'];
    const halladas = rutas.filter((r) => lecturas.includes(r.id));
    expect(halladas.map((r) => r.id).sort()).toEqual([...lecturas].sort());
    expect(halladas.every((r) => r.guards.includes(JwtAuthGuard) && r.roles.length === 0)).toBe(true);
  });

  it('la asignacion del alcance del coordinador es solo de administrador', () => {
    const rutasAlcance = rutas.filter((r) => r.path.startsWith('admin/coordinadores'));
    expect(rutasAlcance.map((r) => r.id).sort()).toEqual([
      'GET /api/admin/coordinadores/:idUsuario/alcance',
      'PUT /api/admin/coordinadores/:idUsuario/alcance',
    ]);
    expect(rutasAlcance.every((r) => r.guards.includes(JwtAuthGuard) && r.guards.includes(RolesGuard) && r.roles.join() === 'administrador')).toBe(true);
  });

  // MEJ-81 a 85: cuenta propia (el servicio opera siempre sobre el usuario del token) y bandeja de desactivaciones.
  it('cuenta: sesiones, contrasena, descarga de datos y desactivacion existen todas y exigen JwtAuthGuard', () => {
    const esperadas = [
      'GET /api/cuenta/sesiones',
      'POST /api/cuenta/sesiones/cerrar-otras',
      'DELETE /api/cuenta/sesiones/:idSesion',
      'POST /api/cuenta/sesiones/:idSesion/no-fui-yo',
      'POST /api/cuenta/contrasena',
      'GET /api/cuenta/mis-datos',
      'GET /api/cuenta/desactivacion',
      'POST /api/cuenta/desactivacion',
    ];
    const deCuenta = rutas.filter((r) => r.controller.startsWith('CuentaController.'));
    expect(deCuenta.map((r) => r.id).sort()).toEqual([...esperadas].sort());
    expect(deCuenta.filter((r) => !r.guards.includes(JwtAuthGuard)).map((r) => r.id)).toEqual([]);
    expect(deCuenta.filter((r) => PUBLICAS.has(r.id))).toEqual([]);
  });

  it('solicitudes de desactivacion: solo administrador (el coordinador no resuelve)', () => {
    const esperadas = [
      'GET /api/admin/solicitudes-desactivacion',
      'POST /api/admin/solicitudes-desactivacion/:id/aprobar',
      'POST /api/admin/solicitudes-desactivacion/:id/rechazar',
    ];
    const propias = rutas.filter((r) => r.controller.startsWith('SolicitudesDesactivacionAdminController.'));
    expect(propias.map((r) => r.id).sort()).toEqual([...esperadas].sort());
    expect(
      propias.every((r) => r.guards.includes(JwtAuthGuard) && r.guards.includes(RolesGuard) && r.roles.length === 1 && r.roles[0] === 'administrador'),
    ).toBe(true);
  });

  it('ADM-1: mantenimiento, tablas y estado del sistema existen; solo el estado de mantenimiento es publico, el resto es solo de administrador', () => {
    const admin = [
      'GET /api/admin/mantenimiento',
      'PUT /api/admin/mantenimiento',
      'GET /api/admin/estado-sistema',
      'GET /api/admin/tablas',
      'GET /api/admin/tablas/:entidad',
      'GET /api/admin/tablas/:entidad/exportar',
      'GET /api/admin/tablas/:entidad/:id',
    ];
    const encontradas = rutas.filter((r) => admin.includes(r.id));
    expect(encontradas.map((r) => r.id).sort()).toEqual([...admin].sort());
    expect(
      encontradas.every((r) => r.guards.includes(JwtAuthGuard) && r.guards.includes(RolesGuard) && r.roles.length === 1 && r.roles[0] === 'administrador'),
    ).toBe(true);
    expect(encontradas.filter((r) => PUBLICAS.has(r.id))).toEqual([]);
    const publica = rutas.filter((r) => r.id === 'GET /api/mantenimiento');
    expect(publica).toHaveLength(1);
    expect(PUBLICAS.has('GET /api/mantenimiento')).toBe(true);
  });

  it('asociaciones: la gestion es solo de admin y las rutas de junta exigen JuntaGuard', () => {
    const ids = (f: (r: Ruta) => boolean) => rutas.filter(f).map((r) => r.id).sort();
    expect(ids((r) => r.path.startsWith('admin/asociaciones'))).toEqual([
      'DELETE /api/admin/asociaciones/:idAsociacion/junta/:idUsuario',
      'GET /api/admin/asociaciones',
      'GET /api/admin/asociaciones/:idAsociacion',
      'PATCH /api/admin/asociaciones/:idAsociacion',
      'PATCH /api/admin/asociaciones/:idAsociacion/junta/:idUsuario',
      'POST /api/admin/asociaciones',
      'POST /api/admin/asociaciones/:idAsociacion/junta',
    ]);
    expect(ids((r) => r.path.startsWith('asociaciones'))).toEqual([
      'GET /api/asociaciones/:idAsociacion/anuncios',
      'GET /api/asociaciones/:idAsociacion/candidatos-participantes',
      'GET /api/asociaciones/:idAsociacion/estudiantes',
      'GET /api/asociaciones/:idAsociacion/estudiantes/csv',
      'GET /api/asociaciones/:idAsociacion/estudiantes/pdf',
      'GET /api/asociaciones/:idAsociacion/membresia',
      'GET /api/asociaciones/:idAsociacion/portafolio',
      'GET /api/asociaciones/:idAsociacion/proyectos',
      'GET /api/asociaciones/:idAsociacion/proyectos/csv',
      'GET /api/asociaciones/:idAsociacion/proyectos/pdf',
      'GET /api/asociaciones/mis-juntas',
      'PATCH /api/asociaciones/:idAsociacion/anuncios/:idAnuncio/despublicar',
      'POST /api/asociaciones/:idAsociacion/anuncios',
    ]);
    const conJunta = rutas.filter((r) => r.path.startsWith('asociaciones/:idAsociacion'));
    expect(conJunta.every((r) => r.guards.includes(JuntaGuard))).toBe(true);
  });

  // MEJ-15/18/20/21/22/62: cada ruta nueva se declara aqui con su guard; una de mas o de menos hace fallar la prueba.
  it('descubrimiento: seguimientos, invitaciones a rol, «Para ti» y duplicar exigen JwtAuthGuard', () => {
    const ids = (f: (r: Ruta) => boolean) => rutas.filter(f).map((r) => r.id).sort();
    const deSeguimientos = rutas.filter((r) => r.controller.startsWith('FollowsController.'));
    expect(deSeguimientos.map((r) => r.id).sort()).toEqual([
      'DELETE /api/seguimientos/asociaciones/:id',
      'DELETE /api/seguimientos/organizaciones/:id',
      'GET /api/seguimientos/asociaciones',
      'GET /api/seguimientos/mios',
      'POST /api/seguimientos/asociaciones/:id',
      'POST /api/seguimientos/organizaciones/:id',
    ]);
    const deInvitaciones = rutas.filter((r) => r.controller.startsWith('RoleInvitationsController.'));
    expect(deInvitaciones.map((r) => r.id).sort()).toEqual([
      'GET /api/invitaciones-rol/mias',
      'GET /api/invitaciones-rol/sugerencias',
      'POST /api/invitaciones-rol',
      'POST /api/invitaciones-rol/:id/aceptar',
      'POST /api/invitaciones-rol/:id/rechazar',
    ]);
    const deProyectos = ids((r) => ['GET /api/proyectos/para-ti', 'POST /api/proyectos/:id/duplicar', 'GET /api/proyectos/:id/postulaciones'].includes(r.id));
    expect(deProyectos).toHaveLength(3);
    const nuevas = rutas.filter(
      (r) => deSeguimientos.includes(r) || deInvitaciones.includes(r) || ['GET /api/proyectos/para-ti', 'POST /api/proyectos/:id/duplicar'].includes(r.id),
    );
    expect(nuevas.filter((r) => !r.guards.includes(JwtAuthGuard)).map((r) => r.id)).toEqual([]);
    expect(nuevas.filter((r) => PUBLICAS.has(r.id))).toEqual([]);
  });

  // MEJ-88/89/90: primeros pasos, contenido de ejemplo del primer proyecto y reportes de problemas.
  it('primeros pasos, ejemplo del proyecto y reportes de problema: rutas con JwtAuthGuard y las de admin solo para administrador', () => {
    const esperadas = [
      'GET /api/usuarios/me/primeros-pasos',
      'POST /api/usuarios/me/primeros-pasos/cerrar',
      'GET /api/proyectos/:projectId/ejemplo',
      'POST /api/proyectos/:projectId/ejemplo',
      'DELETE /api/proyectos/:projectId/ejemplo',
      'POST /api/reportes-problema',
      'GET /api/admin/reportes-problema',
      'PATCH /api/admin/reportes-problema/:id/atender',
    ];
    const nuevas = rutas.filter((r) => esperadas.includes(r.id));
    expect(nuevas.map((r) => r.id).sort()).toEqual([...esperadas].sort());
    expect(nuevas.filter((r) => !r.guards.includes(JwtAuthGuard)).map((r) => r.id)).toEqual([]);
    expect(nuevas.filter((r) => PUBLICAS.has(r.id))).toEqual([]);
    const deAdmin = nuevas.filter((r) => r.path.startsWith('admin/'));
    expect(deAdmin).toHaveLength(2);
    expect(deAdmin.every((r) => r.guards.includes(RolesGuard) && r.roles.includes('administrador'))).toBe(true);
    expect(nuevas.filter((r) => r.path === 'reportes-problema').every((r) => !r.guards.includes(RolesGuard))).toBe(true);
  });

  // MEJ-26/27/28/63/64/33/34/66: perfil y social, .ics, calendario y anuncios de organizaciones y asociaciones.
  it('perfil, calendario y anuncios de entidades: las rutas nuevas existen y exigen JwtAuthGuard', () => {
    const esperadas = [
      'GET /api/social/usuarios/:id/resumen',
      'GET /api/social/usuarios/:id/actividad',
      'GET /api/social/usuarios/:id/cv',
      'GET /api/social/usuarios/:id/cv/pdf',
      'POST /api/social/amistades/:idAmigo/mensaje',
      'GET /api/usuarios/me/eventos/ics',
      'GET /api/organizaciones/:id/calendario',
      'GET /api/organizaciones/:id/calendario/ics',
      'GET /api/organizaciones/:id/anuncios',
      'POST /api/organizaciones/:id/anuncios',
      'PATCH /api/organizaciones/:id/anuncios/:idAnuncio/despublicar',
      'GET /api/asociaciones/:idAsociacion/anuncios',
      'POST /api/asociaciones/:idAsociacion/anuncios',
      'PATCH /api/asociaciones/:idAsociacion/anuncios/:idAnuncio/despublicar',
    ];
    const nuevas = rutas.filter((r) => esperadas.includes(r.id));
    expect(nuevas.map((r) => r.id).sort()).toEqual([...esperadas].sort());
    expect(nuevas.filter((r) => !r.guards.includes(JwtAuthGuard)).map((r) => r.id)).toEqual([]);
    expect(nuevas.filter((r) => PUBLICAS.has(r.id))).toEqual([]);
    expect(nuevas.filter((r) => r.path.startsWith('asociaciones/') && !r.guards.includes(JuntaGuard))).toEqual([]);
  });

  // MEJ-93/96/100: proyectos parecidos, retiro (DELETE conserva la ruta) y «en revisión» de una postulación.
  it('parecidos y revisión de postulaciones: las rutas nuevas existen, exigen JwtAuthGuard y las de escritura el ProjectWriteGuard', () => {
    const esperadas = ['GET /api/proyectos/:id/similares', 'POST /api/postulaciones/:id/en-revision'];
    const nuevas = rutas.filter((r) => esperadas.includes(r.id));
    expect(nuevas.map((r) => r.id).sort()).toEqual([...esperadas].sort());
    expect(nuevas.filter((r) => !r.guards.includes(JwtAuthGuard)).map((r) => r.id)).toEqual([]);
    expect(nuevas.filter((r) => PUBLICAS.has(r.id))).toEqual([]);
    expect(nuevas.filter((r) => r.id.startsWith('POST') && !r.guards.includes(ProjectWriteGuard))).toEqual([]);
    const retiro = rutas.find((r) => r.id === 'DELETE /api/postulaciones/:id');
    expect(retiro?.guards).toEqual(expect.arrayContaining([JwtAuthGuard, ProjectWriteGuard]));
  });
  // MEJ-102/142/146-154: perfil, portafolio, bloqueos, reportes y bienvenida. Solo el portafolio publico queda sin sesion.
  it('perfil y portafolio: las rutas nuevas existen, exigen JwtAuthGuard y solo el portafolio publico queda abierto', () => {
    const protegidas = [
      'GET /api/perfil/me/portafolio',
      'PUT /api/perfil/me/portafolio',
      'POST /api/perfil/me/portafolio/regenerar',
      'PUT /api/perfil/me/disponibilidad',
      'PUT /api/perfil/me/enlaces',
      'GET /api/perfil/me/semestre',
      'GET /api/perfil/asistente-reuniones',
      'GET /api/perfil/:id/habilidades',
      'PUT /api/perfil/:id/habilidades/:idHabilidad/confirmacion',
      'DELETE /api/perfil/:id/habilidades/:idHabilidad/confirmacion',
      'GET /api/perfil/:id/personas-parecidas',
      'GET /api/perfil/:id/disponibilidad',
      'GET /api/perfil/:id/enlaces',
      'GET /api/restricciones',
      'PUT /api/restricciones/:tipo/:idObjetivo',
      'DELETE /api/restricciones/:tipo/:idObjetivo',
      'POST /api/reportes-perfil',
      'GET /api/admin/reportes-perfil',
      'PATCH /api/admin/reportes-perfil/:id',
      'GET /api/proyectos/:id/mensaje-bienvenida',
      'PUT /api/proyectos/:id/mensaje-bienvenida',
    ];
    const nuevas = rutas.filter((r) => protegidas.includes(r.id));
    expect(nuevas.map((r) => r.id).sort()).toEqual([...protegidas].sort());
    expect(nuevas.filter((r) => !r.guards.includes(JwtAuthGuard)).map((r) => r.id)).toEqual([]);
    expect(nuevas.filter((r) => PUBLICAS.has(r.id))).toEqual([]);
    // La bandeja de reportes de perfil exige rol de administrador.
    expect(nuevas.filter((r) => r.adminPath && !r.guards.includes(RolesGuard)).map((r) => r.id)).toEqual([]);

    const publicas = rutas.filter((r) => r.path.startsWith('publico/'));
    expect(publicas.map((r) => r.id)).toEqual(['GET /api/publico/portafolio/:token']);
    expect(publicas.every((r) => PUBLICAS.has(r.id) && !r.guards.includes(JwtAuthGuard))).toBe(true);
  });
});
