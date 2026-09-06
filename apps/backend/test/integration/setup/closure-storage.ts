import { vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { BitacoraEventosService } from '../../../src/bitacora/bitacora-eventos.service';
import { ProjectTransactionService } from '../../../src/common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../../../src/common/project-policy/project-policy.service';
import { ProjectIdResolverService } from '../../../src/common/project-policy/project-id-resolver.service';
import { ClosureTicketService } from '../../../src/storage/closure-ticket.service';
import { ClosureCryptoService } from '../../../src/storage/closure-crypto.service';
import { CloudinaryClosureStorageAdapter } from '../../../src/storage/cloudinary-closure-storage.adapter';
import type {
  ClosureAssetDescriptor,
  ClosureRemoteIdentity,
  ClosureStoragePort,
} from '../../../src/storage/closure-storage.port';
import { ProjectClosureDocumentsService } from '../../../src/project-closure/project-closure-documents.service';
import type { ClosureAvailability } from '../../../src/config/environment.validation';
import * as fixtures from './fixtures';
import { cleanupIntegrationFixtures, type IntegrationCleanupScope } from './cleanup';

/**
 * C113+ (06 v2 §26/§27/§47 T30): pila real de documentos de cierre sobre
 * PostgreSQL con el ALMACENAMIENTO MOCKEADO. Los secretos son sintéticos y
 * ninguna llamada sale del proceso: lo que se prueba es el protocolo de
 * reserva, ticket, cifrado y vínculo, no la capacidad del proveedor.
 */

/** KEK y HMAC sintéticos: nunca un secreto de despliegue. */
export const KEK_FIXTURE = Buffer.alloc(32, 3).toString('base64');
export const HMAC_FIXTURE = Buffer.alloc(32, 7).toString('base64');

export const disponibilidadFixture: ClosureAvailability = {
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

export function closureConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const valores: Record<string, unknown> = {
    closure: disponibilidadFixture,
    CLOUDINARY_API_KEY: '123456789012345',
    CLOUDINARY_API_SECRET: 'secreto-sintetico-de-prueba',
    CLOSURE_KEKS: JSON.stringify({ k1: KEK_FIXTURE }),
    CLOSURE_ACTIVE_KEY_ID: 'k1',
    CLOSURE_TICKET_HMAC_SECRET: HMAC_FIXTURE,
    ...overrides,
  };
  return { get: (clave: string) => valores[clave] } as unknown as ConfigService;
}

/** Puerto de almacenamiento programable; ninguna llamada sale del proceso. */
export interface StoragePortDouble extends ClosureStoragePort {
  uploadImmutable: ReturnType<typeof vi.fn>;
  verifyAsset: ReturnType<typeof vi.fn>;
  readCiphertext: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
}

export function storagePortDouble(): StoragePortDouble {
  const almacen = new Map<string, Buffer>();
  const descriptores = new Map<string, ClosureAssetDescriptor>();
  const port = {
    uploadImmutable: vi.fn(async (identity: ClosureRemoteIdentity, ciphertext: Buffer) => {
      almacen.set(identity.publicId, Buffer.from(ciphertext));
      const descriptor: ClosureAssetDescriptor = {
        assetId: `asset-${identity.publicId.slice(-8)}`,
        publicId: identity.publicId,
        resourceType: identity.resourceType,
        deliveryType: identity.deliveryType,
        version: '1',
        bytes: ciphertext.length,
        etag: 'etag-sintetico',
      };
      descriptores.set(identity.publicId, descriptor);
      return { ...identity, assetId: descriptor.assetId, version: descriptor.version };
    }),
    verifyAsset: vi.fn(async (identity: ClosureRemoteIdentity) => {
      const descriptor = descriptores.get(identity.publicId);
      if (!descriptor) {
        throw new Error('asset ausente en el doble de almacenamiento');
      }
      return descriptor;
    }),
    readCiphertext: vi.fn(async (identity: ClosureRemoteIdentity) => {
      const bytes = almacen.get(identity.publicId);
      if (!bytes) {
        throw new Error('objeto ausente en el doble de almacenamiento');
      }
      return bytes;
    }),
    destroy: vi.fn(async (identity: ClosureRemoteIdentity) => {
      const existia = almacen.delete(identity.publicId);
      descriptores.delete(identity.publicId);
      return existia ? ('deleted' as const) : ('absent' as const);
    }),
  };
  return port as unknown as StoragePortDouble;
}

export function closureDocumentsStack(db: PrismaClient, config: ConfigService = closureConfig()) {
  const prisma = db as unknown as PrismaService;
  const runner = new ProjectTransactionService(prisma);
  const policy = new ProjectPolicyService(new ProjectIdResolverService(prisma));
  const tickets = new ClosureTicketService(config);
  const crypto = new ClosureCryptoService(config);
  const adapter = new CloudinaryClosureStorageAdapter(config);
  const storage = storagePortDouble();
  const audit = new BitacoraEventosService();
  const service = new ProjectClosureDocumentsService(
    prisma,
    runner,
    policy,
    tickets,
    crypto,
    adapter,
    storage,
    audit,
  );
  return { service, tickets, crypto, adapter, storage, audit, runner, policy };
}

export interface ClosureCleanupScope extends IntegrationCleanupScope {
  revisionIds?: number[];
  documentIds?: number[];
}

/** Proyecto EN_PROGRESO con su borrador de cierre y el líder autenticado. */
export async function closureDraftFixture(db: PrismaClient, scope: ClosureCleanupScope) {
  const leader = await fixtures.createIntegrationUser(db);
  const otro = await fixtures.createIntegrationUser(db);
  scope.userIds = [...(scope.userIds ?? []), leader.idUsuario, otro.idUsuario];
  const project = await fixtures.createIntegrationProject(db, leader.idUsuario, {
    estadoProyecto: 'EN_PROGRESO',
  });
  scope.projectIds = [...(scope.projectIds ?? []), project.idProyecto];
  const revision = await db.revisionCierreProyecto.create({
    data: {
      idProyecto: project.idProyecto,
      numeroRevision: 1,
      // CK18: un BORRADOR aún no tiene solicitante, envío, huella ni revisor.
      estadoRevision: 'BORRADOR',
    },
  });
  scope.revisionIds = [...(scope.revisionIds ?? []), revision.idRevisionCierre];
  return { leader, otro, project, revision };
}

/** PDF sintético mínimo pero real: firma, un objeto y su fin de archivo. */
export function pdfFixture(relleno = 64): Buffer {
  const cuerpo = `%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n${'%'.repeat(relleno)}\n%%EOF\n`;
  return Buffer.from(cuerpo, 'latin1');
}

export async function cleanupClosureFixture(
  db: PrismaClient,
  scope: ClosureCleanupScope,
): Promise<void> {
  await db.bitacoraAuditoria.deleteMany({ where: { idUsuario: { in: scope.userIds ?? [] } } });
  await db.documentoRevisionCierre.deleteMany({
    where: { idRevisionCierre: { in: scope.revisionIds ?? [] } },
  });
  await db.revisionCierreProyecto.updateMany({
    where: { idRevisionCierre: { in: scope.revisionIds ?? [] } },
    data: { idDocumentoOficial: null },
  });
  await db.documentoCierre.deleteMany({ where: { idProyecto: { in: scope.projectIds ?? [] } } });
  await db.revisionCierreProyecto.deleteMany({
    where: { idRevisionCierre: { in: scope.revisionIds ?? [] } },
  });
  await cleanupIntegrationFixtures(db, scope);
}
