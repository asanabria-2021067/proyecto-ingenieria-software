import { describe, expect, it } from 'vitest';
import {
  puedeActuarSobre,
  puedeGestionar,
  puedePublicarComo,
  rolesQueSePuedenAsignar,
} from '@/lib/organizations/roles';
import { mensajeErrorOrganizacion } from '@/lib/organizations/errors';
import { validarDatosOrganizacion, validarLogo, validarSitioWeb } from '@/lib/organizations/form';

describe('permisos por rol de organizacion', () => {
  it('solo Propietario y Administrador gestionan', () => {
    expect(puedeGestionar('PROPIETARIO')).toBe(true);
    expect(puedeGestionar('ADMINISTRADOR')).toBe(true);
    expect(puedeGestionar('EDITOR')).toBe(false);
    expect(puedeGestionar('LECTURA')).toBe(false);
    expect(puedeGestionar(null)).toBe(false);
  });

  it('publican Propietario, Administrador y Editor; Lectura no', () => {
    expect(['PROPIETARIO', 'ADMINISTRADOR', 'EDITOR'].every((r) => puedePublicarComo(r as never))).toBe(true);
    expect(puedePublicarComo('LECTURA')).toBe(false);
    expect(puedePublicarComo(undefined)).toBe(false);
  });

  it('nadie actua sobre el Propietario ni sobre si mismo', () => {
    expect(puedeActuarSobre('PROPIETARIO', 'PROPIETARIO', false)).toBe(false);
    expect(puedeActuarSobre('ADMINISTRADOR', 'PROPIETARIO', false)).toBe(false);
    expect(puedeActuarSobre('PROPIETARIO', 'EDITOR', true)).toBe(false);
  });

  it('el Administrador no toca a otros administradores; el Propietario si', () => {
    expect(puedeActuarSobre('ADMINISTRADOR', 'ADMINISTRADOR', false)).toBe(false);
    expect(puedeActuarSobre('ADMINISTRADOR', 'EDITOR', false)).toBe(true);
    expect(puedeActuarSobre('PROPIETARIO', 'ADMINISTRADOR', false)).toBe(true);
  });

  it('Editor y Lectura no cambian roles', () => {
    expect(puedeActuarSobre('EDITOR', 'LECTURA', false)).toBe(false);
    expect(puedeActuarSobre('LECTURA', 'LECTURA', false)).toBe(false);
  });

  it('el Administrador no puede asignar el rol Administrador y nadie asigna Propietario', () => {
    expect(rolesQueSePuedenAsignar('PROPIETARIO')).toEqual(['ADMINISTRADOR', 'EDITOR', 'LECTURA']);
    expect(rolesQueSePuedenAsignar('ADMINISTRADOR')).toEqual(['EDITOR', 'LECTURA']);
    expect(rolesQueSePuedenAsignar('EDITOR')).toEqual([]);
  });
});

describe('validacion del formulario de organizacion', () => {
  it('el nombre pide entre 3 y 120 caracteres sin contar espacios sobrantes', () => {
    expect(validarDatosOrganizacion({ nombre: '  ab  ', descripcion: '' }).nombre).toBeDefined();
    expect(validarDatosOrganizacion({ nombre: 'abc', descripcion: '' })).toEqual({});
    expect(validarDatosOrganizacion({ nombre: 'a'.repeat(121), descripcion: '' }).nombre).toBeDefined();
  });

  it('la descripcion admite hasta 2000 caracteres', () => {
    expect(validarDatosOrganizacion({ nombre: 'abc', descripcion: 'x'.repeat(2000) })).toEqual({});
    expect(validarDatosOrganizacion({ nombre: 'abc', descripcion: 'x'.repeat(2001) }).descripcion).toBeDefined();
  });

  it('el sitio web es opcional y solo acepta http(s)', () => {
    expect(validarSitioWeb('')).toEqual({});
    expect(validarSitioWeb('https://uvg.edu.gt')).toEqual({});
    expect(validarSitioWeb('javascript:alert(1)').sitioWeb).toBeDefined();
    expect(validarSitioWeb('uvg.edu.gt').sitioWeb).toBeDefined();
  });

  it('el logo debe ser imagen, como la foto de perfil', () => {
    expect(validarLogo(null)).toEqual({});
    expect(validarLogo({ type: 'image/png' })).toEqual({});
    expect(validarLogo({ type: 'application/pdf' }).logo).toBeDefined();
  });
});

describe('mensajeErrorOrganizacion', () => {
  const conEstado = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

  it('muestra tal cual las reglas de negocio (400, 403, 409)', () => {
    for (const status of [400, 403, 409]) {
      expect(mensajeErrorOrganizacion(conEstado(status, 'Ya existe una organización con ese nombre'))).toBe(
        'Ya existe una organización con ese nombre',
      );
    }
  });

  it('en cualquier otro caso usa el mensaje general, sin texto tecnico', () => {
    expect(mensajeErrorOrganizacion(conEstado(500, 'Internal server error'))).not.toContain('Internal');
  });
});
