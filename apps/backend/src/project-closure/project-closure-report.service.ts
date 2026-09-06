import {
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  buildReportContext,
  computeExecutionFingerprint,
  computeModelFingerprint,
  projectClosureModel,
  type ClosureReportContext,
  type ClosureReportModelV1,
} from './closure-report-model';
import { captureClosureExecution } from './closure-execution-capture';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectTransactionService } from '../common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { BitacoraEventosService } from '../bitacora/bitacora-eventos.service';
import { TipoEventoBitacora } from '../bitacora/tipos-evento-bitacora';
import {
  DOCUMENTO_DEMASIADO_GRANDE,
  MAX_DOCUMENT_SIZE,
  ProjectClosureDocumentsService,
} from './project-closure-documents.service';
import {
  CLOSURE_GENERATOR_VERSION,
  ProjectCloseReadinessService,
  type ClosureBlockerCode,
} from './project-close-readiness.service';

/**
 * C111 (06 v2 §28): render del informe de cierre en el proceso de Node.
 *
 * Todo ocurre DENTRO del backend: no hay navegador, ni headless, ni una sola
 * petición de red durante el render. La fuente Unicode se carga del asset
 * versionado del repositorio, de modo que un nombre con acentos o en otro
 * alfabeto se dibuja igual en cualquier despliegue y sin depender de que una
 * CDN responda.
 *
 * El render es una función del MODELO CANÓNICO: no vuelve a consultar nada y
 * no decide qué mostrar. Ajustar la representación o la paginación no puede
 * omitir una contribución, porque las filas provienen del modelo completo.
 */

/** Nombre lógico de la fuente embebida dentro del PDF. */
export const CLOSURE_REPORT_FONT = 'NotoSans';
const FONT_FILE = 'NotoSans-Regular.ttf';
const ASSETS_DIR = join(__dirname, 'assets');

/** A4 en puntos, la unidad con la que se construye el documento. */
export const A4_WIDTH_PT = 595.28;
export const A4_HEIGHT_PT = 841.89;

const CONTRIBUCION_HEADER = [
  'Tarea',
  'Estado',
  'Integrante',
  'Origen',
  'Reportadas',
  'Ajuste',
  'Eliminada',
] as const;

export interface ClosureRenderSummary {
  paginas: number;
  filasContribucion: number;
  /** Encabezado dibujado en CADA página de la tabla; su repetición es el contrato. */
  encabezadoPorPagina: string[][];
  fechaGeneracion: string;
  /** Texto tal como se entregó al documento, para verificar que nada se sustituyó. */
  textosRenderizados: string[];
}

export interface ClosureRenderResult {
  pdf: Buffer;
  resumen: ClosureRenderSummary;
}

interface FilaContribucion {
  idAsignacion: number;
  tarea: string;
  estado: string;
  integrante: string;
  origen: string;
  reportadas: string;
  ajuste: string;
  eliminada: boolean;
}

/**
 * §28: la generación NO exige los tres bloqueos documentales, porque está
 * produciendo justamente el documento que uno de ellos reclama. Los tres
 * vuelven a ser obligatorios al enviar.
 */
export const CODIGOS_EXCLUIDOS_AL_GENERAR: ClosureBlockerCode[] = [
  'INFORME_INVALIDO',
  'EVIDENCIAS_INVALIDAS',
  'INFORME_DESACTUALIZADO',
];

export interface GeneratedReport {
  documentId: number;
  revisionId: number;
  fingerprintEjecucion: string;
  fingerprintModelo: string;
  /** Vínculo sustituido, si había uno anterior en el slot cero. */
  documentoSustituido: number | null;
}

@Injectable()
export class ProjectClosureReportService {
  private fuenteBase64: string | null = null;

  constructor(
    protected readonly prisma?: PrismaService,
    protected readonly projectTx?: ProjectTransactionService,
    protected readonly policy?: ProjectPolicyService,
    protected readonly readiness?: ProjectCloseReadinessService,
    protected readonly documents?: ProjectClosureDocumentsService,
    protected readonly bitacoraEventos?: BitacoraEventosService,
  ) {}

  /** La fuente se lee del disco una vez por proceso; nunca de una URL. */
  private fontBase64(): string {
    if (this.fuenteBase64 === null) {
      this.fuenteBase64 = readFileSync(join(ASSETS_DIR, FONT_FILE)).toString('base64');
    }
    return this.fuenteBase64;
  }

  /**
   * Aplana el modelo en filas de contribución. Las tareas ELIMINADAS aportan
   * sus tramos igual que las vivas: su trabajo existió y el informe de cierre
   * es justamente donde no puede desaparecer.
   */
  private filasDeContribucion(modelo: ClosureReportModelV1): FilaContribucion[] {
    const nombrePorUsuario = new Map<number, string>();
    for (const participacion of modelo.participaciones) {
      const fila = participacion as { idUsuario: number; nombreRol: string };
      if (!nombrePorUsuario.has(fila.idUsuario)) {
        nombrePorUsuario.set(fila.idUsuario, fila.nombreRol);
      }
    }

    const filas: FilaContribucion[] = [];
    for (const tareaBruta of modelo.tareas) {
      const tarea = tareaBruta as unknown as {
        tituloTarea: string;
        estadoTarea: string;
        eliminada: boolean;
        tramos: Array<{
          idAsignacion: number;
          idUsuario: number;
          origenReporte: string;
          horasReportadas: string | null;
          ajustes: Array<{ deltaHoras: string | null; anuladoEn: string | null }>;
        }>;
      };
      for (const tramo of tarea.tramos) {
        const vigente = tramo.ajustes.find((ajuste) => ajuste.anuladoEn === null);
        filas.push({
          idAsignacion: tramo.idAsignacion,
          tarea: tarea.tituloTarea,
          estado: tarea.estadoTarea,
          integrante: nombrePorUsuario.get(tramo.idUsuario) ?? `Usuario ${tramo.idUsuario}`,
          origen: tramo.origenReporte,
          reportadas: tramo.horasReportadas ?? '0.00',
          ajuste: vigente?.deltaHoras ?? '—',
          eliminada: tarea.eliminada,
        });
      }
    }
    return filas;
  }

  /**
   * Renderiza el informe. `contexto.fechaGeneracion` es la ÚNICA fecha que se
   * escribe en los metadatos: usar `now()` haría que dos renders del mismo
   * modelo difirieran por el momento en que se ejecutaron.
   */
  render(modelo: ClosureReportModelV1, contexto: ClosureReportContext): ClosureRenderResult {
    const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
    doc.addFileToVFS(FONT_FILE, this.fontBase64());
    doc.addFont(FONT_FILE, CLOSURE_REPORT_FONT, 'normal');
    doc.setFont(CLOSURE_REPORT_FONT, 'normal');

    const proyecto = modelo.proyecto as { tituloProyecto: string; idProyecto: number };
    const lider = modelo.lider as { nombre: string; apellido: string };
    const totales = modelo.totales as { horasReportadas: string; horasPropuestas: string };
    const textosRenderizados: string[] = [];
    const escribir = (texto: string, x: number, y: number, tamano: number) => {
      doc.setFontSize(tamano);
      doc.text(texto, x, y);
      textosRenderizados.push(texto);
    };

    escribir(`Informe de cierre — ${proyecto.tituloProyecto}`, 40, 56, 16);
    escribir(`Líder: ${lider.nombre} ${lider.apellido}`, 40, 78, 11);
    escribir(`Horas reportadas: ${totales.horasReportadas}`, 40, 94, 11);
    escribir(`Horas propuestas: ${totales.horasPropuestas}`, 40, 110, 11);
    escribir(`Variante: ${contexto.variante}`, 40, 126, 11);

    const filas = this.filasDeContribucion(modelo);
    const encabezadoPorPagina: string[][] = [];

    autoTable(doc, {
      startY: 146,
      head: [[...CONTRIBUCION_HEADER]],
      body: filas.map((fila) => [
        fila.tarea,
        fila.estado,
        fila.integrante,
        fila.origen,
        fila.reportadas,
        fila.ajuste,
        fila.eliminada ? 'Sí' : 'No',
      ]),
      styles: { font: CLOSURE_REPORT_FONT, fontSize: 8 },
      headStyles: { font: CLOSURE_REPORT_FONT, fontStyle: 'normal' },
      // La cabecera se repite en cada página: una tabla de cierre partida sin
      // encabezado deja de ser legible como evidencia.
      showHead: 'everyPage',
      margin: { top: 40, bottom: 40, left: 40, right: 40 },
      didDrawPage: (data) => {
        const cabecera = (data.table.head[0]?.cells ?? {}) as Record<string, { text: string[] }>;
        encabezadoPorPagina.push(Object.values(cabecera).map((celda) => celda.text.join(' ')));
      },
    });

    for (const fila of filas) {
      textosRenderizados.push(fila.tarea, fila.integrante);
    }

    // Metadatos con la fecha FIJA del contexto de generación.
    const fecha = new Date(contexto.fechaGeneracion);
    doc.setProperties({
      title: `Informe de cierre ${proyecto.idProyecto}`,
      subject: contexto.variante,
      creator: 'UVGenius',
      author: `${lider.nombre} ${lider.apellido}`,
    });
    doc.setCreationDate(fecha);

    return {
      pdf: Buffer.from(doc.output('arraybuffer')),
      resumen: {
        paginas: doc.getNumberOfPages(),
        filasContribucion: filas.length,
        encabezadoPorPagina,
        fechaGeneracion: contexto.fechaGeneracion,
        textosRenderizados,
      },
    };
  }

  /**
   * §28/§40: captura canónica bajo el `tx` del caller. Devuelve el modelo, sus
   * dos huellas y el contexto de presentación, todo derivado de UNA lectura
   * coherente: si cada consumidor capturara por su cuenta, dos huellas del
   * mismo instante podrían diferir.
   */
  async buildModelTx(
    tx: Prisma.TransactionClient,
    projectId: number,
    revisionId: number,
    fechaGeneracion: Date,
  ): Promise<{
    modelo: ClosureReportModelV1;
    contexto: ClosureReportContext;
    fingerprintEjecucion: string;
    fingerprintModelo: string;
  }> {
    const capturado = await captureClosureExecution(tx, projectId);
    const modelo = projectClosureModel(capturado.ejecucion);
    const fingerprintEjecucion = computeExecutionFingerprint({
      generatorVersion: CLOSURE_GENERATOR_VERSION,
      projectId,
      cicloRevisionOrigenId: revisionId,
      datosEjecucion: capturado.ejecucion,
      presentacion: capturado.presentacion,
    });
    const fingerprintModelo = computeModelFingerprint({
      modelo,
      fingerprintEjecucion,
      variante: 'AUTOMATICO',
    });
    return {
      modelo,
      contexto: buildReportContext({
        cicloRevisionOrigenId: revisionId,
        presentacion: capturado.presentacion,
        variante: 'AUTOMATICO',
        fechaGeneracion,
      }),
      fingerprintEjecucion,
      fingerprintModelo,
    };
  }

  /**
   * E105 (§28): genera el informe automático del borrador.
   *
   * Tres tiempos deliberados: una transacción BREVE captura el modelo y
   * reserva la fila; el render, el cifrado y la subida ocurren SIN ninguna
   * transacción abierta; una segunda transacción breve revalida y sustituye
   * el vínculo del slot cero. Sostener el lock durante el render dejaría el
   * proyecto inoperante para todo el equipo mientras se dibuja un PDF.
   */
  async generateAutoReport(
    projectId: number,
    actorId: number,
    revisionId: number,
  ): Promise<GeneratedReport> {
    const fechaGeneracion = new Date();

    // ── Tiempo 1: captura y reserva, bajo lock y breve ──────────────────
    const capturado = await this.requireRunner().run(
      projectId,
      actorId,
      'closure.generateAutoReport.capture',
      async (ctx) => {
        const { tx } = ctx;
        const proyecto = ctx.project;
        if (!proyecto) {
          throw new NotFoundException('Proyecto no encontrado');
        }
        await this.requirePolicy().assertWriteTx(tx, proyecto, 'CIERRE_PREPARACION', actorId);

        const revision = await tx.revisionCierreProyecto.findFirst({
          where: { idRevisionCierre: revisionId, idProyecto: projectId },
          select: { idRevisionCierre: true, estadoRevision: true },
        });
        // Una revisión de otro proyecto no existe para este: 404, no 403.
        if (!revision) {
          throw new NotFoundException(
            `Revisión de cierre ${revisionId} no encontrada en el proyecto ${projectId}`,
          );
        }
        if (revision.estadoRevision !== 'BORRADOR') {
          throw new ConflictException('Solo se genera el informe sobre un borrador');
        }

        // Los predicados de ejecución, EXCEPTO los tres documentales.
        const resumen = await this.requireReadiness().evaluate(tx, projectId, {
          phase: 'REQUEST',
          revisionId,
        });
        const bloqueantes = resumen.blockers.filter(
          (blocker) => !CODIGOS_EXCLUIDOS_AL_GENERAR.includes(blocker.code),
        );
        if (bloqueantes.length > 0) {
          throw new ConflictException({
            statusCode: 409,
            code: 'CIERRE_NO_LISTO',
            message: 'El proyecto no cumple las condiciones para generar su informe',
            blockers: bloqueantes,
          });
        }

        const modelo = await this.buildModelTx(tx, projectId, revisionId, fechaGeneracion);
        const documento = await this.requireDocuments().reserveGeneratedTx(tx, {
          projectId,
          revisionId,
          tipoDocumento: 'INFORME_AUTOMATICO',
          nombreArchivo: `informe-automatico-${projectId}-${revisionId}.pdf`,
          actorId,
          generatorVersion: CLOSURE_GENERATOR_VERSION,
          fingerprintEjecucion: modelo.fingerprintEjecucion,
          fingerprintModelo: modelo.fingerprintModelo,
          contextoReporte: modelo.contexto as unknown as Prisma.InputJsonValue,
        });
        return { ...modelo, documentId: documento.idDocumentoCierre };
      },
    );

    // ── Tiempo 2: render, cifrado y subida SIN transacción abierta ──────
    const { pdf } = this.render(capturado.modelo, capturado.contexto);
    // §25/§28: el Buffer final se valida ANTES de cifrar y de contactar al
    // proveedor. Un informe demasiado grande se rechaza entero: recortar
    // contribuciones para que quepa falsearía la entrega.
    this.assertRenderedSize(pdf);
    const subido = await this.requireDocuments().uploadGenerated(
      capturado.documentId,
      projectId,
      pdf,
    );

    // ── Tiempo 3: revalidar y sustituir el vínculo del slot cero ────────
    return this.requireRunner().run(
      projectId,
      actorId,
      'closure.generateAutoReport.finalize',
      async (ctx) => {
        const { tx } = ctx;
        const proyecto = ctx.project;
        if (!proyecto) {
          throw new NotFoundException('Proyecto no encontrado');
        }
        await this.requirePolicy().assertWriteTx(tx, proyecto, 'CIERRE_PREPARACION', actorId);

        // La ejecución no puede haber cambiado mientras se renderizaba: si lo
        // hizo, este PDF describe un proyecto que ya no existe.
        const ahora = await this.buildModelTx(tx, projectId, revisionId, fechaGeneracion);
        if (ahora.fingerprintEjecucion !== capturado.fingerprintEjecucion) {
          throw new ConflictException({
            statusCode: 409,
            code: 'INFORME_DESACTUALIZADO',
            message: 'La ejecución cambió mientras se generaba el informe',
          });
        }

        const disponible = await tx.documentoCierre.updateMany({
          where: { idDocumentoCierre: capturado.documentId, estadoDocumento: 'RESERVADO' },
          data: {
            estadoDocumento: 'DISPONIBLE',
            disponibleEn: new Date(),
            cargaIniciadaEn: new Date(),
            cargaLimiteEn: new Date(Date.now() + 7_200_000),
            assetId: subido.identidad.assetId ?? null,
            versionRemota: subido.identidad.version ?? null,
            tamanoBytes: BigInt(subido.tamanoBytes),
            tamanoCifradoBytes: BigInt(subido.tamanoCifradoBytes),
            checksumSha256: subido.checksumSha256,
            checksumCifradoSha256: subido.checksumCifradoSha256,
            cryptoMetadata: subido.metadata as unknown as Prisma.InputJsonValue,
          },
        });
        if (disponible.count !== 1) {
          throw new ConflictException('La reserva del informe ya fue resuelta');
        }

        // El slot cero es del informe automático. El anterior pierde su
        // vínculo y queda como candidato a purga: sus bytes no se tocan.
        const anterior = await tx.documentoRevisionCierre.findFirst({
          where: { idRevisionCierre: revisionId, orden: 0 },
          select: { idDocumentoRevision: true, idDocumentoCierre: true },
        });
        if (anterior) {
          await tx.documentoRevisionCierre.delete({
            where: { idDocumentoRevision: anterior.idDocumentoRevision },
          });
        }
        await tx.documentoRevisionCierre.create({
          data: {
            idRevisionCierre: revisionId,
            idDocumentoCierre: capturado.documentId,
            orden: 0,
          },
        });

        await this.requireAudit().registrarEvento({
          tx,
          tipoEvento: TipoEventoBitacora.CLOSURE_AUTOREPORT_GENERATED,
          idActor: actorId,
          idProyecto: projectId,
          tipoEntidad: 'DOCUMENTO_CIERRE',
          idEntidad: capturado.documentId,
          valorAnterior:
            anterior === null ? null : { documentoSustituido: anterior.idDocumentoCierre },
          valorNuevo: {
            idRevisionCierre: revisionId,
            checksumSha256: subido.checksumSha256,
            fingerprintEjecucion: capturado.fingerprintEjecucion,
            fingerprintModelo: capturado.fingerprintModelo,
            generatorVersion: CLOSURE_GENERATOR_VERSION,
          },
        });

        return {
          documentId: capturado.documentId,
          revisionId,
          fingerprintEjecucion: capturado.fingerprintEjecucion,
          fingerprintModelo: capturado.fingerprintModelo,
          documentoSustituido: anterior?.idDocumentoCierre ?? null,
        };
      },
    );
  }

  /**
   * §25: el límite se aplica a la SALIDA del renderer igual que a una carga
   * del usuario. Nunca se omite información para caber: si el informe no
   * entra, el problema es el límite, no los datos.
   */
  protected assertRenderedSize(pdf: Buffer): void {
    if (pdf.length > MAX_DOCUMENT_SIZE) {
      throw new PayloadTooLargeException({
        statusCode: 413,
        code: DOCUMENTO_DEMASIADO_GRANDE,
        message: 'El informe generado supera el tamaño máximo permitido',
      });
    }
  }

  private requireRunner(): ProjectTransactionService {
    if (!this.projectTx) {
      throw new NotFoundException('El servicio de informes no tiene runner transaccional');
    }
    return this.projectTx;
  }

  private requirePolicy(): ProjectPolicyService {
    if (!this.policy) {
      throw new NotFoundException('El servicio de informes no tiene política de escritura');
    }
    return this.policy;
  }

  private requireReadiness(): ProjectCloseReadinessService {
    if (!this.readiness) {
      throw new NotFoundException('El servicio de informes no tiene evaluador de preparación');
    }
    return this.readiness;
  }

  private requireDocuments(): ProjectClosureDocumentsService {
    if (!this.documents) {
      throw new NotFoundException('El servicio de informes no tiene acceso a documentos');
    }
    return this.documents;
  }

  private requireAudit(): BitacoraEventosService {
    if (!this.bitacoraEventos) {
      throw new NotFoundException('El servicio de informes no tiene bitácora');
    }
    return this.bitacoraEventos;
  }

}
