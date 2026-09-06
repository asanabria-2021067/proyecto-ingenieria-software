import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * C104 (06 v2 §27): cifrado autenticado de los documentos de cierre.
 *
 * Todo documento almacenado por el backend viaja CIFRADO al proveedor. No
 * existe una ruta que suba texto claro: la protección del objeto remoto es
 * criptográfica, no la entropía de su URL ni la modalidad de entrega.
 *
 * Usa exclusivamente primitivas de `node:crypto`. No se implementa
 * criptografía propia ni se añade ninguna dependencia: AES-256-GCM en la
 * biblioteca estándar cubre el contrato completo.
 */

/** Formato fijo; viaja en la metadata para que una lectura futura sepa qué esperar. */
export const CLOSURE_CRYPTO_FORMAT = 'aes-256-gcm-v1' as const;

export const CLOSURE_DEK_BYTES = 32;
export const CLOSURE_IV_BYTES = 12;
export const CLOSURE_TAG_BYTES = 16;

/**
 * Datos autenticados adicionales. Ligan el ciphertext a SU documento: mover
 * el objeto a otro proyecto, otro documento, otro publicId u otro tipo hace
 * que la autenticación falle, aunque la clave sea correcta.
 */
export interface ClosureAadContext {
  projectId: number;
  documentId: number;
  publicId: string;
  tipoDocumento: string;
}

/** Material por documento; la DEK nunca se persiste tal cual (§27, envuelta en C105). */
export interface ClosureCipherMaterial {
  dek: Buffer;
  iv: Buffer;
  tag: Buffer;
}

export interface ClosureEncryptionResult extends ClosureCipherMaterial {
  format: typeof CLOSURE_CRYPTO_FORMAT;
  ciphertext: Buffer;
  /** SHA-256 y tamaño del PLAINTEXT: lo que una lectura debe reproducir. */
  checksumSha256: string;
  tamanoBytes: number;
  /** SHA-256 y tamaño del CIPHERTEXT: lo que el proveedor debe conservar. */
  checksumCifradoSha256: string;
  tamanoCifradoBytes: number;
}

/** Comprobaciones de integridad que una lectura exige además del tag. */
export interface ClosurePlaintextExpectation {
  checksumSha256: string;
  tamanoBytes: number;
}

/**
 * Mensajes fijos. Un error de cifrado NUNCA incluye claves, IVs, tags ni
 * fragmentos de contenido: quien lo lea aprende que la autenticación falló y
 * nada más.
 */
export const CLOSURE_CRYPTO_AUTH_FAILED = 'El documento cifrado no superó la verificación de autenticidad';
export const CLOSURE_CRYPTO_CHECKSUM_FAILED = 'El documento descifrado no coincide con su huella registrada';

export function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * AAD canónico UTF-8. El orden de los campos es EXPLÍCITO y no depende del
 * orden de inserción de un objeto de JavaScript: dos procesos distintos deben
 * producir exactamente los mismos bytes o el documento se vuelve ilegible.
 */
export function buildClosureAad(context: ClosureAadContext): Buffer {
  const canonical =
    `{"v":1,` +
    `"projectId":${context.projectId},` +
    `"documentId":${context.documentId},` +
    `"publicId":${JSON.stringify(context.publicId)},` +
    `"tipoDocumento":${JSON.stringify(context.tipoDocumento)}}`;
  return Buffer.from(canonical, 'utf8');
}

@Injectable()
export class ClosureCryptoService {
  constructor(private readonly config: ConfigService) {}

  /**
   * Cifra el documento con una DEK ALEATORIA propia. Cada documento —y cada
   * ejecución— usa una clave distinta: comprometer un documento no
   * compromete al siguiente.
   *
   * El IV y el tag se devuelven APARTE y nunca se anteponen al ciphertext,
   * de modo que el objeto remoto mide exactamente lo mismo que el PDF y no
   * contiene ninguna cabecera reconocible.
   */
  encrypt(plaintext: Buffer, context: ClosureAadContext): ClosureEncryptionResult {
    if (plaintext.length === 0) {
      throw new BadRequestException('No se cifra un documento vacío');
    }
    const dek = randomBytes(CLOSURE_DEK_BYTES);
    const iv = randomBytes(CLOSURE_IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', dek, iv, { authTagLength: CLOSURE_TAG_BYTES });
    cipher.setAAD(buildClosureAad(context));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      format: CLOSURE_CRYPTO_FORMAT,
      ciphertext,
      dek,
      iv,
      tag,
      checksumSha256: sha256Hex(plaintext),
      tamanoBytes: plaintext.length,
      checksumCifradoSha256: sha256Hex(ciphertext),
      tamanoCifradoBytes: ciphertext.length,
    };
  }

  /**
   * Descifra y AUTENTICA antes de emitir un solo byte.
   *
   * En GCM la autenticidad no queda confirmada hasta `final()`, así que el
   * plaintext se retiene completo hasta ese momento: servir bytes a medida
   * que se descifran entregaría contenido manipulado a quien lo pidió. Solo
   * después se comprueban la huella y el tamaño originales.
   */
  decrypt(
    ciphertext: Buffer,
    material: ClosureCipherMaterial,
    context: ClosureAadContext,
    expectation?: ClosurePlaintextExpectation,
  ): Buffer {
    if (
      material.dek.length !== CLOSURE_DEK_BYTES ||
      material.iv.length !== CLOSURE_IV_BYTES ||
      material.tag.length !== CLOSURE_TAG_BYTES
    ) {
      throw new BadRequestException(CLOSURE_CRYPTO_AUTH_FAILED);
    }

    let plaintext: Buffer;
    try {
      const decipher = createDecipheriv('aes-256-gcm', material.dek, material.iv, {
        authTagLength: CLOSURE_TAG_BYTES,
      });
      decipher.setAAD(buildClosureAad(context));
      decipher.setAuthTag(material.tag);
      // `final()` es la única señal de autenticidad; nada se emite antes.
      plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      // El error original puede describir el estado interno del cifrador; se
      // sustituye por un mensaje fijo.
      throw new BadRequestException(CLOSURE_CRYPTO_AUTH_FAILED);
    }

    if (expectation) {
      const checksum = Buffer.from(sha256Hex(plaintext), 'hex');
      const esperado = Buffer.from(expectation.checksumSha256, 'hex');
      if (
        plaintext.length !== expectation.tamanoBytes ||
        checksum.length !== esperado.length ||
        !timingSafeEqual(checksum, esperado)
      ) {
        throw new BadRequestException(CLOSURE_CRYPTO_CHECKSUM_FAILED);
      }
    }

    return plaintext;
  }
}
