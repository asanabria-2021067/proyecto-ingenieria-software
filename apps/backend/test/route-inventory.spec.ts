import 'reflect-metadata';
import { beforeAll, describe, expect, it } from 'vitest';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../src/auth/optional-jwt-auth.guard';
import { cargarRutas, RUTAS_PUBLICAS as PUBLICAS, type Ruta } from './helpers/route-inventory';
import { RolesGuard } from '../src/common/guards/roles.guard';

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

  it('toda ruta de administracion exige RolesGuard y @Roles("administrador")', () => {
    const admin = rutas.filter((r) => r.adminPath);
    expect(admin.length).toBeGreaterThan(20);
    const sinRol = admin
      .filter((r) => !r.guards.includes(RolesGuard) || !r.roles.includes('administrador'))
      .map((r) => `${r.id} (${r.controller})`);
    expect(sinRol).toEqual([]);
  });
});
