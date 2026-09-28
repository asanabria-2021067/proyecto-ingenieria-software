import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ChatController } from './chat.controller';
import { ChatArchivadoController } from './chat-archivado.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { getJwtSecretFromConfig } from '../config/jwt-secret';
import { WsAuthService } from '../ws-auth/ws-auth.service';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: getJwtSecretFromConfig(config),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [ChatController, ChatArchivadoController],
  // G07 (OWASP25-C025): política del handshake con el JwtService de este módulo.
  providers: [ChatService, ChatGateway, WsAuthService],
})
export class ChatModule {}
