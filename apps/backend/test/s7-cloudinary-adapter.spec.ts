import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { CloudinaryClosureStorageAdapter } from '../src/storage/cloudinary-closure-storage.adapter';
import type { ClosureAvailability } from '../src/config/environment.validation';

/**
 * C106+ (06 v2 §26/§27/§47 TC02): contratos del adaptador Cloudinary. El SDK
 * nunca se invoca de verdad aquí y ninguna credencial real interviene: la
 * capacidad del proveedor ya está verificada operacionalmente y lo que se fija
 * en estas pruebas es el contrato del adaptador.
 */

const disponibilidadBase: ClosureAvailability = {
  disponible: true,
  faltantes: [],
  motivos: [],
  cloudName: 'cuenta-sintetica',
  prefix: 'uvgenius/cierre',
  deliveryMode: 'authenticated',
  activeKeyId: 'k1',
  keyIds: ['k1'],
  cleanupDisponible: false,
  sweeperAdminId: null,
  motivosCleanup: ['SWEEPER_ADMIN_ID_AUSENTE'],
};

function adapter(overrides: Record<string, unknown> = {}): CloudinaryClosureStorageAdapter {
  const valores: Record<string, unknown> = { closure: disponibilidadBase, ...overrides };
  const config = {
    get: (clave: string) => valores[clave],
  } as unknown as ConfigService;
  return new CloudinaryClosureStorageAdapter(config);
}

const PUBLIC_ID_PATTERN = /^uvgenius\/cierre\/\d+\/[0-9a-f-]{36}\.enc$/;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('S7 adaptador Cloudinary de cierre', () => {
  it('TC02-A: el publicId sigue uvgenius/cierre/<projectId>/<uuid-v4>.enc y nunca se reutiliza', () => {
    const sinPrefijoExplicito = adapter();

    const primera = sinPrefijoExplicito.buildIdentity(41);
    const segunda = sinPrefijoExplicito.buildIdentity(41);
    const otroProyecto = sinPrefijoExplicito.buildIdentity(77);

    for (const identidad of [primera, segunda, otroProyecto]) {
      expect(identidad.publicId).toMatch(PUBLIC_ID_PATTERN);
      // El resourceType es siempre raw: un documento de cierre nunca es imagen.
      expect(identidad.resourceType).toBe('raw');
      expect(identidad.proveedor).toBe('cloudinary');
      expect(identidad.cloudName).toBe('cuenta-sintetica');
      // La versión y el assetId solo existen tras la confirmación remota.
      expect(identidad.assetId ?? null).toBeNull();
      expect(identidad.version ?? null).toBeNull();
      const uuid = identidad.publicId.split('/')[3].replace('.enc', '');
      expect(uuid).toMatch(UUID_V4_PATTERN);
    }
    expect(primera.publicId.startsWith('uvgenius/cierre/41/')).toBe(true);
    expect(otroProyecto.publicId.startsWith('uvgenius/cierre/77/')).toBe(true);

    // Tres identidades distintas: el prefijo ausente usa el default congelado.
    const identificadores = [primera.publicId, segunda.publicId, otroProyecto.publicId];
    expect(new Set(identificadores).size).toBe(3);

    // El prefijo explícito y congelado produce exactamente el mismo namespace.
    const conPrefijoExplicito = adapter({ CLOSURE_CLOUDINARY_PREFIX: 'uvgenius/cierre' });
    expect(conPrefijoExplicito.buildIdentity(41).publicId).toMatch(PUBLIC_ID_PATTERN);

    // Un prefijo fuera del namespace se rechaza: no se escribe cierre sobre
    // los assets del resto del producto.
    for (const prefijoAjeno of ['uvgenius/perfiles', 'otro/namespace', '../uvgenius/cierre']) {
      expect(() => adapter({ CLOSURE_CLOUDINARY_PREFIX: prefijoAjeno }).buildIdentity(41)).toThrow();
    }

    // Tras un error de carga y tras una purga se pide un identificador NUEVO.
    const trasError = sinPrefijoExplicito.buildIdentity(41);
    const trasPurga = sinPrefijoExplicito.buildIdentity(41);
    expect(trasError.publicId).not.toBe(primera.publicId);
    expect(trasPurga.publicId).not.toBe(trasError.publicId);
    expect(new Set([...identificadores, trasError.publicId, trasPurga.publicId]).size).toBe(5);

    // Ningún identificador lleva el sufijo antiguo ni un nombre del usuario.
    for (const publicId of [...identificadores, trasError.publicId, trasPurga.publicId]) {
      expect(publicId.endsWith('.enc')).toBe(true);
      expect(publicId).not.toContain('.bin');
      expect(publicId).not.toContain('..');
    }
  });
});
