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

  // MEJ-45/46: tarjetas de enlaces internos y «Recuérdamelo» (permisos en los servicios).
  it('las rutas de tarjetas de enlaces y recordatorios del chat existen y exigen JwtAuthGuard', () => {
    const base = 'proyectos/:projectId/conversaciones/:conversationId';
    const esperadas = [`POST /api/${base}/tarjetas`, `POST /api/${base}/mensajes/:messageId/recordatorio`];
    const deChat = rutas.filter((r) => esperadas.includes(r.id));
    expect(deChat.map((r) => r.id).sort()).toEqual([...esperadas].sort());
    expect(deChat.filter((r) => !r.guards.includes(JwtAuthGuard)).map((r) => r.id)).toEqual([]);
  });

  // MEJ-6/10/49/52: checklist, historial, evidencias y plantillas de tarea (permisos por actor en el servicio).
  it('las rutas de checklist, historial, evidencias y plantillas existen todas, con JwtAuthGuard y escrituras con ProjectWriteGuard', () => {
    const esperadas = {
      TasksExtrasController: [
        'GET /api/proyectos/:projectId/tareas/:taskId/historial',
        'POST /api/proyectos/:projectId/tareas/:taskId/checklist',
        'PATCH /api/proyectos/:projectId/tareas/:taskId/checklist/:itemId',
        'DELETE /api/proyectos/:projectId/tareas/:taskId/checklist/:itemId',
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
    expect(escriben.length).toBe(7);
    expect(escriben.filter((r) => !r.guards.includes(ProjectWriteGuard)).map((r) => r.id)).toEqual([]);
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
});
