import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProjectsModule } from './projects/projects.module';
import { ApplicationsModule } from './applications/applications.module';
import { TasksModule } from './tasks/tasks.module';
import { EvidenceModule } from './evidence/evidence.module';
import { ValidationModule } from './validation/validation.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CatalogsModule } from './catalogs/catalogs.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    ApplicationsModule,
    TasksModule,
    EvidenceModule,
    ValidationModule,
    NotificationsModule,
    CatalogsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
