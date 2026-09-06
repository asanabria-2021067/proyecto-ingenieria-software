import { Module } from '@nestjs/common';
import { ProjectClosureReportService } from './project-closure-report.service';

/**
 * C111 (06 v2 §38/§39): contenedor del cierre de proyecto.
 *
 * Nace aquí únicamente para alojar el render y NO se registra en `AppModule`:
 * mientras no exista ruta alguna, ningún documento puede generarse ni subirse.
 * Sus dependencias de dominio se incorporan en los commits que las contratan.
 */
@Module({
  providers: [ProjectClosureReportService],
  exports: [ProjectClosureReportService],
})
export class ProjectClosureModule {}
