import { Module } from '@nestjs/common';
import { HorasSemestreController } from './horas-semestre.controller';
import { AdminHorasSemestreController } from './admin-horas-semestre.controller';
import { HorasSemestreService } from './horas-semestre.service';

@Module({
  controllers: [HorasSemestreController, AdminHorasSemestreController],
  providers: [HorasSemestreService],
  exports: [HorasSemestreService],
})
export class HorasSemestreModule {}
