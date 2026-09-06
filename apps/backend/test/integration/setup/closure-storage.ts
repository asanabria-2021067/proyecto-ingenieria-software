import { vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
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
import { ClosurePdfValidationService } from '../../../src/storage/closure-pdf-validation.service';
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

export function closureDocumentsStack(
  db: PrismaClient,
  config: ConfigService = closureConfig(),
  pdfValidation: ClosurePdfValidationService = new ClosurePdfValidationService(),
) {
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
    pdfValidation,
    storage,
    audit,
  );
  return { service, tickets, crypto, adapter, storage, audit, runner, policy, pdfValidation };
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

/**
 * PDF REAL construido con la misma librería que valida las cargas. No es un
 * texto con la firma pegada: el validador lo parsea de verdad.
 */
export async function pdfFixture(paginas = 1): Promise<Buffer> {
  const documento = await PDFDocument.create();
  for (let indice = 0; indice < paginas; indice += 1) {
    documento.addPage([595.28, 841.89]).drawText(`Evidencia sintética ${indice + 1}`, {
      x: 40,
      y: 780,
      size: 12,
    });
  }
  return Buffer.from(await documento.save());
}

/**
 * PDF válido de un tamaño EXACTO. El relleno va en un comentario después del
 * fin de archivo, que el parser ignora: el documento sigue siendo legible y
 * su longitud es la pedida.
 */
/**
 * PDF marcado como CIFRADO POR EL USUARIO. El diccionario `/Encrypt` del
 * trailer apunta a un objeto real, que es lo que hace que un lector lo
 * reconozca como protegido; el resto del documento queda intacto para que el
 * rechazo se deba al cifrado y no a un archivo roto.
 */
export async function pdfCifradoPorElUsuario(): Promise<Buffer> {
  const documento = await PDFDocument.create();
  documento.addPage();
  const texto = Buffer.from(await documento.save({ useObjectStreams: false })).toString('latin1');
  const inicioTrailer = texto.lastIndexOf('trailer');
  const conEncrypt =
    texto.slice(0, inicioTrailer) +
    texto.slice(inicioTrailer).replace('/Info 3 0 R', '/Info 3 0 R\n/Encrypt 3 0 R');
  return Buffer.from(conEncrypt, 'latin1');
}

/**
 * PDF estructuralmente válido pero con CERO páginas. Un documento sin
 * páginas no es evidencia de nada, así que el contrato lo rechaza aunque
 * parsee sin errores.
 */
export function pdfSinPaginas(): Buffer {
  const cuerpo =
    '%PDF-1.7\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
    '2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n';
  const xref =
    'xref\n0 3\n0000000000 65535 f \n0000000009 00000 n \n0000000063 00000 n \n' +
    `trailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n${cuerpo.length}\n%%EOF\n`;
  return Buffer.from(cuerpo + xref, 'latin1');
}

export async function pdfDeTamanoExacto(bytes: number): Promise<Buffer> {
  const base = await pdfFixture();
  if (bytes < base.length + 2) {
    throw new Error(`No se puede construir un PDF válido de ${bytes} bytes`);
  }
  const relleno = Buffer.alloc(bytes - base.length - 1, 0x20);
  return Buffer.concat([base, Buffer.from('%', 'latin1'), relleno]);
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
