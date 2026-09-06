import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import {
  buildClosureAad,
  ClosureCryptoService,
  CLOSURE_CRYPTO_FORMAT,
  CLOSURE_DEK_BYTES,
  CLOSURE_IV_BYTES,
  CLOSURE_TAG_BYTES,
  sha256Hex,
  CLOSURE_CRYPTO_KEY_UNAVAILABLE,
  type ClosureAadContext,
  type ClosureCryptoMetadata,
} from '../src/storage/closure-crypto.service';

/**
 * C104+ (06 v2 §27/§28/§47 T40): informe canónico y criptografía de cierre.
 * Todo el material de clave es SINTÉTICO y se genera aquí; ninguna prueba
 * lee un secreto real ni toca el proveedor.
 */

/** KEKs de fixture: 32 bytes deterministas, nunca un secreto de despliegue. */
function fixtureKek(seed: number): string {
  return Buffer.alloc(CLOSURE_DEK_BYTES, seed).toString('base64');
}

function cryptoService(keks: Record<string, string>, activeKeyId: string): ClosureCryptoService {
  const valores: Record<string, unknown> = {
    CLOSURE_KEKS: JSON.stringify(keks),
    CLOSURE_ACTIVE_KEY_ID: activeKeyId,
  };
  const config = { get: (clave: string) => valores[clave] } as unknown as ConfigService;
  return new ClosureCryptoService(config);
}

const contextoBase: ClosureAadContext = {
  projectId: 41,
  documentId: 900,
  publicId: 'uvgenius/cierre/41/0b6f0f2c-6a1a-4f0e-9d1a-3f0f7f1c9a11.enc',
  tipoDocumento: 'INFORME_AUTOMATICO',
};

describe('S7 informe canónico y criptografía de cierre', () => {
  it('T40-D: cada documento usa una DEK distinta y un tag manipulado falla antes de emitir bytes', () => {
    const service = cryptoService({ k1: fixtureKek(1) }, 'k1');
    const primero = Buffer.from('%PDF-1.7\nprimer documento sintético de cierre\n%%EOF\n', 'utf8');
    const segundo = Buffer.from('%PDF-1.7\nsegundo documento sintético de cierre\n%%EOF\n', 'utf8');
    const contextoSegundo: ClosureAadContext = { ...contextoBase, documentId: 901 };

    const cifradoPrimero = service.encrypt(primero, contextoBase);
    const cifradoSegundo = service.encrypt(segundo, contextoSegundo);
    const repetido = service.encrypt(primero, contextoBase);

    // Una DEK por documento y por ejecución: nunca se reutiliza.
    expect(cifradoPrimero.dek).toHaveLength(CLOSURE_DEK_BYTES);
    expect(cifradoPrimero.dek.equals(cifradoSegundo.dek)).toBe(false);
    expect(cifradoPrimero.dek.equals(repetido.dek)).toBe(false);
    expect(cifradoPrimero.iv.equals(repetido.iv)).toBe(false);

    // El ciphertext mide EXACTAMENTE lo mismo que el plaintext: IV y tag van
    // aparte y no se anteponen al objeto.
    expect(cifradoPrimero.format).toBe(CLOSURE_CRYPTO_FORMAT);
    expect(cifradoPrimero.ciphertext).toHaveLength(primero.length);
    expect(cifradoPrimero.tamanoCifradoBytes).toBe(primero.length);
    expect(cifradoPrimero.iv).toHaveLength(CLOSURE_IV_BYTES);
    expect(cifradoPrimero.tag).toHaveLength(CLOSURE_TAG_BYTES);
    expect(cifradoPrimero.ciphertext.subarray(0, CLOSURE_IV_BYTES).equals(cifradoPrimero.iv)).toBe(false);
    expect(cifradoPrimero.ciphertext.includes(cifradoPrimero.tag)).toBe(false);
    // Y no se parece al original: el objeto remoto no delata su contenido.
    expect(cifradoPrimero.ciphertext.equals(primero)).toBe(false);
    expect(cifradoPrimero.ciphertext.subarray(0, 5).toString('utf8')).not.toBe('%PDF-');

    // Lectura correcta: bytes idénticos, huella y tamaño verificados.
    const descifrado = service.decrypt(
      cifradoPrimero.ciphertext,
      cifradoPrimero,
      contextoBase,
      { checksumSha256: cifradoPrimero.checksumSha256, tamanoBytes: cifradoPrimero.tamanoBytes },
    );
    expect(descifrado.equals(primero)).toBe(true);
    expect(sha256Hex(descifrado)).toBe(cifradoPrimero.checksumSha256);
    expect(descifrado).toHaveLength(cifradoPrimero.tamanoBytes);

    // Cuatro manipulaciones, cuatro fallos SIN devolver un solo byte.
    const tagAlterado = Buffer.from(cifradoPrimero.tag);
    tagAlterado[0] ^= 0xff;
    const ivAlterado = Buffer.from(cifradoPrimero.iv);
    ivAlterado[0] ^= 0xff;
    const aadAjeno: ClosureAadContext = { ...contextoBase, documentId: 999 };

    const manipulaciones: Array<[string, () => Buffer]> = [
      ['tag alterado', () => service.decrypt(cifradoPrimero.ciphertext, { ...cifradoPrimero, tag: tagAlterado }, contextoBase)],
      ['IV alterado', () => service.decrypt(cifradoPrimero.ciphertext, { ...cifradoPrimero, iv: ivAlterado }, contextoBase)],
      ['AAD de otro documento', () => service.decrypt(cifradoPrimero.ciphertext, cifradoPrimero, aadAjeno)],
      ['ciphertext truncado', () => service.decrypt(cifradoPrimero.ciphertext.subarray(0, cifradoPrimero.ciphertext.length - 3), cifradoPrimero, contextoBase)],
    ];
    for (const [caso, ejecutar] of manipulaciones) {
      let emitido: Buffer | undefined;
      let fallo: unknown;
      try {
        emitido = ejecutar();
      } catch (error) {
        fallo = error;
      }
      expect(emitido, `${caso} devolvió bytes`).toBeUndefined();
      expect(fallo, `${caso} no falló`).toBeInstanceOf(Error);
      // El error no revela material de clave ni contenido.
      const mensaje = (fallo as Error).message;
      expect(mensaje).not.toContain(cifradoPrimero.dek.toString('base64'));
      expect(mensaje).not.toContain(cifradoPrimero.dek.toString('hex'));
      expect(mensaje).not.toContain(cifradoPrimero.tag.toString('base64'));
      expect(mensaje).not.toContain(cifradoPrimero.iv.toString('base64'));
      expect(mensaje).not.toContain('%PDF');
    }

    // El AAD es canónico y explícito: mismo contexto, mismos bytes.
    expect(buildClosureAad(contextoBase).equals(buildClosureAad({ ...contextoBase }))).toBe(true);
    expect(buildClosureAad(contextoBase).toString('utf8')).toBe(
      `{"v":1,"projectId":41,"documentId":900,"publicId":${JSON.stringify(contextoBase.publicId)},"tipoDocumento":"INFORME_AUTOMATICO"}`,
    );

    // El segundo documento sigue siendo legible con su propio material.
    expect(
      service.decrypt(cifradoSegundo.ciphertext, cifradoSegundo, contextoSegundo).equals(segundo),
    ).toBe(true);
  });

  it('T40-E: la DEK se envuelve con la KEK activa y la rotación conserva la lectura de documentos anteriores', () => {
    const k1 = fixtureKek(11);
    const k2 = fixtureKek(22);
    const primero = Buffer.from('%PDF-1.7\ninforme sellado con la primera clave\n%%EOF\n', 'utf8');
    const segundo = Buffer.from('%PDF-1.7\ninforme sellado tras la rotación\n%%EOF\n', 'utf8');
    const contextoSegundo: ClosureAadContext = { ...contextoBase, documentId: 901 };

    // Antes de rotar: la clave activa es k1.
    const conK1 = cryptoService({ k1 }, 'k1');
    const selladoPrimero = conK1.seal(primero, contextoBase);

    // La metadata contiene EXACTAMENTE los siete campos del schema cerrado.
    expect(Object.keys(selladoPrimero.metadata).sort()).toEqual(
      ['format', 'iv', 'keyId', 'tag', 'wrapIv', 'wrapTag', 'wrappedDek'].sort(),
    );
    expect(selladoPrimero.metadata.format).toBe(CLOSURE_CRYPTO_FORMAT);
    expect(selladoPrimero.metadata.keyId).toBe('k1');
    // base64 canónico con las longitudes del contrato.
    const longitudes: Array<[keyof ClosureCryptoMetadata, number]> = [
      ['wrappedDek', CLOSURE_DEK_BYTES],
      ['wrapIv', CLOSURE_IV_BYTES],
      ['wrapTag', CLOSURE_TAG_BYTES],
      ['iv', CLOSURE_IV_BYTES],
      ['tag', CLOSURE_TAG_BYTES],
    ];
    for (const [campo, bytes] of longitudes) {
      const valor = selladoPrimero.metadata[campo] as string;
      const decodificado = Buffer.from(valor, 'base64');
      expect(decodificado, `${campo} no mide ${bytes} bytes`).toHaveLength(bytes);
      expect(decodificado.toString('base64'), `${campo} no es base64 canónico`).toBe(valor);
    }
    // Ninguna clave en claro viaja en la metadata.
    const serializada = JSON.stringify(selladoPrimero.metadata);
    expect(serializada).not.toContain(k1);
    expect(serializada).not.toContain(Buffer.from(k1, 'base64').toString('hex'));

    expect(conK1.open(selladoPrimero.ciphertext, selladoPrimero.metadata, contextoBase).equals(primero)).toBe(true);

    // Rotación: k2 pasa a ser la activa y k1 se CONSERVA.
    const rotado = cryptoService({ k1, k2 }, 'k2');
    const selladoSegundo = rotado.seal(segundo, contextoSegundo);
    expect(selladoSegundo.metadata.keyId).toBe('k2');
    // Ambos documentos siguen leyéndose, cada uno con su propia clave.
    expect(
      rotado.open(selladoPrimero.ciphertext, selladoPrimero.metadata, contextoBase, {
        checksumSha256: selladoPrimero.checksumSha256,
        tamanoBytes: selladoPrimero.tamanoBytes,
      }).equals(primero),
    ).toBe(true);
    expect(
      rotado.open(selladoSegundo.ciphertext, selladoSegundo.metadata, contextoSegundo).equals(segundo),
    ).toBe(true);

    // Retirar k1 vuelve ilegible el primero: error explícito, sin material y
    // sin tocar la metadata, que sigue intacta para un futuro rescate.
    const antes = JSON.stringify(selladoPrimero.metadata);
    const sinK1 = cryptoService({ k2 }, 'k2');
    let fallo: unknown;
    let emitido: Buffer | undefined;
    try {
      emitido = sinK1.open(selladoPrimero.ciphertext, selladoPrimero.metadata, contextoBase);
    } catch (error) {
      fallo = error;
    }
    expect(emitido).toBeUndefined();
    expect((fallo as Error).message).toBe(CLOSURE_CRYPTO_KEY_UNAVAILABLE);
    expect((fallo as Error).message).not.toContain(k1);
    expect(JSON.stringify(selladoPrimero.metadata)).toBe(antes);
    // El documento nuevo sí se lee: perder una clave antigua no rompe el resto.
    expect(
      sinK1.open(selladoSegundo.ciphertext, selladoSegundo.metadata, contextoSegundo).equals(segundo),
    ).toBe(true);

    // El servicio no borra nada: no existe ninguna operación de purga aquí.
    const operaciones = Object.getOwnPropertyNames(Object.getPrototypeOf(sinK1));
    expect(operaciones.some((nombre) => /delete|purg|destroy|borrar/i.test(nombre))).toBe(false);
  });
});
