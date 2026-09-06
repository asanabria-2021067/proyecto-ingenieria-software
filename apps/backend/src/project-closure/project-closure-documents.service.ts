import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EstadoDocumentoCierre, Prisma, TipoDocumentoCierre } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import {
  ProjectTransactionService,
  type ProjectLockRow,
  type ProjectTransactionContext,
} from '../common/project-policy/project-transaction.service';
import { BitacoraEventosService } from '../bitacora/bitacora-eventos.service';
import { TipoEventoBitacora } from '../bitacora/tipos-evento-bitacora';
import {
  ClosureCryptoService,
  sha256Hex,
  type ClosureCryptoMetadata,
} from '../storage/closure-crypto.service';
import { ClosureTicketService } from '../storage/closure-ticket.service';
import {
  ASSET_NO_COINCIDE,
  CLOSURE_REMOTE_TIMEOUT_MS,
  CloudinaryClosureStorageAdapter,
} from '../storage/cloudinary-closure-storage.adapter';
import {
  CLOUDINARY_CLOSURE_PORT,
  type ClosureRemoteIdentity,
  type ClosureStoragePort,
} from '../storage/closure-storage.port';
import { ReserveDocumentDto } from './dto/reserve-document.dto';
import type { UploadGrant } from './dto/upload-grant.dto';

/**
 * C113/C114 (06 v2 §25/§26/§27): carga mediada de documentos de cierre.
 *
 * La secuencia es deliberada: una transacción BREVE reserva, el trabajo caro
 * —hash, cifrado y transferencia— ocurre FUERA de cualquier lock, y una
 * segunda transacción breve confirma. Mantener el proyecto bloqueado mientras
 * viajan diez megabytes por la red dejaría el proyecto inoperante para todos
 * durante la subida de una sola persona.
 */

/** §26/§28: límite absoluto y exacto de un documento de cierre. */
export const MAX_DOCUMENT_SIZE = 10_485_760;
/** §26: margen de framing multipart sobre el límite del archivo. */
export const MULTIPART_OVERHEAD_BYTES = 65_536;
/** §25: reservas de evidencia vivas por actor y revisión. */
export const MAX_OPEN_EVIDENCE_RESERVATIONS = 2;

export const DOCUMENTO_DEMASIADO_GRANDE = 'DOCUMENTO_DEMASIADO_GRANDE';
export const RESERVA_NO_DISPONIBLE = 'RESERVA_NO_DISPONIBLE';

export interface ClosureDocumentPublic {
  idDocumentoCierre: number;
  idProyecto: number;
  idRevisionOrigen: number;
  tipoDocumento: TipoDocumentoCierre;
  estadoDocumento: EstadoDocumentoCierre;
  nombreArchivo: string;
  tamanoBytes: number | null;
  checksumSha256: string | null;
  externalId: string;
  deliveryType: string;
  assetId: string | null;
  versionRemota: string | null;
  disponibleEn: Date | null;
}

const DOCUMENTO_SELECT = {
  idDocumentoCierre: true,
  idProyecto: true,
  idRevisionOrigen: true,
  tipoDocumento: true,
  estadoDocumento: true,
  nombreArchivo: true,
  tamanoBytes: true,
  checksumSha256: true,
  externalId: true,
  deliveryType: true,
  assetId: true,
  versionRemota: true,
  disponibleEn: true,
  idAutor: true,
  resourceType: true,
  proveedor: true,
  reservaExpiraEn: true,
} satisfies Prisma.DocumentoCierreSelect;

type DocumentoRow = Prisma.DocumentoCierreGetPayload<{ select: typeof DOCUMENTO_SELECT }>;

function mapDocumento(row: DocumentoRow): ClosureDocumentPublic {
  return {
    idDocumentoCierre: row.idDocumentoCierre,
    idProyecto: row.idProyecto,
    idRevisionOrigen: row.idRevisionOrigen,
    tipoDocumento: row.tipoDocumento,
    estadoDocumento: row.estadoDocumento,
    nombreArchivo: row.nombreArchivo,
    tamanoBytes: row.tamanoBytes === null ? null : Number(row.tamanoBytes),
    checksumSha256: row.checksumSha256,
    externalId: row.externalId,
    deliveryType: row.deliveryType,
    assetId: row.assetId,
    versionRemota: row.versionRemota,
    disponibleEn: row.disponibleEn,
  };
}

@Injectable()
export class ProjectClosureDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectTx: ProjectTransactionService,
    private readonly policy: ProjectPolicyService,
    private readonly tickets: ClosureTicketService,
    private readonly crypto: ClosureCryptoService,
    private readonly adapter: CloudinaryClosureStorageAdapter,
    @Inject(CLOUDINARY_CLOSURE_PORT) private readonly storage: ClosureStoragePort,
    private readonly bitacoraEventos: BitacoraEventosService,
  ) {}

  private lockedProject(ctx: Pick<ProjectTransactionContext, 'project'>): ProjectLockRow {
    if (!ctx.project) {
      throw new NotFoundException('Proyecto no encontrado');
    }
    return ctx.project;
  }

  /** El borrador debe existir, pertenecer al proyecto y seguir en BORRADOR. */
  private async assertDraftTx(
    tx: Prisma.TransactionClient,
    projectId: number,
    revisionId: number,
  ): Promise<{ idRevisionCierre: number }> {
    const revision = await tx.revisionCierreProyecto.findFirst({
      where: { idRevisionCierre: revisionId, idProyecto: projectId },
      select: { idRevisionCierre: true, estadoRevision: true },
    });
    if (!revision) {
      throw new NotFoundException(
        `Revisión de cierre con id ${revisionId} no encontrada en el proyecto ${projectId}`,
      );
    }
    if (revision.estadoRevision !== 'BORRADOR') {
      throw new ConflictException('La revisión de cierre ya no admite documentos');
    }
    return { idRevisionCierre: revision.idRevisionCierre };
  }

  /**
   * E106: reserva la fila ANTES de cualquier I/O y devuelve el permiso de
   * carga. Que exista fila antes de subir es lo que impide dejar objetos
   * remotos huérfanos sin registro que los pueda limpiar.
   */
  async reserve(projectId: number, actorId: number, dto: ReserveDocumentDto): Promise<UploadGrant> {
    // Gate de configuración antes de reservar, firmar o subir.
    this.tickets.assertAvailable();
    const identidad = this.adapter.buildIdentity(projectId);

    const documento = await this.projectTx.run(
      projectId,
      actorId,
      'closure-documents.reserve',
      async (ctx) => {
        const { tx } = ctx;
        await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'CIERRE_EVIDENCIAS', actorId);
        await this.assertDraftTx(tx, projectId, dto.revisionId);

        // §25: dos reservas vivas por actor y revisión. Sin cuota, un cliente
        // que reintenta acumularía identidades remotas que nadie usará.
        const abiertas = await tx.documentoCierre.count({
          where: {
            idRevisionOrigen: dto.revisionId,
            idAutor: actorId,
            tipoDocumento: TipoDocumentoCierre.EVIDENCIA_LIDER,
            estadoDocumento: { in: [EstadoDocumentoCierre.RESERVADO, EstadoDocumentoCierre.EN_CARGA] },
            reservaExpiraEn: { gt: new Date() },
          },
        });
        if (abiertas >= MAX_OPEN_EVIDENCE_RESERVATIONS) {
          throw new ConflictException({
            statusCode: 409,
            code: RESERVA_NO_DISPONIBLE,
            message: 'Ya tienes el máximo de reservas de evidencia abiertas en esta revisión',
          });
        }

        return tx.documentoCierre.create({
          data: {
            idProyecto: projectId,
            idRevisionOrigen: dto.revisionId,
            tipoDocumento: TipoDocumentoCierre.EVIDENCIA_LIDER,
            proveedor: identidad.proveedor,
            externalId: identidad.publicId,
            resourceType: identidad.resourceType,
            deliveryType: identidad.deliveryType,
            nombreArchivo: dto.nombreArchivo,
            idAutor: actorId,
            reservaExpiraEn: new Date(Date.now() + 600_000),
          },
          select: DOCUMENTO_SELECT,
        });
      },
    );

    const { ticket, expiraEn } = this.tickets.sign({
      purpose: 'upload',
      documentId: documento.idDocumentoCierre,
      projectId,
      revisionId: dto.revisionId,
      actorId,
    });

    return {
      documentId: documento.idDocumentoCierre,
      uploadUrl: `/proyectos/${projectId}/cierre/documentos`,
      ticket,
      expiraEn,
      maxBytes: MAX_DOCUMENT_SIZE,
    };
  }

  /**
   * E107: recibe `{ticket,file}`, valida, cifra y sube.
   *
   * Orden exacto de §26: verificar → limitar bytes → parsear → cifrar (todo
   * sin lock) → tx breve `RESERVADO→EN_CARGA` → subir → tx breve
   * `→DISPONIBLE` + vínculo. Mientras los bytes viajan no hay ninguna
   * transacción abierta.
   */
  async uploadAndAttach(
    projectId: number,
    actorId: number,
    ticket: string,
    file: Buffer,
  ): Promise<ClosureDocumentPublic> {
    this.tickets.assertAvailable();
    const payload = this.tickets.verify(ticket, { purpose: 'upload', projectId });
    if (!Buffer.isBuffer(file) || file.length === 0) {
      throw new BadRequestException('No se recibió el archivo del documento');
    }
    if (file.length > MAX_DOCUMENT_SIZE) {
      throw new PayloadTooLargeException({
        statusCode: 413,
        code: DOCUMENTO_DEMASIADO_GRANDE,
        message: 'El documento supera el tamaño máximo permitido',
      });
    }
    // Un nombre o un Content-Type no prueban que esto sea un PDF; la firma sí
    // es una condición necesaria. La validación estructural completa vive en
    // su propio contrato.
    if (file.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new UnprocessableEntityException('El documento no es un PDF válido');
    }

    const documentoPrevio = await this.prisma.documentoCierre.findFirst({
      where: { idDocumentoCierre: payload.documentId, idProyecto: projectId },
      select: DOCUMENTO_SELECT,
    });
    if (!documentoPrevio) {
      throw new NotFoundException(`Documento de cierre ${payload.documentId} no encontrado`);
    }
    // Reintento sobre un documento ya vinculado. Al MISMO actor se le
    // devuelve el resultado existente sin volver a subir un solo byte; a
    // cualquier otro se le responde conflicto: el ticket ya se consumió y su
    // resultado pertenece a quien lo consumió.
    if (documentoPrevio.estadoDocumento === EstadoDocumentoCierre.DISPONIBLE) {
      if (documentoPrevio.idAutor !== actorId) {
        throw new ConflictException({
          statusCode: 409,
          code: RESERVA_NO_DISPONIBLE,
          message: 'La reserva de este documento ya fue consumida por su autor',
        });
      }
      return mapDocumento(documentoPrevio);
    }
    if (payload.actorId !== actorId) {
      throw new ForbiddenException('El ticket pertenece a otro usuario');
    }

    // Cifrado y hashes FUERA de cualquier transacción.
    const sellado = this.crypto.seal(file, {
      projectId,
      documentId: documentoPrevio.idDocumentoCierre,
      publicId: documentoPrevio.externalId,
      tipoDocumento: documentoPrevio.tipoDocumento,
    });

    // Tx breve 1: consumo del ticket por CAS.
    await this.projectTx.run(projectId, actorId, 'closure-documents.begin-upload', async (ctx) => {
      const { tx } = ctx;
      await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'CIERRE_EVIDENCIAS', actorId);
      await this.assertDraftTx(tx, projectId, payload.revisionId);
      const consumido = await tx.documentoCierre.updateMany({
        where: {
          idDocumentoCierre: payload.documentId,
          estadoDocumento: EstadoDocumentoCierre.RESERVADO,
        },
        data: {
          estadoDocumento: EstadoDocumentoCierre.EN_CARGA,
          cargaIniciadaEn: new Date(),
          cargaLimiteEn: new Date(Date.now() + 7_200_000),
          tamanoBytes: BigInt(sellado.tamanoBytes),
          checksumSha256: sellado.checksumSha256,
          tamanoCifradoBytes: BigInt(sellado.tamanoCifradoBytes),
          checksumCifradoSha256: sellado.checksumCifradoSha256,
          cryptoMetadata: sellado.metadata as unknown as Prisma.InputJsonValue,
        },
      });
      // El ticket es de un solo uso: la reserva ya consumida es un conflicto.
      if (consumido.count !== 1) {
        throw new ConflictException({
          statusCode: 409,
          code: RESERVA_NO_DISPONIBLE,
          message: 'La reserva de este documento ya fue consumida',
        });
      }
    });

    // I/O externo: sin transacción abierta y sin lock retenido.
    const identidad: ClosureRemoteIdentity = {
      proveedor: 'cloudinary',
      cloudName: this.adapter.cloudNameForIdentity(),
      publicId: documentoPrevio.externalId,
      resourceType: 'raw',
      deliveryType: documentoPrevio.deliveryType as ClosureRemoteIdentity['deliveryType'],
    };
    const firmados = this.adapter.signUploadParams(identidad);
    const confirmada = await this.storage.uploadImmutable(identidad, sellado.ciphertext, firmados);
    await this.verifyRemote(identidad, confirmada, {
      checksumCifradoSha256: sellado.checksumCifradoSha256,
      tamanoCifradoBytes: sellado.tamanoCifradoBytes,
    });

    // Tx breve 2: revalidar y vincular.
    return this.projectTx.run(projectId, actorId, 'closure-documents.finish-upload', async (ctx) => {
      const { tx } = ctx;
      await this.policy.assertWriteTx(tx, this.lockedProject(ctx), 'CIERRE_EVIDENCIAS', actorId);
      const revision = await this.assertDraftTx(tx, projectId, payload.revisionId);

      const disponible = await tx.documentoCierre.updateMany({
        where: {
          idDocumentoCierre: payload.documentId,
          estadoDocumento: EstadoDocumentoCierre.EN_CARGA,
        },
        data: {
          estadoDocumento: EstadoDocumentoCierre.DISPONIBLE,
          disponibleEn: new Date(),
          assetId: confirmada.assetId ?? null,
          versionRemota: confirmada.version ?? null,
        },
      });
      if (disponible.count !== 1) {
        throw new ConflictException({
          statusCode: 409,
          code: RESERVA_NO_DISPONIBLE,
          message: 'La carga de este documento ya fue resuelta',
        });
      }

      const siguienteOrden = await tx.documentoRevisionCierre.count({
        where: { idRevisionCierre: revision.idRevisionCierre },
      });
      await tx.documentoRevisionCierre.create({
        data: {
          idRevisionCierre: revision.idRevisionCierre,
          idDocumentoCierre: payload.documentId,
          orden: siguienteOrden,
        },
      });

      const fila = await tx.documentoCierre.findUniqueOrThrow({
        where: { idDocumentoCierre: payload.documentId },
        select: DOCUMENTO_SELECT,
      });

      await this.bitacoraEventos.registrarEvento({
        tx,
        tipoEvento: TipoEventoBitacora.CLOSURE_DOCUMENT_ADDED,
        idActor: actorId,
        idProyecto: projectId,
        tipoEntidad: 'DOCUMENTO_CIERRE',
        idEntidad: payload.documentId,
        valorAnterior: null,
        // Nunca claves ni ciphertext: solo identidad y medidas.
        valorNuevo: {
          idRevisionCierre: revision.idRevisionCierre,
          orden: siguienteOrden,
          externalId: fila.externalId,
          tamanoBytes: Number(fila.tamanoBytes ?? 0),
          checksumSha256: fila.checksumSha256,
        },
      });

      return mapDocumento(fila);
    });
  }

  /**
   * Verificación remota completa (§27).
   *
   * Un HTTP 200 NO prueba que los bytes enviados se hayan almacenado: con
   * `overwrite=false` el proveedor puede responder éxito devolviendo el asset
   * anterior. Por eso se compara la identidad contra la reserva, se cruzan
   * assetId y version con la API de recursos y, decisivamente, se DESCARGA el
   * objeto para comparar su longitud y su SHA-256 con el ciphertext local.
   *
   * Ante cualquier discrepancia se responde 409 y se detiene: no se reintenta
   * con `overwrite=true`, no se reutiliza el publicId y no se destruye el
   * objeto para forzar la carga. Todo esto ocurre FUERA de transacción.
   */
  protected async verifyRemote(
    reserva: ClosureRemoteIdentity,
    confirmada: ClosureRemoteIdentity,
    esperado: { checksumCifradoSha256: string; tamanoCifradoBytes: number },
  ): Promise<void> {
    const conflicto = (detalle: string): never => {
      throw new ConflictException({
        statusCode: 409,
        code: ASSET_NO_COINCIDE,
        message: `El objeto remoto no corresponde al documento reservado (${detalle})`,
      });
    };

    if (
      confirmada.publicId !== reserva.publicId ||
      confirmada.resourceType !== reserva.resourceType ||
      confirmada.deliveryType !== reserva.deliveryType
    ) {
      conflicto('identidad');
    }

    const descriptor = await this.storage.verifyAsset(confirmada);
    if (
      descriptor.publicId !== reserva.publicId ||
      descriptor.resourceType !== reserva.resourceType ||
      descriptor.deliveryType !== reserva.deliveryType ||
      descriptor.bytes !== esperado.tamanoCifradoBytes
    ) {
      conflicto('metadatos');
    }
    // El cruce entre la respuesta de carga y la de recursos: si el proveedor
    // conservó un asset anterior, aquí deja de coincidir.
    if (
      (confirmada.assetId ?? '') !== descriptor.assetId ||
      (confirmada.version ?? '') !== descriptor.version
    ) {
      conflicto('identificador de asset');
    }

    // Prueba decisiva: los bytes reales que quedaron guardados. Un recurso
    // preexistente con contenido distinto —aunque mida lo mismo— falla aquí.
    const remoto = await this.storage.readCiphertext(confirmada, CLOSURE_REMOTE_TIMEOUT_MS);
    if (
      remoto.length !== esperado.tamanoCifradoBytes ||
      sha256Hex(remoto) !== esperado.checksumCifradoSha256
    ) {
      conflicto('contenido');
    }
    // `etag` nunca se interpreta como el SHA-256 del PDF ni se persiste: su
    // única función es cruzar las dos respuestas del proveedor.
  }

  /** Metadata pública del documento; nunca metadata criptográfica. */
  async findOne(projectId: number, documentId: number): Promise<ClosureDocumentPublic> {
    const fila = await this.prisma.documentoCierre.findFirst({
      where: { idDocumentoCierre: documentId, idProyecto: projectId },
      select: DOCUMENTO_SELECT,
    });
    if (!fila) {
      throw new NotFoundException(`Documento de cierre ${documentId} no encontrado`);
    }
    return mapDocumento(fila);
  }

  /** Metadata criptográfica tipada; solo la usan las rutas del backend. */
  protected cryptoMetadataOf(row: { cryptoMetadata: unknown }): ClosureCryptoMetadata {
    return row.cryptoMetadata as ClosureCryptoMetadata;
  }
}
