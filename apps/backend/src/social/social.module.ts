import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { HorasSemestreModule } from '../horas-semestre/horas-semestre.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SocialController } from './social.controller';
import { PerfilSocialController } from './perfil-social.controller';
import { PerfilSocialService } from './perfil-social.service';
import { SocialService } from './social.service';
import { SocialFeedService } from './social-feed.service';

@Module({
  imports: [NotificationsModule, HorasSemestreModule, ChatModule],
  controllers: [SocialController, PerfilSocialController],
  providers: [SocialService, SocialFeedService, PerfilSocialService],
  exports: [SocialService, PerfilSocialService],
})
export class SocialModule {}
