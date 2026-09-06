import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectReadPolicyService } from '../common/project-policy/project-read-policy.service';
import type { AdminProjectsQueryDto } from './dto/admin-projects-query.dto';

/**
 * C121 (06 v2 §34/§40/§46): lecturas históricas y administrativas de proyecto.
 *
 * Es un servicio de LECTURA sin ninguna ruta de escritura: componer la vista
 * de un proyecto cerrado no puede, por definición, alterarlo. Cada método
 * decide con `ProjectReadPolicyService`, que es el único decisor de lectura;
 * no se construye aquí una segunda autorización.
 *
 * Esqueleto en C121: las composiciones llegan en los commits que las
 * contratan y el módulo todavía no se registra.
 */

export interface HistoricalProjectView {
  projectId: number;
  [clave: string]: unknown;
}

export interface AdminProjectsPage {
  items: Array<Record<string, unknown>>;
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class HistoricalProjectReadService {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly readPolicy: ProjectReadPolicyService,
  ) {}

  /** E116: bandeja administrativa por grupo. */
  adminList(_actorId: number, _query: AdminProjectsQueryDto): Promise<AdminProjectsPage> {
    return Promise.reject(new Error('adminList todavía no está implementado'));
  }

  /** E117: detalle administrativo de un proyecto. */
  adminDetail(_actorId: number, _projectId: number): Promise<HistoricalProjectView> {
    return Promise.reject(new Error('adminDetail todavía no está implementado'));
  }

  /** E118: vista histórica autenticada del proyecto cerrado. */
  historicalProject(_projectId: number, _actorId: number): Promise<HistoricalProjectView> {
    return Promise.reject(new Error('historicalProject todavía no está implementado'));
  }

  /** §15: proyección de las contribuciones de tareas eliminadas. */
  deletedContributions(
    _projectId: number,
    _actorId: number,
  ): Promise<Array<Record<string, unknown>>> {
    return Promise.reject(new Error('deletedContributions todavía no está implementado'));
  }
}
