import { Module } from '@nestjs/common';
import { ErpB2mmlAdapterService } from './erp-b2mml-adapter.service';
import { B2MMLParser, B2MMLBuilder } from './b2mml-parser';
import { MessagingModule } from '../../infrastructure/messaging/messaging.module';

@Module({
  imports: [MessagingModule],
  providers: [B2MMLParser, B2MMLBuilder, ErpB2mmlAdapterService],
  exports: [ErpB2mmlAdapterService, B2MMLParser, B2MMLBuilder],
})
export class ErpB2mmlAdapterModule {}
