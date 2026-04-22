import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CatalogsService } from './catalogs.service';
import { CreateCatalogItemDto } from './dto/create-catalog-item.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller()
export class CatalogsController {
  constructor(private catalogsService: CatalogsService) {}

  @Get('catalogs')
  findAll() {
    return this.catalogsService.findAll();
  }

  @Get('carreras')
  findCarreras() {
    return this.catalogsService.findCarreras();
  }

  @Get('habilidades')
  findHabilidades() {
    return this.catalogsService.findHabilidades();
  }

  @Get('intereses')
  findIntereses() {
    return this.catalogsService.findIntereses();
  }

  @Get('cualidades')
  findCualidades() {
    return this.catalogsService.findCualidades();
  }

  @Post('habilidades')
  @UseGuards(JwtAuthGuard)
  createHabilidad(@Body() dto: CreateCatalogItemDto) {
    return this.catalogsService.createHabilidad(dto);
  }

  @Post('intereses')
  @UseGuards(JwtAuthGuard)
  createInteres(@Body() dto: CreateCatalogItemDto) {
    return this.catalogsService.createInteres(dto);
  }

  @Post('cualidades')
  @UseGuards(JwtAuthGuard)
  createCualidad(@Body() dto: CreateCatalogItemDto) {
    return this.catalogsService.createCualidad(dto);
  }
}
