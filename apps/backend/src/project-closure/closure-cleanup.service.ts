import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { EstadoDocumentoCierre, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectTransactionService } from '../common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { BitacoraEventosService } from '../bitacora/bitacora-eventos.service';
import { TipoEventoBitacora } from '../bitacora/tipos-evento-bitacora';
import { CloudinaryClosureStorageAdapter } from '../storage/cloudinary-closure-storage.adapter';
import {
  CLOUDINARY_CLOSURE_PORT,
  type ClosureRemoteIdentity,
  type ClosureStoragePort,
} from '../storage/closure-storage.port';
import type { SweepDto } from './dto/closure.dto';

/**
 * C127 (06 v2 §27): barrido de documentos de cierre abandonados.
 *
 * Vive del lado de la BASE DE DATOS, no dentro del adaptador del proveedor:
 * decidir qué se purga es una regla de negocio con lock, y destruir el objeto
 * remoto es I/O que ocurre después del commit y fuera de toda transacción.
 *
 * Esqueleto en C127: reservar la purga y consumarla llegan con su contrato.
 */

export interface SweepReport {
  dryRun: boolean;
  candidatos: number[];
  purgados: number[];
  fallidos: number[];
  remotosSinFila: string[];
}

@Injectable()
export class ClosureCleanupService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly projectTx: ProjectTransactionService,
    protected readonly policy: ProjectPolicyService,
    protected readonly adapter: CloudinaryClosureStorageAdapter,
    @Inject(CLOUDINARY_CLOSURE_PORT) protected readonly storage: ClosureStoragePort,
    protected readonly audit: BitacoraEventosService,
  ) {}

  /** E120: informa qué se purgaría sin tocar nada. */
  async dryRun(actorId: number, dto: SweepDto): Promise<SweepReport> {
    const limit = this.limitOf(dto);
    await this.policy.assertAdminTx(this.prisma as unknown as Prisma.TransactionClient, actorId);
    const candidatos = await this.findCandidates(new Date(), limit);
    const remote = await this.adapter.listClosurePublicIds();
    const local = remote.length === 0 ? [] : await this.prisma.documentoCierre.findMany({
      where: { externalId: { in: remote } }, select: { externalId: true },
    });
    const known = new Set(local.map((row) => row.externalId));
    return { dryRun: true, candidatos: candidatos.map((row) => row.idDocumentoCierre), purgados: [], fallidos: [],
      remotosSinFila: remote.filter((publicId) => !known.has(publicId)) };
  }

  /** E120: reserva la purga bajo lock, destruye fuera de tx y confirma después. */
  async sweep(actorId: number, dto: SweepDto): Promise<SweepReport> {
    if (dto.dryRun !== false) return this.dryRun(actorId, dto);
    const limit = this.limitOf(dto);
    await this.policy.assertAdminTx(this.prisma as unknown as Prisma.TransactionClient, actorId);
    const now = new Date();
    const candidates = await this.findCandidates(now, limit);
    const reserved: number[] = [];
    for (const candidate of candidates) {
      const documentId = await this.reservePurge(candidate.idProyecto, candidate.idDocumentoCierre, actorId, now);
      if (documentId !== null) reserved.push(documentId);
    }
    const purgeable = await this.prisma.documentoCierre.findMany({
      where: { estadoDocumento: { in: [EstadoDocumentoCierre.PURGA_PENDIENTE, EstadoDocumentoCierre.PURGADO] } },
      orderBy: [{ idProyecto: 'asc' }, { idDocumentoCierre: 'asc' }],
      take: limit,
      select: { idDocumentoCierre: true, idProyecto: true, estadoDocumento: true, proveedor: true,
        externalId: true, resourceType: true, deliveryType: true, assetId: true, versionRemota: true },
    });
    const purgados: number[] = [];
    const fallidos: number[] = [];
    for (const document of purgeable) {
      const identity: ClosureRemoteIdentity = {
        proveedor: 'cloudinary', cloudName: this.adapter.cloudNameForIdentity(), publicId: document.externalId,
        resourceType: 'raw', deliveryType: document.deliveryType as ClosureRemoteIdentity['deliveryType'],
        assetId: document.assetId, version: document.versionRemota,
      };
      try {
        const outcome = await this.storage.destroy(identity);
        if (document.estadoDocumento === EstadoDocumentoCierre.PURGA_PENDIENTE) {
          const finalized = await this.finalizePurge(document.idProyecto, document.idDocumentoCierre, actorId, now, identity, outcome);
          if (finalized) purgados.push(document.idDocumentoCierre);
        } else {
          purgados.push(document.idDocumentoCierre);
        }
      } catch {
        fallidos.push(document.idDocumentoCierre);
      }
    }
    return { dryRun: false, candidatos: reserved, purgados, fallidos, remotosSinFila: [] };
  }

  protected async finalizePurge(
    projectId: number,
    documentId: number,
    actorId: number,
    now: Date,
    identity: ClosureRemoteIdentity,
    outcome: 'deleted' | 'absent',
  ): Promise<boolean> {
    return this.projectTx.run(projectId, actorId, 'closure-cleanup.finalize', async ({ tx }) => {
      await this.policy.assertAdminTx(tx, actorId);
      await tx.$queryRaw(Prisma.sql`
        SELECT id_documento_cierre FROM documento_cierre
        WHERE id_documento_cierre = ${documentId} AND id_proyecto = ${projectId}
        FOR UPDATE
      `);
      const document = await tx.documentoCierre.findFirst({
        where: { idDocumentoCierre: documentId, idProyecto: projectId },
        select: { estadoDocumento: true, purgaSolicitadaEn: true, _count: { select: { revisiones: true } },
          oficialDe: { select: { idRevisionCierre: true } } },
      });
      if (!document || document.estadoDocumento !== EstadoDocumentoCierre.PURGA_PENDIENTE ||
          document._count.revisiones !== 0 || document.oficialDe !== null) return false;
      const changed = await tx.documentoCierre.updateMany({
        where: { idDocumentoCierre: documentId, idProyecto: projectId,
          estadoDocumento: EstadoDocumentoCierre.PURGA_PENDIENTE, purgaSolicitadaEn: document.purgaSolicitadaEn },
        data: { estadoDocumento: EstadoDocumentoCierre.PURGADO, purgadoEn: now },
      });
      if (changed.count !== 1) return false;
      await this.audit.registrarEvento({
        tx, tipoEvento: TipoEventoBitacora.CLOSURE_STORAGE_SWEPT, idActor: actorId, idProyecto: projectId,
        tipoEntidad: 'DOCUMENTO_CIERRE', idEntidad: documentId,
        valorAnterior: { estadoDocumento: 'PURGA_PENDIENTE' },
        valorNuevo: { estadoDocumento: 'PURGADO', proveedor: identity.proveedor, externalId: identity.publicId,
          assetId: identity.assetId ?? null, version: identity.version ?? null, outcome },
      });
      return true;
    });
  }

  protected async reservePurge(
    projectId: number,
    documentId: number,
    actorId: number,
    now: Date,
  ): Promise<number | null> {
    return this.projectTx.run(projectId, actorId, 'closure-cleanup.reserve', async ({ tx }) => {
      await this.policy.assertAdminTx(tx, actorId);
      await tx.$queryRaw(Prisma.sql`
        SELECT id_documento_cierre FROM documento_cierre
        WHERE id_documento_cierre = ${documentId} AND id_proyecto = ${projectId}
        FOR UPDATE
      `);
      const document = await tx.documentoCierre.findFirst({
        where: { idDocumentoCierre: documentId, idProyecto: projectId },
        select: {
          idDocumentoCierre: true, estadoDocumento: true, creadoEn: true, reservaExpiraEn: true,
          cargaLimiteEn: true, disponibleEn: true, _count: { select: { revisiones: true } },
          oficialDe: { select: { idRevisionCierre: true } },
        },
      });
      if (!document || document._count.revisiones !== 0 || document.oficialDe !== null || !this.isExpired(document, now)) {
        return null;
      }
      const changed = await tx.documentoCierre.updateMany({
        where: { idDocumentoCierre: documentId, idProyecto: projectId, estadoDocumento: document.estadoDocumento },
        data: { estadoDocumento: EstadoDocumentoCierre.PURGA_PENDIENTE, purgaSolicitadaEn: now },
      });
      return changed.count === 1 ? documentId : null;
    });
  }

  private async findCandidates(now: Date, limit: number) {
    const availableBefore = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const expiredBefore = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    return this.prisma.documentoCierre.findMany({
      where: {
        revisiones: { none: {} },
        oficialDe: null,
        OR: [
          { estadoDocumento: EstadoDocumentoCierre.DISPONIBLE, disponibleEn: { lte: availableBefore } },
          { estadoDocumento: EstadoDocumentoCierre.RESERVADO, reservaExpiraEn: { lte: expiredBefore } },
          { estadoDocumento: EstadoDocumentoCierre.EN_CARGA, cargaLimiteEn: { lte: expiredBefore } },
        ],
      },
      orderBy: [{ idProyecto: 'asc' }, { idDocumentoCierre: 'asc' }],
      take: limit,
      select: { idDocumentoCierre: true, idProyecto: true },
    });
  }

  private isExpired(
    document: {
      estadoDocumento: EstadoDocumentoCierre;
      reservaExpiraEn: Date;
      cargaLimiteEn: Date | null;
      disponibleEn: Date | null;
      creadoEn: Date;
    },
    now: Date,
  ): boolean {
    if (document.estadoDocumento === EstadoDocumentoCierre.DISPONIBLE) {
      return (document.disponibleEn ?? document.creadoEn).getTime() <= now.getTime() - 30 * 24 * 60 * 60 * 1000;
    }
    const deadline = document.estadoDocumento === EstadoDocumentoCierre.RESERVADO
      ? document.reservaExpiraEn
      : document.estadoDocumento === EstadoDocumentoCierre.EN_CARGA ? document.cargaLimiteEn : null;
    return deadline !== null && deadline.getTime() <= now.getTime() - 2 * 60 * 60 * 1000;
  }

  private limitOf(dto: SweepDto): number {
    const limit = dto.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('limit debe ser un entero entre 1 y 100');
    }
    return limit;
  }
}
