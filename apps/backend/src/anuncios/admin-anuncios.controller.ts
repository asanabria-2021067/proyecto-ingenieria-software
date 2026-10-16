import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AnunciosService } from './anuncios.service';
import { CreateAnuncioDto } from './dto/create-anuncio.dto';
import { UpdateAnuncioDto } from './dto/update-anuncio.dto';

@Controller('admin/anuncios')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador')
export class AdminAnunciosController {
  constructor(private anunciosService: AnunciosService) {}

  @Get()
  list() {
    return this.anunciosService.listAdmin();
  }

  @Post()
  create(@Body() dto: CreateAnuncioDto) {
    return this.anunciosService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAnuncioDto) {
    return this.anunciosService.update(id, dto);
  }

  @Patch(':id/despublicar')
  despublicar(@Param('id', ParseIntPipe) id: number) {
    return this.anunciosService.despublicar(id);
  }
}
