import {
  BadRequestException,
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
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
