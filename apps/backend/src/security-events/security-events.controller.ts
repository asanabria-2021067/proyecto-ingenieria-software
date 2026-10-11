import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminAccessGuard } from '../common/guards/admin-access.guard';
import { ListSecurityEventsQueryDto } from './dto/list-security-events-query.dto';
import type { SecurityEventsPageDto } from './dto/security-event.dto';
import { SecurityEventsQueryService } from './security-events-query.service';

/**
 * FG01-C05 (T-310): visor administrativo de eventos de seguridad.
 *
 * Solo lectura: este controlador no expone escritura, edición ni borrado de la
 * bitácora, ni un detalle por id. Los guards corren antes que la validación
 * de la consulta: sin sesión 401, sin el rol 403, y solo un administrador
 * llega a recibir un 400. El servicio repite la comprobación contra la base.
 */
@Controller('admin/eventos-seguridad')
@UseGuards(JwtAuthGuard, AdminAccessGuard)
export class SecurityEventsController {
  constructor(private readonly query: SecurityEventsQueryService) {}

  @Get()
  list(
    @CurrentUser() user: { userId: number },
    @Query() query: ListSecurityEventsQueryDto,
  ): Promise<SecurityEventsPageDto> {
    return this.query.list(user.userId, query);
  }
}
