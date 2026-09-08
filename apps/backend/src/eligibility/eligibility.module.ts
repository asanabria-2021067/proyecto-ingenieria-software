import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProjectPolicyModule } from '../common/project-policy/project-policy.module';
import { ProjectEligibilityService } from './project-eligibility.service';

/**
 * C068 (06 v2 §39/§48): módulo de elegibilidad. Importa Policy y NUNCA Tasks:
 * la elegibilidad es una dependencia de Tasks, Roles, Salidas y Liderazgo, no
 * al revés, y esa dirección es lo que evita el ciclo.
 */
@Module({
  imports: [PrismaModule, ProjectPolicyModule],
  providers: [ProjectEligibilityService],
  exports: [ProjectEligibilityService],
})
export class EligibilityModule {}
