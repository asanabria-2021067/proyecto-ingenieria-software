import { Module } from '@nestjs/common';
import { CloudinaryClosureStorageAdapter } from './cloudinary-closure-storage.adapter';
import { CLOUDINARY_CLOSURE_PORT } from './closure-storage.port';

/**
 * C103 (06 v2 §38/§39): módulo de almacenamiento de cierre.
 *
 * NO importa ningún módulo de dominio ni Prisma: el storage es una
 * dependencia del cierre, nunca al revés, y esa dirección es la que evita que
 * el SDK del proveedor se filtre hacia la lógica de negocio. La configuración
 * llega por el `ConfigModule` global de `AppModule`.
 *
 * NO se registra todavía en `AppModule`: en C103 ninguna ruta ni proveedor de
 * dominio puede alcanzar el adaptador.
 */
@Module({
  providers: [
    CloudinaryClosureStorageAdapter,
    { provide: CLOUDINARY_CLOSURE_PORT, useExisting: CloudinaryClosureStorageAdapter },
  ],
  exports: [CLOUDINARY_CLOSURE_PORT, CloudinaryClosureStorageAdapter],
})
export class StorageModule {}
