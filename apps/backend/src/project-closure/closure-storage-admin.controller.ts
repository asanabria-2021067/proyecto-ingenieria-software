import { Controller, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClosureCleanupService } from './closure-cleanup.service';

/**
 * C127 (06 v2 §41 E120): superficie administrativa del almacenamiento de
 * cierre. El barrido es una operación de mantenimiento, no del ciclo de vida
 * del proyecto, y por eso vive en su propio controller.
 */
@Controller('admin/cierre/storage')
@UseGuards(JwtAuthGuard)
export class ClosureStorageAdminController {
  constructor(protected readonly cleanup: ClosureCleanupService) {}
}
