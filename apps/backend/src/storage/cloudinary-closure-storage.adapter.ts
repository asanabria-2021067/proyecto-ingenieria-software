import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import {
  CLOSURE_DEFAULT_PREFIX,
  type ClosureAvailability,
} from '../config/environment.validation';
import { assertClosureAvailable } from './closure-ticket.service';
import {
  CLOSURE_DELIVERY_TYPES,
  CLOSURE_RESOURCE_TYPE,
  CLOSURE_STORAGE_EXTENSION,
  CLOSURE_STORAGE_PROVIDER,
  type ClosureAssetDescriptor,
  type ClosureDestroyOutcome,
  type ClosureRemoteIdentity,
  type ClosureSignedUploadParams,
  type ClosureDeliveryType,
  type ClosureStoragePort,
} from './closure-storage.port';

/**
 * C103/C106/C107 (06 v2 §26/§27/§39): adaptador Cloudinary del puerto de cierre.
 *
 * Resuelve credenciales y modalidad desde la configuración YA VALIDADA
 * (`closure` de `validateEnvironment`), nunca leyendo `process.env` por su
 * cuenta ni cargando el archivo de entorno por segunda vez. No conoce Prisma
 * ni ningún módulo de dominio: su única responsabilidad es hablar con el
 * proveedor.
 *
 * Esqueleto en C103: la construcción de identidad llega en C106, la
 * configuración y política de degradación en C107, y las cuatro operaciones
 * remotas en los commits que las contratan. Mientras tanto ninguna llamada
 * remota es posible.
 */
/** §27: el proveedor no puede retener una operación de cierre más de un minuto. */
export const CLOSURE_REMOTE_TIMEOUT_MS = 60_000;

@Injectable()
export class CloudinaryClosureStorageAdapter implements ClosureStoragePort {
  private readonly logger = new Logger(CloudinaryClosureStorageAdapter.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Disponibilidad derivada por el validador de entorno. Se relee en cada
   * consulta porque es una precondición de despliegue, no un estado que el
   * adaptador cachee: un despliegue sin secretos debe seguir respondiendo que
   * no está disponible después de arrancar.
   */
  protected availability(): ClosureAvailability {
    // Gate único: sin configuración válida ninguna operación remota empieza.
    return assertClosureAvailable(this.config.get<ClosureAvailability>('closure'));
  }

  /** Nombre de cuenta configurado; parte de toda identidad remota. */
  protected cloudName(): string {
    const { cloudName } = this.availability();
    if (!cloudName) {
      throw new ServiceUnavailableException('CLOUDINARY_CLOUD_NAME no está configurado');
    }
    return cloudName;
  }

  /** Identidad mínima común a las cuatro operaciones. */
  protected baseIdentity(publicId: string): ClosureRemoteIdentity {
    return {
      proveedor: CLOSURE_STORAGE_PROVIDER,
      cloudName: this.cloudName(),
      publicId,
      resourceType: CLOSURE_RESOURCE_TYPE,
      deliveryType: this.availability().deliveryMode,
    };
  }

  /**
   * Prefijo del namespace de cierre. Ausente usa el default CONGELADO;
   * presente debe coincidir exactamente con él. Aceptar otro namespace
   * permitiría que un despliegue mal configurado escribiera documentos de
   * cierre sobre los assets del resto del producto.
   */
  protected prefix(): string {
    const configurado = this.config.get<string>('CLOSURE_CLOUDINARY_PREFIX');
    if (configurado === undefined || configurado.trim().length === 0) {
      return CLOSURE_DEFAULT_PREFIX;
    }
    if (configurado.trim() !== CLOSURE_DEFAULT_PREFIX) {
      throw new ServiceUnavailableException(
        'CLOSURE_CLOUDINARY_PREFIX está fuera del namespace de cierre permitido',
      );
    }
    return CLOSURE_DEFAULT_PREFIX;
  }

  /**
   * Construye la identidad remota de un documento NUEVO.
   *
   * El identificador se compone del prefijo congelado, el proyecto y un UUID
   * v4 recién generado con el sufijo cifrado. Nada de lo que envía el usuario
   * entra aquí: ni el nombre del archivo ni una ruta, de modo que no existe
   * forma de apuntar a un objeto ajeno ni de escapar del namespace.
   *
   * Cada llamada produce un identificador DISTINTO. Tras un error de carga o
   * una purga se pide uno nuevo y jamás se reutiliza el anterior: reutilizarlo
   * llevaría un reintento sobre un objeto que otro intento ya tocó.
   */
  buildIdentity(projectId: number): ClosureRemoteIdentity {
    if (!Number.isSafeInteger(projectId) || projectId < 1) {
      throw new ServiceUnavailableException('El proyecto del documento de cierre no es válido');
    }
    return {
      ...this.baseIdentity(`${this.prefix()}/${projectId}/${randomUUID()}${CLOSURE_STORAGE_EXTENSION}`),
    };
  }


  /**
   * Modalidad de entrega. Es una decisión de CONFIGURACIÓN, jamás una
   * reacción a un error: mientras la primaria funcione se conserva, y ningún
   * fallo transitorio la degrada por su cuenta.
   */
  protected deliveryType(): ClosureDeliveryType {
    const { deliveryMode } = this.availability();
    if (!(CLOSURE_DELIVERY_TYPES as readonly string[]).includes(deliveryMode)) {
      throw new ServiceUnavailableException(
        'CLOSURE_CLOUDINARY_DELIVERY_MODE no es una modalidad de entrega admitida',
      );
    }
    return deliveryMode;
  }

  private credentials(): { apiKey: string; apiSecret: string } {
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET');
    if (!apiKey || !apiSecret) {
      throw new ServiceUnavailableException('Las credenciales del proveedor no están configuradas');
    }
    return { apiKey, apiSecret };
  }

  /**
   * Firma de servidor. Estos parámetros NUNCA llegan al navegador: el cliente
   * recibe un ticket de aplicación propio, no la firma del proveedor ni el
   * secreto que la produce.
   *
   * `overwrite` va congelado en `false`: una carga de cierre no reemplaza
   * nunca un objeto ya existente.
   */
  signUploadParams(identity: ClosureRemoteIdentity): ClosureSignedUploadParams {
    const { apiKey, apiSecret } = this.credentials();
    const timestamp = Math.floor(Date.now() / 1000);
    const type = this.deliveryType();
    const signature = cloudinary.utils.api_sign_request(
      { public_id: identity.publicId, timestamp, type, overwrite: false },
      apiSecret,
    );
    return { publicId: identity.publicId, timestamp, type, overwrite: false, signature, apiKey };
  }

  /**
   * Sube el ciphertext con la modalidad configurada y `overwrite=false`.
   *
   * Devolver sin excepción NO prueba que estos bytes hayan quedado
   * almacenados: con `overwrite=false` el proveedor puede responder con éxito
   * conservando un asset anterior. Por eso esta operación solo reporta lo que
   * el proveedor dijo, y la identidad se corrobora aparte antes de dar el
   * documento por disponible.
   */
  async uploadImmutable(
    identity: ClosureRemoteIdentity,
    ciphertext: Buffer,
    signedParams: ClosureSignedUploadParams,
  ): Promise<ClosureRemoteIdentity> {
    const type = this.deliveryType();
    const respuesta = await this.callProvider('carga', () =>
      this.uploadStream(ciphertext, {
        public_id: identity.publicId,
        resource_type: CLOSURE_RESOURCE_TYPE,
        type,
        overwrite: false,
        timestamp: signedParams.timestamp,
        signature: signedParams.signature,
        api_key: signedParams.apiKey,
        timeout: CLOSURE_REMOTE_TIMEOUT_MS,
      }),
    );

    return {
      ...identity,
      deliveryType: type,
      assetId: respuesta.asset_id ?? null,
      version: respuesta.version === undefined ? null : String(respuesta.version),
    };
  }

  private uploadStream(
    ciphertext: Buffer,
    options: Record<string, unknown>,
  ): Promise<UploadApiResponse> {
    return new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('El proveedor no devolvió un resultado de carga'));
          return;
        }
        resolve(result);
      });
      stream.end(ciphertext);
    });
  }

  /**
   * Traduce cualquier fallo del proveedor a indisponibilidad, SIN degradar la
   * modalidad y SIN filtrar el mensaje original, que puede contener la firma
   * o parte de las credenciales. Un timeout, un 401, una cuota agotada o un
   * error de red significan que el cierre no puede operar ahora, no que haya
   * que guardar el documento de otra manera.
   */
  private async callProvider<T>(operacion: string, ejecutar: () => Promise<T>): Promise<T> {
    try {
      return await ejecutar();
    } catch (error) {
      this.logger.warn(`Fallo del proveedor de almacenamiento durante la ${operacion}`);
      void error;
      throw new ServiceUnavailableException(
        `El almacenamiento de documentos de cierre no está disponible (${operacion})`,
      );
    }
  }

  async verifyAsset(_identity: ClosureRemoteIdentity): Promise<ClosureAssetDescriptor> {
    this.availability();
    throw new ServiceUnavailableException('La verificación remota todavía no está habilitada');
  }

  async readCiphertext(_identity: ClosureRemoteIdentity, _timeoutMs: number): Promise<Buffer> {
    this.availability();
    throw new ServiceUnavailableException('La lectura remota todavía no está habilitada');
  }

  async destroy(_identity: ClosureRemoteIdentity): Promise<ClosureDestroyOutcome> {
    this.availability();
    throw new ServiceUnavailableException('La destrucción remota todavía no está habilitada');
  }
}
