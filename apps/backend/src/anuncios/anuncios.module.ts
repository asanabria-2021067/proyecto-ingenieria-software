import { Module } from '@nestjs/common';
import { AssociationsModule } from '../associations/associations.module';
import { AnunciosController } from './anuncios.controller';
import { AdminAnunciosController } from './admin-anuncios.controller';
import { AsociacionAnunciosController, OrganizacionAnunciosController } from './anuncios-entidad.controller';
import { AnunciosEntidadService } from './anuncios-entidad.service';
import { AnunciosService } from './anuncios.service';

@Module({
  imports: [AssociationsModule],
  controllers: [AnunciosController, AdminAnunciosController, OrganizacionAnunciosController, AsociacionAnunciosController],
  providers: [AnunciosService, AnunciosEntidadService],
})
export class AnunciosModule {}
