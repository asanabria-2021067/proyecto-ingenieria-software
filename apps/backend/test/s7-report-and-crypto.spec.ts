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
  type ClosureAadContext,
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
});
