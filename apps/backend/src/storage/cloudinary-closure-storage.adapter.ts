import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import {
  CLOSURE_DEFAULT_PREFIX,
  type ClosureAvailability,
} from '../config/environment.validation';
import {
  CLOSURE_RESOURCE_TYPE,
  CLOSURE_STORAGE_EXTENSION,
  CLOSURE_STORAGE_PROVIDER,
  type ClosureAssetDescriptor,
  type ClosureDestroyOutcome,
  type ClosureRemoteIdentity,
  type ClosureSignedUploadParams,
  type ClosureStoragePort,
} from './closure-storage.port';

/**
 * C103/C106 (06 v2 §26/§27/§39): adaptador Cloudinary del puerto de cierre.
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
    const closure = this.config.get<ClosureAvailability>('closure');
    if (!closure) {
      throw new ServiceUnavailableException('La configuración de cierre no está disponible');
    }
    return closure;
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


  uploadImmutable(
    _identity: ClosureRemoteIdentity,
    _ciphertext: Buffer,
    _signedParams: ClosureSignedUploadParams,
  ): Promise<ClosureRemoteIdentity> {
    return Promise.reject(new ServiceUnavailableException('La carga remota todavía no está habilitada'));
  }

  verifyAsset(_identity: ClosureRemoteIdentity): Promise<ClosureAssetDescriptor> {
    return Promise.reject(
      new ServiceUnavailableException('La verificación remota todavía no está habilitada'),
    );
  }

  readCiphertext(_identity: ClosureRemoteIdentity, _timeoutMs: number): Promise<Buffer> {
    return Promise.reject(
      new ServiceUnavailableException('La lectura remota todavía no está habilitada'),
    );
  }

  destroy(_identity: ClosureRemoteIdentity): Promise<ClosureDestroyOutcome> {
    return Promise.reject(
      new ServiceUnavailableException('La destrucción remota todavía no está habilitada'),
    );
  }
}
