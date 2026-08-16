import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import * as redisStore from 'cache-manager-redis-store';
import { AppController } from './app.controller';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
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
import { RevisionesModule } from './revisiones/revisiones.module';
import { ComentariosModule } from './comentarios/comentarios.module';
import { MensajesRevisionModule } from './mensajes-revision/mensajes-revision.module';
import { AdminModule } from './admin/admin.module';
import { LabelsModule } from './labels/labels.module';
import { RolesModule } from './roles/roles.module';
import { ProgressRecordsModule } from './progress-records/progress-records.module';
import { SprintsModule } from './sprints/sprints.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 10,
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 50,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 200,
      },
    ]),
    CacheModule.register({
      isGlobal: true,
      store: redisStore,
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      ttl: 300,
    }),
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
    RevisionesModule,
    ComentariosModule,
    MensajesRevisionModule,
    AdminModule,
    LabelsModule,
    RolesModule,
    ProgressRecordsModule,
    SprintsModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}
