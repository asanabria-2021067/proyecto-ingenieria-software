import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * C104/C105 (06 v2 §27): cifrado autenticado de los documentos de cierre.
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


/**
 * Schema CERRADO de `cryptoMetadata` (§35). Es lo ÚNICO que se persiste del
 * material criptográfico: la DEK viaja envuelta y ninguna clave en claro toca
 * la base de datos, el proveedor, el navegador ni un log.
 */
export interface ClosureCryptoMetadata {
  format: typeof CLOSURE_CRYPTO_FORMAT;
  /** Identificador de la KEK, no la KEK: rotar cambia este valor, no la historia. */
  keyId: string;
  wrappedDek: string;
  wrapIv: string;
  wrapTag: string;
  iv: string;
  tag: string;
}

export interface ClosureSealedDocument {
  ciphertext: Buffer;
  metadata: ClosureCryptoMetadata;
  checksumSha256: string;
  tamanoBytes: number;
  checksumCifradoSha256: string;
  tamanoCifradoBytes: number;
}

/** Una KEK retirada deja documentos ilegibles; nunca los borra. */
export const CLOSURE_CRYPTO_KEY_UNAVAILABLE =
  'La clave de cifrado del documento no está disponible en la configuración actual';
export const CLOSURE_CRYPTO_NO_ACTIVE_KEY =
  'No hay una clave de cifrado activa configurada para documentos de cierre';

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


/** AAD de la envoltura: liga la DEK a su documento y a la clave que la protege. */
export function buildClosureWrapAad(documentId: number, keyId: string): Buffer {
  return Buffer.from(`{"v":1,"documentId":${documentId},"keyId":${JSON.stringify(keyId)}}`, 'utf8');
}

/** Decodifica base64 exigiendo la longitud del contrato; cualquier otra cosa es material inválido. */
function decodeBase64(value: string, expectedBytes: number): Buffer {
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length !== expectedBytes || bytes.toString('base64') !== value) {
    throw new BadRequestException(CLOSURE_CRYPTO_AUTH_FAILED);
  }
  return bytes;
}

@Injectable()
export class ClosureCryptoService {
  constructor(private readonly config: ConfigService) {}

  /**
   * Cifra y ENVUELVE en una sola operación: la salida ya es persistible.
   *
   * La envoltura es una segunda operación AES-256-GCM con la KEK activa y su
   * propio AAD `{v:1,documentId,keyId}`, de modo que una DEK envuelta no puede
   * reutilizarse para otro documento ni bajo otra clave.
   */
  seal(plaintext: Buffer, context: ClosureAadContext): ClosureSealedDocument {
    const cifrado = this.encrypt(plaintext, context);
    const { keyId, kek } = this.activeKek();
    const iv = randomBytes(CLOSURE_IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', kek, iv, { authTagLength: CLOSURE_TAG_BYTES });
    cipher.setAAD(buildClosureWrapAad(context.documentId, keyId));
    const wrappedDek = Buffer.concat([cipher.update(cifrado.dek), cipher.final()]);

    return {
      ciphertext: cifrado.ciphertext,
      metadata: {
        format: CLOSURE_CRYPTO_FORMAT,
        keyId,
        wrappedDek: wrappedDek.toString('base64'),
        wrapIv: iv.toString('base64'),
        wrapTag: cipher.getAuthTag().toString('base64'),
        iv: cifrado.iv.toString('base64'),
        tag: cifrado.tag.toString('base64'),
      },
      checksumSha256: cifrado.checksumSha256,
      tamanoBytes: cifrado.tamanoBytes,
      checksumCifradoSha256: cifrado.checksumCifradoSha256,
      tamanoCifradoBytes: cifrado.tamanoCifradoBytes,
    };
  }

  /**
   * Desenvuelve con la KEK que indica la metadata —no con la activa— y
   * descifra. Por eso una rotación no invalida lo anterior: cada documento
   * recuerda con qué clave se selló, y conservar las claves antiguas basta
   * para seguir leyéndolo.
   */
  open(
    ciphertext: Buffer,
    metadata: ClosureCryptoMetadata,
    context: ClosureAadContext,
    expectation?: ClosurePlaintextExpectation,
  ): Buffer {
    const dek = this.unwrapDek(metadata, context.documentId);
    return this.decrypt(
      ciphertext,
      {
        dek,
        iv: decodeBase64(metadata.iv, CLOSURE_IV_BYTES),
        tag: decodeBase64(metadata.tag, CLOSURE_TAG_BYTES),
      },
      context,
      expectation,
    );
  }

  /** KEK activa; su ausencia es indisponibilidad de configuración, no un error del usuario. */
  private activeKek(): { keyId: string; kek: Buffer } {
    const keks = this.keks();
    const keyId = this.config.get<string>('CLOSURE_ACTIVE_KEY_ID');
    const kek = keyId === undefined ? undefined : keks.get(keyId);
    if (keyId === undefined || kek === undefined) {
      throw new ServiceUnavailableException(CLOSURE_CRYPTO_NO_ACTIVE_KEY);
    }
    return { keyId, kek };
  }

  /**
   * Las KEKs se releen en cada operación en vez de cachearse: una rotación
   * debe observarse sin reiniciar, y guardarlas en memoria del servicio sería
   * una copia más del material que hay que proteger.
   */
  private keks(): Map<string, Buffer> {
    const raw = this.config.get<string>('CLOSURE_KEKS');
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      return new Map();
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return new Map();
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return new Map();
    }
    const keys = new Map<string, Buffer>();
    for (const [keyId, material] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof material !== 'string') {
        continue;
      }
      const bytes = Buffer.from(material, 'base64');
      if (bytes.length === CLOSURE_DEK_BYTES) {
        keys.set(keyId, bytes);
      }
    }
    return keys;
  }

  private unwrapDek(metadata: ClosureCryptoMetadata, documentId: number): Buffer {
    if (metadata.format !== CLOSURE_CRYPTO_FORMAT) {
      throw new BadRequestException(CLOSURE_CRYPTO_AUTH_FAILED);
    }
    const kek = this.keks().get(metadata.keyId);
    if (kek === undefined) {
      // Explícito y sin material: quien lo lea sabe que falta una clave, no
      // cuál es. Ninguna fila se toca por esto.
      throw new ServiceUnavailableException(CLOSURE_CRYPTO_KEY_UNAVAILABLE);
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        kek,
        decodeBase64(metadata.wrapIv, CLOSURE_IV_BYTES),
        { authTagLength: CLOSURE_TAG_BYTES },
      );
      decipher.setAAD(buildClosureWrapAad(documentId, metadata.keyId));
      decipher.setAuthTag(decodeBase64(metadata.wrapTag, CLOSURE_TAG_BYTES));
      return Buffer.concat([
        decipher.update(decodeBase64(metadata.wrappedDek, CLOSURE_DEK_BYTES)),
        decipher.final(),
      ]);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      throw new BadRequestException(CLOSURE_CRYPTO_AUTH_FAILED);
    }
  }

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
