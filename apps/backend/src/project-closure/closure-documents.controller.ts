import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProjectWriteGuard } from '../common/guards/project-write.guard';
import { ProjectWrite, type ProjectWriteMetadata } from '../common/guards/project-write.metadata';
import { CLOSURE_TICKET_MAX_BYTES } from '../storage/closure-ticket.service';
import { ReserveDocumentDto } from './dto/reserve-document.dto';
import { MAX_DOCUMENT_SIZE, ProjectClosureDocumentsService } from './project-closure-documents.service';

/**
 * C113/C116 (06 v2 §25/§26/§41 E106–E107): reserva y carga de documentos de cierre.
 *
 * El multipart trae exactamente DOS partes: el ticket de aplicación y el
 * archivo. Los límites se declaran aquí para que un exceso se rechace en el
 * borde, antes de materializar diez megabytes en memoria, y se vuelven a
 * comprobar en el service porque `Content-Length` es un dato del cliente.
 */
const CLOSURE_EVIDENCE_WRITE: ProjectWriteMetadata = {
  source: { kind: 'param', name: 'projectId' },
  states: ['E', 'S'],
  sprint: 'ANY',
  family: 'CIERRE_EVIDENCIAS',
};

@Controller('proyectos/:projectId/cierre/documentos')
@UseGuards(JwtAuthGuard)
export class ClosureDocumentsController {
  constructor(private readonly documents: ProjectClosureDocumentsService) {}

  /** E106: reserva y permiso de carga; el cliente no recibe firma del proveedor. */
  @Post('firma')
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(CLOSURE_EVIDENCE_WRITE)
  reserve(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
    @Body() dto: ReserveDocumentDto,
  ) {
    return this.documents.reserve(projectId, user.userId, dto);
  }

  /** E109: permiso de lectura; la URL es del backend, nunca del proveedor. */
  @Get(':documentId/url')
  readUrl(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('documentId', ParseIntPipe) documentId: number,
    @CurrentUser() user: { userId: number },
  ) {
    return this.documents.getReadUrl(projectId, documentId, user.userId);
  }

  /**
   * E110: bytes del documento, servidos INLINE por el backend.
   *
   * Nunca redirige al origen: la respuesta lleva el PDF ya descifrado y
   * verificado, con cabeceras que impiden que un intermediario lo guarde o
   * que el navegador adivine otro tipo de contenido. Un `Range` recibe la
   * respuesta completa: con diez megabytes de techo no hace falta descifrado
   * parcial.
   */
  @Get(':documentId/contenido')
  @Header('Content-Type', 'application/pdf')
  @Header('Cache-Control', 'private, no-store')
  @Header('Referrer-Policy', 'no-referrer')
  @Header('X-Content-Type-Options', 'nosniff')
  async readContent(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('documentId', ParseIntPipe) documentId: number,
    @CurrentUser() user: { userId: number },
    @Query('ticket') ticket: string,
    @Res() res: Response,
  ): Promise<void> {
    const { bytes, nombreArchivo } = await this.documents.readContent(
      projectId,
      documentId,
      user.userId,
      ticket,
    );
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${nombreArchivo.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
    );
    res.setHeader('Content-Length', String(bytes.length));
    res.status(200).end(bytes);
  }

  /** E107: multipart `{ticket,file}` con el límite exacto del contrato. */
  @Post()
  @UseGuards(ProjectWriteGuard)
  @ProjectWrite(CLOSURE_EVIDENCE_WRITE)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        // Exactamente dos partes: el ticket y el archivo.
        files: 1,
        fields: 1,
        parts: 2,
        fieldNameSize: 64,
        fieldSize: CLOSURE_TICKET_MAX_BYTES,
        // El límite del ARCHIVO es el del contrato, sin descuentos. El margen
        // de framing (MULTIPART_OVERHEAD_BYTES) es holgura del request
        // completo y nunca se resta de este número.
        fileSize: MAX_DOCUMENT_SIZE,
        headerPairs: 32,
      },
    }),
  )
  upload(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
    @Body('ticket') ticket: string,
    @UploadedFile() file?: { buffer: Buffer; size?: number },
  ) {
    if (!file) {
      throw new BadRequestException('No se recibió el archivo del documento');
    }
    // Se pasan los BYTES REALES recibidos: `size` y `Content-Length` los
    // declara el cliente y no deciden el límite.
    return this.documents.uploadAndAttach(projectId, user.userId, ticket, file.buffer);
  }
}
