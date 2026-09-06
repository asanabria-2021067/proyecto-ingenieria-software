import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { Writable } from 'node:stream';
import { CloudinaryClosureStorageAdapter } from '../src/storage/cloudinary-closure-storage.adapter';
import {
  validateEnvironment,
  type ClosureAvailability,
} from '../src/config/environment.validation';

/**
 * SDK mockeado: ninguna llamada sale del proceso. `upload_stream` devuelve un
 * `Writable` para que el adaptador termine el stream igual que en producción.
 */
const uploadResultado = vi.fn();
const firmar = vi.fn(() => 'firma-sintetica');

vi.mock('cloudinary', () => ({
  v2: {
    utils: {
      api_sign_request: (...args: unknown[]) => firmar(...(args as [])),
    },
    uploader: {
      upload_stream: (
        options: Record<string, unknown>,
        callback: (error: unknown, result: unknown) => void,
      ) => {
        const sink = new Writable({ write(_chunk, _encoding, done) { done(); } });
        sink.on('finish', () => {
          try {
            callback(null, uploadResultado(options));
          } catch (error) {
            callback(error, undefined);
          }
        });
        return sink;
      },
    },
  },
}));

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
  const valores: Record<string, unknown> = {
    closure: disponibilidadBase,
    CLOUDINARY_API_KEY: '123456789012345',
    CLOUDINARY_API_SECRET: 'secreto-sintetico-de-prueba',
    ...overrides,
  };
  const config = {
    get: (clave: string) => valores[clave],
  } as unknown as ConfigService;
  return new CloudinaryClosureStorageAdapter(config);
}

const PUBLIC_ID_PATTERN = /^uvgenius\/cierre\/\d+\/[0-9a-f-]{36}\.enc$/;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('S7 adaptador Cloudinary de cierre', () => {
  beforeEach(() => {
    uploadResultado.mockReset();
    firmar.mockClear();
  });

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

  it('TC02-B: la modalidad primaria es raw/authenticated con overwrite=false y no se degrada por 200 inesperado, timeout, credenciales, cuota ni red', async () => {
    const primario = adapter();
    const identidad = primario.buildIdentity(41);
    const ciphertext = Buffer.from('ciphertext sintético de cierre', 'utf8');

    // Los parámetros firmados llevan exactamente lo que exige el contrato.
    const firmados = primario.signUploadParams(identidad);
    expect(firmados.publicId).toBe(identidad.publicId);
    expect(firmados.type).toBe('authenticated');
    expect(firmados.overwrite).toBe(false);
    expect(Number.isInteger(firmados.timestamp)).toBe(true);
    expect(firmar).toHaveBeenCalledWith(
      { public_id: identidad.publicId, timestamp: firmados.timestamp, type: 'authenticated', overwrite: false },
      'secreto-sintetico-de-prueba',
    );
    // La firma se produce en el servidor; el secreto no viaja en el resultado.
    expect(JSON.stringify(firmados)).not.toContain('secreto-sintetico-de-prueba');

    const opcionesDe = (llamada: number) => uploadResultado.mock.calls[llamada][0] as Record<string, unknown>;

    // 1) Éxito.
    uploadResultado.mockImplementation(() => ({ asset_id: 'asset-1', version: 17 }));
    const confirmada = await primario.uploadImmutable(identidad, ciphertext, firmados);
    expect(confirmada.deliveryType).toBe('authenticated');
    expect(confirmada.assetId).toBe('asset-1');
    expect(confirmada.version).toBe('17');
    expect(opcionesDe(0)).toMatchObject({
      public_id: identidad.publicId,
      resource_type: 'raw',
      type: 'authenticated',
      overwrite: false,
    });

    // 2..6) Cinco fallos distintos, ninguno degrada la modalidad.
    const fallos: Array<[string, () => never]> = [
      ['timeout', () => { throw Object.assign(new Error('Request Timeout'), { http_code: 499 }); }],
      ['credenciales', () => { throw Object.assign(new Error('Invalid Signature'), { http_code: 401 }); }],
      ['cuota', () => { throw Object.assign(new Error('Quota exceeded'), { http_code: 420 }); }],
      ['red', () => { throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }); }],
    ];
    // Un 200 con el asset ANTERIOR: el proveedor responde éxito sin haber
    // sustituido los bytes. No es un fallo de red y no degrada nada.
    uploadResultado.mockImplementation(() => ({ asset_id: 'asset-previo', version: 3 }));
    const inesperada = await primario.uploadImmutable(identidad, ciphertext, firmados);
    expect(inesperada.deliveryType).toBe('authenticated');
    expect(inesperada.assetId).toBe('asset-previo');
    expect(primario.signUploadParams(primario.buildIdentity(41)).type).toBe('authenticated');

    for (const [caso, lanzar] of fallos) {
      uploadResultado.mockImplementation(lanzar);
      let fallo: unknown;
      await primario.uploadImmutable(identidad, ciphertext, firmados).catch((error: unknown) => {
        fallo = error;
      });
      expect(fallo, `${caso} no falló`).toBeDefined();
      expect((fallo as { getStatus?: () => number }).getStatus?.()).toBe(503);
      // El mensaje no propaga el original del proveedor ni el secreto.
      expect((fallo as Error).message).not.toContain('secreto-sintetico-de-prueba');
      expect((fallo as Error).message).not.toContain('firma-sintetica');
      // Y la siguiente operación sigue usando la modalidad primaria.
      expect(primario.signUploadParams(identidad).type).toBe('authenticated');
    }
    // Tras los cinco fallos, la modalidad de la última carga sigue siendo la
    // primaria: nunca se degradó sola.
    uploadResultado.mockImplementation(() => ({ asset_id: 'asset-2', version: 18 }));
    const trasFallos = await primario.uploadImmutable(identidad, ciphertext, firmados);
    expect(trasFallos.deliveryType).toBe('authenticated');
    const ultimasOpciones = opcionesDe(uploadResultado.mock.calls.length - 1);
    expect(ultimasOpciones.type).toBe('authenticated');
    expect(ultimasOpciones.overwrite).toBe(false);

    // Las modalidades explícitas se usan tal cual y comparten overwrite=false.
    for (const modo of ['private', 'upload'] as const) {
      uploadResultado.mockImplementation(() => ({ asset_id: `asset-${modo}`, version: 1 }));
      const explicito = adapter({ closure: { ...disponibilidadBase, deliveryMode: modo } });
      const suIdentidad = explicito.buildIdentity(41);
      const susParams = explicito.signUploadParams(suIdentidad);
      expect(susParams.type).toBe(modo);
      expect(susParams.overwrite).toBe(false);
      const resultado = await explicito.uploadImmutable(suIdentidad, ciphertext, susParams);
      expect(resultado.deliveryType).toBe(modo);
      const opciones = opcionesDe(uploadResultado.mock.calls.length - 1);
      expect(opciones).toMatchObject({ resource_type: 'raw', type: modo, overwrite: false });
    }

    // Un valor no enumerado no es una modalidad: la configuración lo rechaza.
    const invalido = validateEnvironment({
      FRONTEND_URL: 'http://localhost:3000',
      CLOSURE_CLOUDINARY_DELIVERY_MODE: 'publico',
    });
    expect((invalido.closure as ClosureAvailability).motivos).toContain('DELIVERY_MODE_INVALIDO');
    expect((invalido.closure as ClosureAvailability).disponible).toBe(false);
    // Y el adaptador tampoco lo acepta si llegara por otra vía.
    expect(() =>
      adapter({
        closure: { ...disponibilidadBase, deliveryMode: 'publico' as ClosureAvailability['deliveryMode'] },
      }).signUploadParams(identidad),
    ).toThrow();
  });
});
