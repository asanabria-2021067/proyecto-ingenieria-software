import { Module } from '@nestjs/common';
import { AnunciosController } from './anuncios.controller';
import { AdminAnunciosController } from './admin-anuncios.controller';
import { AnunciosService } from './anuncios.service';

@Module({
  controllers: [AnunciosController, AdminAnunciosController],
  providers: [AnunciosService],
})
export class AnunciosModule {}
