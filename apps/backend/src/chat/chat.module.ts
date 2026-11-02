import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ChatController } from './chat.controller';
import { ChatArchivadoController } from './chat-archivado.controller';
import { ChatCanalesController } from './chat-canales.controller';
import { ChatCanalesService } from './chat-canales.service';
import { ChatService } from './chat.service';
import { ChatEstadoController } from './chat-estado.controller';
import { ChatEstadoService } from './chat-estado.service';
import { MensajesProgramadosService } from './mensajes-programados.service';
import { MensajesProgramadosController } from './mensajes-programados.controller';
import { ChatGateway } from './chat.gateway';
import { ChatMensajesExtrasController } from './chat-mensajes-extras.controller';
import { ChatTarjetasService } from './chat-tarjetas.service';
import { RecordatoriosMensajeService } from './recordatorios-mensaje.service';
import { LinkPreviewService } from './link-preview/link-preview.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { getJwtSecretFromConfig } from '../config/jwt-secret';
import { WsAuthService } from '../ws-auth/ws-auth.service';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    StorageModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: getJwtSecretFromConfig(config),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [ChatController, ChatArchivadoController, ChatEstadoController, MensajesProgramadosController, ChatCanalesController, ChatMensajesExtrasController],
  // G07 (OWASP25-C025): política del handshake con el JwtService de este módulo.
  providers: [ChatService, ChatCanalesService, ChatEstadoService, ChatGateway, WsAuthService, MensajesProgramadosService, LinkPreviewService, ChatTarjetasService, RecordatoriosMensajeService],
  exports: [ChatCanalesService, ChatService, ChatGateway],
})
export class ChatModule {}
