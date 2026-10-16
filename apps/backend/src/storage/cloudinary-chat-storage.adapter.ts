import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import type { ChatStoragePort } from './chat-storage.port';

// Todo viaja como raw + authenticated: nada es publico por URL adivinable.
const OPTS = { resource_type: 'raw', type: 'authenticated' } as const;

@Injectable()
export class CloudinaryChatStorageAdapter implements ChatStoragePort {
  private readonly logger = new Logger(CloudinaryChatStorageAdapter.name);

  constructor(private readonly config: ConfigService) {}

  /** Falla con un error claro solo al usar el almacenamiento, no al arrancar. */
  private configure() {
    const cloud_name = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const api_key = this.config.get<string>('CLOUDINARY_API_KEY');
    const api_secret = this.config.get<string>('CLOUDINARY_API_SECRET');
    if (!cloud_name || !api_key || !api_secret) {
      throw new ServiceUnavailableException(
        'El almacenamiento de archivos no está configurado (faltan credenciales de Cloudinary)',
      );
    }
    cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  }

  async upload(key: string, data: Buffer): Promise<void> {
    this.configure();
    try {
      await new Promise<void>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { ...OPTS, public_id: key, overwrite: false, timeout: 60_000 },
          (error, result) => (error || !result ? reject(error ?? new Error('sin resultado')) : resolve()),
        );
        stream.end(data);
      });
    } catch {
      this.logger.warn('Fallo la carga de un adjunto de chat al proveedor');
      throw new ServiceUnavailableException('No se pudo guardar el archivo, intenta de nuevo');
    }
  }

  signedUrl(key: string, ttlSeconds: number): Promise<string> {
    this.configure();
    return Promise.resolve(
      cloudinary.utils.private_download_url(key, '', {
        ...OPTS,
        expires_at: Math.floor(Date.now() / 1000) + ttlSeconds,
      }),
    );
  }

  async destroy(key: string): Promise<void> {
    this.configure();
    try {
      await cloudinary.uploader.destroy(key, { ...OPTS, invalidate: true });
    } catch {
      this.logger.warn('No se pudo limpiar un adjunto de chat huerfano');
    }
  }
}
