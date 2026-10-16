import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { createKeyv } from '@keyv/redis';
import { buildEnvOptions } from './config/env.options';
import { isThrottlerDisabled } from './config/throttler';
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
import { GlobalSearchModule } from './search/global-search.module';
import { ExportsModule } from './exports/exports.module';
import { SecurityEventsModule } from './security-events/security-events.module';
import { EventsModule } from './events/events.module';
import { CalendarSharesModule } from './calendar-shares/calendar-shares.module';
import { AttendanceModule } from './attendance/attendance.module';
import { InsigniasModule } from './insignias/insignias.module';
import { AnunciosModule } from './anuncios/anuncios.module';

const skipThrottling = () => isThrottlerDisabled();

@Module({
  imports: [
    ConfigModule.forRoot(buildEnvOptions()),
    EventEmitterModule.forRoot(),
    // HU-160/T-238: instantánea diaria del Sprint activo (SprintSnapshotsService).
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 10,
        skipIf: skipThrottling,
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 50,
        skipIf: skipThrottling,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 200,
        skipIf: skipThrottling,
      },
    ]),
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      // T-292: cache-manager 7 solo usa stores de Keyv; la opción `store` de
      // cache-manager-redis-store se ignoraba y la caché quedaba en memoria.
      // Si Redis no responde, cada operación falla en silencio tras el
      // timeout y la lectura sigue contra la base. El TTL va en milisegundos.
      useFactory: (config: ConfigService) => ({
        stores: [
          createKeyv(`redis://${config.get<string>('app.redis.host')}:${config.get<number>('app.redis.port')}`, {
            throwOnConnectError: false,
            connectionTimeout: 200,
          }),
        ],
        ttl: 300_000,
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
    GlobalSearchModule,
    ExportsModule,
    // G05 (OWASP25-C037): writer best-effort de eventos de seguridad (global).
    SecurityEventsModule,
    EventsModule,
    CalendarSharesModule,
    AttendanceModule,
    InsigniasModule,
    AnunciosModule,
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
