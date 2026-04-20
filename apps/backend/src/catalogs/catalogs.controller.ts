import { Controller, Get } from '@nestjs/common';
import { CatalogsService } from './catalogs.service';

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
}
