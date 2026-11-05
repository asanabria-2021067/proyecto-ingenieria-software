import { Module } from '@nestjs/common';
import { GlobalSearchController } from './global-search.controller';
import { GlobalSearchService } from './global-search.service';
import { ChatModule } from '../chat/chat.module';
import { UserNameSearchModule } from '../common/search/user-name-search.module';

@Module({
  imports: [UserNameSearchModule, ChatModule],
  controllers: [GlobalSearchController],
  providers: [GlobalSearchService],
})
export class GlobalSearchModule {}
