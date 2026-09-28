import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ChatController } from './chat.controller';
import { ChatArchivadoController } from './chat-archivado.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { requireJwtSecret } from '../config/jwt-secret';
import { UserNameSearchModule } from '../common/search/user-name-search.module';

@Module({
  imports: [
    PrismaModule,
    UserNameSearchModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: requireJwtSecret(config.get<string>('JWT_SECRET')),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  controllers: [ChatController, ChatArchivadoController],
  providers: [ChatService, ChatGateway],
})
export class ChatModule {}
