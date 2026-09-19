import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { UserNameSearchService } from './user-name-search.service';

/** Mismo criterio que ProjectPolicyModule: solo depende de Prisma, se importa donde haga falta. */
@Module({
  imports: [PrismaModule],
  providers: [UserNameSearchService],
  exports: [UserNameSearchService],
})
export class UserNameSearchModule {}
