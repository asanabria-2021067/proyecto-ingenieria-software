import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { SocialFeedService } from './social-feed.service';

@Module({
  imports: [NotificationsModule],
  controllers: [SocialController],
  providers: [SocialService, SocialFeedService],
  exports: [SocialService],
})
export class SocialModule {}
