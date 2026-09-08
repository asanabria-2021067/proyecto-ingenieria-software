import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import * as redisStore from 'cache-manager-redis-store';
import { buildEnvOptions } from './config/env.options';
import { AppController } from './app.controller';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectPolicyModule } from './common/project-policy/project-policy.module';
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
import { TimeRecordsModule } from './time-records/time-records.module';
import { SprintsModule } from './sprints/sprints.module';
import { TaskHourAdjustmentsModule } from './task-hour-adjustments/task-hour-adjustments.module';
import { StorageModule } from './storage/storage.module';
import { ProjectClosureModule } from './project-closure/project-closure.module';
import { LeadershipModule } from './leadership/leadership.module';
import { ExitRequestsModule } from './exit-requests/exit-requests.module';
import { TeamModule } from './team/team.module';
import { SocialModule } from './social/social.module';
import { ChatModule } from './chat/chat.module';
import { BitacoraModule } from './bitacora/bitacora.module';

@Module({
  imports: [
    ConfigModule.forRoot(buildEnvOptions()),
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
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        store: redisStore,
        host: config.get<string>('app.redis.host'),
        port: config.get<number>('app.redis.port'),
        ttl: 300,
      }),
    }),
    PrismaModule,
    ProjectPolicyModule,
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
    TimeRecordsModule,
    SprintsModule,
    TaskHourAdjustmentsModule,
    StorageModule,
    ProjectClosureModule,
    LeadershipModule,
    ExitRequestsModule,
    TeamModule,
    SocialModule,
    ChatModule,
    BitacoraModule,
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
