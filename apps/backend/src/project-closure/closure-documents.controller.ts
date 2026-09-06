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
import {
  MAX_DOCUMENT_SIZE,
  MULTIPART_OVERHEAD_BYTES,
  ProjectClosureDocumentsService,
} from './project-closure-documents.service';

/**
 * C113 (06 v2 §41 E106–E107): reserva y carga de documentos de cierre.
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
        files: 1,
        fields: 1,
        fieldSize: CLOSURE_TICKET_MAX_BYTES,
        fileSize: MAX_DOCUMENT_SIZE,
        // Margen de framing sobre el límite del archivo, no sobre el archivo.
        parts: 2,
        headerPairs: 32,
        fieldNameSize: MULTIPART_OVERHEAD_BYTES,
      },
    }),
  )
  upload(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: { userId: number },
    @Body('ticket') ticket: string,
    @UploadedFile() file?: { buffer: Buffer; size: number },
  ) {
    if (!file) {
      throw new BadRequestException('No se recibió el archivo del documento');
    }
    return this.documents.uploadAndAttach(projectId, user.userId, ticket, file.buffer);
  }
}
