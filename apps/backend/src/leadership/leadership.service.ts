import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ProjectTransactionService } from '../common/project-policy/project-transaction.service';
import { ProjectPolicyService } from '../common/project-policy/project-policy.service';
import { ProjectEligibilityService } from '../eligibility/project-eligibility.service';
import { BitacoraEventosService } from '../bitacora/bitacora-eventos.service';

/**
 * C091 (06 v2 §18/§19): escrituras de liderazgo — ciclo de vida de la
 * apelación y el motor ÚNICO de cambio de líder.
 *
 * `Proyecto.creadoPor` es la única fuente de verdad sobre quién lidera: este
 * servicio no introduce estado de exlíder, rol sintético, bandeja de expulsión
 * ni participación fabricada. Perder el liderazgo no crea ni destruye
 * membresía; lo que el saliente conserva se deriva de su participación real.
 *
 * Esqueleto en C091: crear (C093), cancelar (C094), denegar (C095) y el motor
 * de transferencia (C097/C098) llegan en sus propios commits.
 */
@Injectable()
export class LeadershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectTx: ProjectTransactionService,
    private readonly policy: ProjectPolicyService,
    private readonly eligibility: ProjectEligibilityService,
    private readonly notifications: NotificationsService,
    private readonly bitacoraEventos: BitacoraEventosService,
  ) {}
}
