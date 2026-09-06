import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProjectReadPolicyService } from '../common/project-policy/project-read-policy.service';
import { ProjectEligibilityService } from '../eligibility/project-eligibility.service';

/**
 * C091 (06 v2 §6/§20/§46): lecturas de liderazgo — contexto de Q1, candidatos,
 * historial, apelaciones y bandeja administrativa.
 *
 * Es un servicio de LECTURA: consultar el contexto o los candidatos no crea
 * apelación, rol ni participación, y la membresía nunca se infiere de
 * `HistorialLiderazgo`, que es historia factual y no una lista de integrantes.
 *
 * Esqueleto en C091: las consultas llegan en C092 (contexto/candidatos) y C096
 * (historial/apelaciones/bandeja).
 */
@Injectable()
export class LeadershipReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly readPolicy: ProjectReadPolicyService,
    private readonly eligibility: ProjectEligibilityService,
  ) {}
}
