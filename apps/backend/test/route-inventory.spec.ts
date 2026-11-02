import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../src/auth/optional-jwt-auth.guard';
import { cargarRutas, RUTAS_PUBLICAS as PUBLICAS, type Ruta } from './helpers/route-inventory';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { JuntaGuard } from '../src/associations/junta.guard';

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
    ];
    const deOrganizaciones = rutas.filter((r) => r.controller.startsWith('OrganizationsController.'));
    expect(deOrganizaciones.map((r) => r.id).sort()).toEqual([...esperadas].sort());
    expect(deOrganizaciones.filter((r) => !r.guards.includes(JwtAuthGuard)).map((r) => r.id)).toEqual([]);
    expect(deOrganizaciones.filter((r) => PUBLICAS.has(r.id))).toEqual([]);
  });

  it('toda ruta de administracion exige RolesGuard y @Roles("administrador")', () => {
    const admin = rutas.filter((r) => r.adminPath);
    expect(admin.length).toBeGreaterThan(20);
    const sinRol = admin
      .filter((r) => !r.guards.includes(RolesGuard) || !r.roles.includes('administrador'))
      .map((r) => `${r.id} (${r.controller})`);
    expect(sinRol).toEqual([]);
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
      'GET /api/asociaciones/:idAsociacion/estudiantes',
      'GET /api/asociaciones/:idAsociacion/estudiantes/csv',
      'GET /api/asociaciones/:idAsociacion/estudiantes/pdf',
      'GET /api/asociaciones/:idAsociacion/membresia',
      'GET /api/asociaciones/:idAsociacion/proyectos',
      'GET /api/asociaciones/:idAsociacion/proyectos/csv',
      'GET /api/asociaciones/:idAsociacion/proyectos/pdf',
      'GET /api/asociaciones/mis-juntas',
    ]);
    const conJunta = rutas.filter((r) => r.path.startsWith('asociaciones/:idAsociacion'));
    expect(conJunta.every((r) => r.guards.includes(JuntaGuard))).toBe(true);
  });
});
