import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GlobalSearchService } from './global-search.service';
import { GlobalSearchQueryDto } from './dto/global-search-query.dto';

/**
 * T-270/HU-171: único endpoint de búsqueda transversal (proyectos + personas
 * + tareas), agrupado por tipo y acotado a lo que el usuario autenticado
 * puede ver — ver GlobalSearchService para el detalle de permisos por tipo.
 */
@Controller('busqueda')
@UseGuards(JwtAuthGuard)
export class GlobalSearchController {
  constructor(private readonly globalSearch: GlobalSearchService) {}

  @Get()
  buscar(@Query() dto: GlobalSearchQueryDto, @CurrentUser() user: { userId: number }) {
    return this.globalSearch.buscar(user.userId, dto.q);
  }
}
